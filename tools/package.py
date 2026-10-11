#!/usr/bin/env python3
"""Empaqueta los dos motores para Chromium y Firefox, sin dependencias externas."""

from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import zipfile


root = Path(__file__).resolve().parent.parent
output = root / "dist" / datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
output.mkdir(parents=True, exist_ok=False)

for browser in ("chromium", "firefox"):
    for variant in ("original", "optimized"):
        name = f"tubemod-{browser}-{variant}"
        target = output / name
        target.mkdir()
        shutil.copyfile(root / "LICENSE", target / "LICENSE")
        for folder in ("public", "scripts", "icons"):
            shutil.copytree(root / folder, target / folder)
        if variant == "original":
            shutil.copyfile(root / "variants/original/content.js", target / "scripts/content.js")
        manifest_path = root / ("manifest_firefox.json" if browser == "firefox" else "manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        label = "original" if variant == "original" else "optimizado"
        manifest["name"] = f"TubeMod ({label} + diagnóstico)"
        if browser == "firefox" and variant == "original":
            manifest["browser_specific_settings"]["gecko"]["id"] = "tubemod-original@extension.com"
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
