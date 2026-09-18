#!/usr/bin/env python3
"""
CutFree single-file build.

Inlines every local stylesheet, script and image reference into one standalone
HTML file, so the app runs from anywhere: a USB stick, an email attachment, a
`file://` double-click, or any static host. No build tooling, no network.

  index.html   -> cutfree.html           (video cutter / editor)
  studio.html  -> cutfree-studio.html    (auto video engine)

The studio keeps `data-module="<name>"` on the inlined engine scripts, which is
what lets "লিভিং HTML" export embed the render engine without refetching it.

Usage:  python3 tools/build-single-file.py
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

PAGES = [
    ("index.html", "cutfree.html"),
    ("studio.html", "cutfree-studio.html"),
    ("studio-pro.html", "cutfree-studio-pro.html"),
]

LINK_RE = re.compile(r'<link[^>]*href="(?P<href>[^"]+\.css)"[^>]*>', re.I)
SCRIPT_RE = re.compile(r'<script(?P<attrs>[^>]*?)\ssrc="(?P<src>[^"]+)"(?P<attrs2>[^>]*)></script>', re.I)
IMG_RE = re.compile(r'(?P<attr>src|href)="(?P<path>assets/[^"]+\.svg)"')


def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def data_uri(rel: str) -> str:
    raw = (ROOT / rel).read_bytes()
    suffix = rel.rsplit(".", 1)[-1].lower()
    mime = {"svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}.get(suffix, "application/octet-stream")
    return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")


def inline_page(src_name: str, out_name: str) -> int:
    html = read_text(src_name)

    # 1) stylesheets
    def css_sub(match: re.Match) -> str:
        href = match.group("href")
        return "<style>\n" + read_text(href).strip() + "\n</style>"

    html = LINK_RE.sub(css_sub, html)

    # 2) scripts, preserving attribute order and data-module hooks
    def js_sub(match: re.Match) -> str:
        src = match.group("src")
        if src.startswith("http"):
            return match.group(0)
        attrs = (match.group("attrs") or "") + (match.group("attrs2") or "")
        attrs = re.sub(r'\s+type="module"', "", attrs).strip()
        code = read_text(src).strip()
        return f"<script {attrs}>\n{code}\n</script>" if attrs else f"<script>\n{code}\n</script>"

    html = SCRIPT_RE.sub(js_sub, html)

    # 3) local images / favicons
    html = IMG_RE.sub(lambda m: f'{m.group("attr")}="{data_uri(m.group("path"))}"', html)

    # 4) markdown links that only exist in the repo shouldn't 404 in a single file
    html = html.replace('href="README.md"', 'href="https://github.com/"').replace('href="tests/e2e.js"', 'href="#"')
    # the manifest is a same-origin fetch (service worker), so leave it as a link

    left = [m for m in re.findall(r'(?:src|href)="(?!#|data:|https?:|mailto:)[^"]+"', html)
            if not m.endswith('.html"')                              # page-to-page links
            and 'manifest.webmanifest' not in m                      # fetched by the SW, not the page
            and not re.search(r"[+'\\]", m)]                       # JS string templates
    if left:
        print(f"  ! {src_name}: references left un-inlined: {left[:4]}", file=sys.stderr)

    out = ROOT / out_name
    out.write_text(html, encoding="utf-8")
    print(f"  built {out_name:24} {out.stat().st_size / 1024:7.1f} KB · no external requests")
    return 0


def main() -> int:
    print("CutFree single-file build")
    for src, out in PAGES:
        if not (ROOT / src).exists():
            print(f"  skipped {src} (missing)")
            continue
        inline_page(src, out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
