#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const JulianBabyAdapter = require('../SmartBuyFramework/platforms/julianbaby/JulianBabyAdapter');

function escapeKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function normalizePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

async function fetchAllProducts(adapter) {
  const rows = [];
  const seen = new Set();
  let page = 1;

  while (true) {
    const data = await adapter.request('post', '/market/market/getMarketList', {
      goods_type: 2,
      page,
      list_rows: 200,
      series_id: 0,
      market_type: 1,
      order: '',
      keywords: '',
      sort: '',
      add_deal_num: true,
    });

    const current = adapter.extractRows(data.data);
    if (current.length === 0) {
      break;
    }

    for (const item of current) {
      const id = Number(item?.id);
      const name = String(item?.name || item?.title || '').trim();
      if (!id || !name || seen.has(id)) {
        continue;
      }

      seen.add(id);
      rows.push({
        name,
        id,
        price: normalizePrice(item?.min_price ?? item?.reprice_limit),
      });
    }

    if (current.length < 200) {
      break;
    }

    page += 1;
  }

  return rows.sort((a, b) => b.id - a.id);
}

function buildModuleSource(products) {
  const lines = [
    '/**',
    ' * JulianBaby / Bull Box 平台商品配置',
    ' *',
    ' * 由 scripts/sync_julianbaby_products.js 自动生成。',
    ` * 最近一次同步时间: ${new Date().toISOString().slice(0, 10)}`,
    ' */',
    '',
    'module.exports = {',
  ];

  for (const product of products) {
    lines.push(`  ${escapeKey(product.name)}: {`);
    lines.push(`    id: ${product.id},`);
    lines.push(`    price: ${product.price},`);
    lines.push('  },');
  }

  lines.push('};', '');
  return lines.join('\n');
}

async function main() {
  const token = process.env.JB_TOKEN || process.env.JULIANBABY_TOKEN;
  const account = process.env.JB_ACCOUNT || process.env.JULIANBABY_ACCOUNT;
  const password = process.env.JB_PASSWORD || process.env.JULIANBABY_PASSWORD;

  const adapter = new JulianBabyAdapter(token || null);
  if (token) {
    const isValid = await adapter.validateToken(token);
    if (!isValid) {
      throw new Error('Provided token is invalid or expired.');
    }
  } else if (account && password) {
    await adapter.login({ account, password });
  } else {
    throw new Error(
      'Missing credentials. Set JB_TOKEN/JULIANBABY_TOKEN or JB_ACCOUNT+JB_PASSWORD.'
    );
  }

  const products = await fetchAllProducts(adapter);

  if (products.length === 0) {
    throw new Error('No products fetched from JulianBaby market list.');
  }

  const configPath = path.join(
    __dirname,
    '../SmartBuyFramework/config/products/julianbaby.js'
  );
  const jsonPath = path.join(
    __dirname,
    '../SmartBuyFramework/config/products/julianbaby.catalog.json'
  );

  fs.writeFileSync(configPath, buildModuleSource(products), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2) + '\n', 'utf8');

  console.log(`Synced ${products.length} products`);
  console.log(`Config: ${configPath}`);
  console.log(`Catalog: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
