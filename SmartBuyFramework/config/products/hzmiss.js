/**
 * HzMiss平台商品配置
 * 
 * 商品名称到参数的映射配置
 * HzMiss平台不需要key参数，主要是collectionId和id
 */

module.exports = {
  "数字收藏A": {
    id: "collection123",
    collectionId: "123",
    price: 10
  },
  "数字收藏B": {
    id: "collection456", 
    collectionId: "456",
    price: 15
  },
  "限量版NFT": {
    id: "nft789",
    collectionId: "789",
    price: 50
  },
  "艺术作品集": {
    id: "art001",
    collectionId: "001", 
    price: 25
  },
  
  // 测试商品（用于测试）
  "测试收藏X": {
    id: "test-collection-x",
    collectionId: "testX",
    price: 5
  },
  "测试收藏Y": {
    id: "test-collection-y",
    collectionId: "testY",
    price: 8
  }
};