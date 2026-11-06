"""打包 Chrome Web Store 上架用 ZIP。

只收錄執行期必要檔案（manifest、腳本、詞庫、圖示），不含測試、文件、log。
壓縮檔內路徑一律使用 '/'（Chrome Web Store 要求）。

用法：python build_zip.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent

FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "whitelist.js",
    "opencc_data_full.js",
    "dict_tw.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    out = ROOT / f"China2Taiwan_Dict-v{manifest['version']}.zip"

    # 確認 manifest 引用的檔案都在打包清單內
    referenced = set(manifest["background"]["service_worker"].split())
    for cs in manifest.get("content_scripts", []):
        referenced.update(cs.get("js", []))
    referenced.update(manifest.get("icons", {}).values())
    referenced.update(manifest.get("action", {}).get("default_icon", {}).values())
    missing = referenced - set(FILES)
    if missing:
        raise SystemExit(f"manifest 引用但未打包：{sorted(missing)}")

    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in FILES:
            src = ROOT / rel
            if not src.is_file():
                raise SystemExit(f"找不到檔案：{rel}")
            z.write(src, arcname=rel)  # rel 已是 '/' 分隔

    print(f"已產生 {out.name}（{out.stat().st_size:,} bytes，{len(FILES)} 個檔案）")


if __name__ == "__main__":
    main()
