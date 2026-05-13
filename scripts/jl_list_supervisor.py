#!/usr/bin/env python3

import subprocess
import sys
import time
from pathlib import Path


def append_line(path: Path, message: str) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}\n")
        handle.flush()


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "usage: jl_list_supervisor.py <run-log> <supervisor-log> <command-string>",
            file=sys.stderr,
        )
        return 1

    run_log = Path(sys.argv[1])
    supervisor_log = Path(sys.argv[2])
    command_string = sys.argv[3]

    cmd = [
        "node",
        "/Users/zhangrui2/Desktop/workSpace/ky/top-box-v2/SmartBuyFramework/cli.js",
        command_string,
    ]

    append_line(supervisor_log, "supervisor started")

    while True:
        with run_log.open("a", encoding="utf-8") as output:
            output.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} starting child\n")
            output.flush()
            child = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=output,
                start_new_session=True,
            )

        append_line(supervisor_log, f"child started pid={child.pid}")
        code = child.wait()
        append_line(supervisor_log, f"child exited code={code}")

        if code == 0:
            append_line(supervisor_log, "child exited cleanly, supervisor stopping")
            return 0

        time.sleep(2)


if __name__ == "__main__":
    raise SystemExit(main())
