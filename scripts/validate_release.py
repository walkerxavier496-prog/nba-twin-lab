#!/usr/bin/env python3
"""Read-only syntax and JSON checks for the exact release working tree."""
import ast
import json
from pathlib import Path
import subprocess
import yaml


class UniqueKeysLoader(yaml.BaseLoader):
    def construct_mapping(self, node, deep=False):
        keys = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in keys:
                raise ValueError(f"Duplicate YAML key: {key} at line {key_node.start_mark.line + 1}")
            keys.add(key)
        return super().construct_mapping(node, deep=deep)


def validate_yaml(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueKeysLoader)


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
        elif path.suffix in (".yml", ".yaml"):
            validate_yaml(path)
    print("Tracked JSON, Python, JavaScript and strict YAML syntax validated")


if __name__ == "__main__":
    main()
