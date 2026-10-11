#!/usr/bin/env python3
"""Empaqueta el motor original con diagnóstico para Chromium y Firefox."""

from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import zipfile


root = Path(__file__).resolve().parent.parent
output = root / "dist" / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
output.mkdir(parents=True, exist_ok=False)

for browser in ("chromium", "firefox"):
    name = f"tubemod-{browser}-original"
    target = output / name
    target.mkdir()
    shutil.copyfile(root / "LICENSE", target / "LICENSE")
    for folder in ("public", "scripts", "icons"):
        shutil.copytree(root / folder, target / folder)
    manifest_path = root / ("manifest_firefox.json" if browser == "firefox" else "manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["name"] = "TubeMod (original + diagnóstico)"
    (target / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    with zipfile.ZipFile(output / f"{name}.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(target.rglob("*")):
            if file.is_file():
                archive.write(file, file.relative_to(target))

print(output)
for archive in sorted(output.glob("*.zip")):
    print(f"  {archive.name} ({archive.stat().st_size:,} bytes)")
