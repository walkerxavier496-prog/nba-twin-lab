#!/usr/bin/env python3
"""Read-only syntax and JSON checks for the exact release working tree."""
import ast
import json
from pathlib import Path
import subprocess


def main():
    files = subprocess.check_output(["git", "ls-files", "-z"], text=True).split("\0")
    for name in filter(None, files):
        path = Path(name)
        if path.suffix == ".json":
            json.loads(path.read_text())
        elif path.suffix == ".py":
            ast.parse(path.read_text(), filename=name)
        elif path.suffix in (".js", ".cjs"):
            subprocess.run(["node", "--check", name], check=True)
    print("Tracked JSON, Python and JavaScript syntax validated")


if __name__ == "__main__":
    main()
