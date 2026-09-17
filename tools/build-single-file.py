#!/usr/bin/env python3
"""
CutFree single-file build.

Inlines css/style.css, js/i18n.js, js/app.js and assets/logo.svg into one
standalone HTML file (cutfree.html) that runs from anywhere — a USB stick,
an email attachment, a `file://` double-click, or any static host.

Usage:  python3 tools/build-single-file.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT = ROOT / "cutfree.html"


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def data_uri(rel: str) -> str:
    raw = (ROOT / rel).read_bytes()
    return "data:image/svg+xml;base64," + base64.b64encode(raw).decode("ascii")


def main() -> int:
    html = read("index.html")

    # 1) inline the stylesheet
    css = read("css/style.css")
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css" />',
        "<style>\n" + css.strip() + "\n</style>",
    )

    # 2) inline the logo (header <img> + favicon)
    logo = data_uri("assets/logo.svg")
    html = html.replace('href="assets/logo.svg"', 'href="' + logo + '"')
    html = html.replace('src="assets/logo.svg"', 'src="' + logo + '"')

    # 3) inline the scripts, in order
    i18n = read("js/i18n.js")
    app = read("js/app.js")
    html = html.replace(
        '<script src="js/i18n.js"></script>\n<script src="js/app.js"></script>',
        "<script>\n" + i18n.strip() + "\n</script>\n<script>\n" + app.strip() + "\n</script>",
    )

    if 'src="js/' in html or 'href="css/' in html or 'assets/logo.svg' in html:
        print("warning: some external references were left un-inlined", file=sys.stderr)

    html = html.replace(
        "<title>",
        "<!-- CutFree single-file build — everything (CSS, JS, logo) is inlined.\n"
        "     Source: https://github.com/ (see README.md) · MIT license -->\n<title>",
        1,
    )

    OUT.write_text(html, encoding="utf-8")
    size = OUT.stat().st_size
    print(f"built {OUT.relative_to(ROOT)} — {size / 1024:.1f} KB, no external requests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
