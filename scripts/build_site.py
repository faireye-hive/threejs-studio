#!/usr/bin/env python3
"""Copy the upstream editor into Pages artifact without committing upstream files."""
import shutil
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: build_site.py <three-source> <output>")
upstream, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
for rel in ("editor", "build", "examples/jsm", "examples/fonts"):
    src = upstream / rel
    if not src.exists():
        raise SystemExit(f"Missing upstream directory: {src}")
    shutil.copytree(src, output / rel, dirs_exist_ok=True)
for name in ("favicon.ico", "favicon_white.ico"):
    src = upstream / "files" / name
    if src.exists():
        dest = output / "files" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
for suffix in ("js", "css"):
    shutil.copy2(Path("studio") / f"bridge.{suffix}", output / "editor" / f"bridge.{suffix}")
index = output / "editor" / "index.html"
html = index.read_text(encoding="utf-8")
if "</body>" not in html:
    raise SystemExit("Three.js editor index structure changed; cannot inject bridge")
html = html.replace("</body>", '<link rel="stylesheet" href="./bridge.css">\n<script type="module" src="./bridge.js"></script>\n</body>', 1)
index.write_text(html, encoding="utf-8")
(output / "index.html").write_text('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./editor/"><title>Three.js Studio</title><a href="./editor/">Abrir Three.js Studio</a></html>\n', encoding="utf-8")
license = upstream / "LICENSE"
if license.exists():
    shutil.copy2(license, output / "THREEJS_LICENSE.txt")
(output / ".nojekyll").touch()
print(f"Assembled {output} successfully")
