from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from lxml import html

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted(ROOT.glob("*.html"))
errors: list[str] = []
references: set[Path] = set()


def check_reference(raw: str, owner: Path) -> None:
    if not raw or raw.startswith(("#", "http://", "https://", "mailto:", "tel:", "javascript:", "data:image/svg+xml")):
        return
    clean = unquote(urlparse(raw).path)
    if not clean:
        return
    target = (owner.parent / clean).resolve()
    references.add(target)
    if not target.exists():
        errors.append(f"{owner.name}: missing local asset {raw}")


for path in HTML_FILES:
    source = path.read_text(encoding="utf-8")
    parser = html.HTMLParser(recover=False)
    try:
        doc = html.fromstring(source, parser=parser)
    except Exception as exc:
        errors.append(f"{path.name}: invalid HTML ({exc})")
        continue

    for element in doc.xpath("//*[@src or @href]"):
        for attribute in ("src", "href"):
            value = element.get(attribute)
            if value:
                check_reference(value, path)

    for match in re.findall(r"url\(\s*['\"]?([^)'\"]+)", source):
        check_reference(match, path)

    if source.count("assets/js/theme-init.js") != 1:
        errors.append(f"{path.name}: theme initializer is missing or duplicated")
    if source.count("assets/css/site-refresh.css") != 1:
        errors.append(f"{path.name}: shared stylesheet is missing or duplicated")
    if source.count("assets/js/theme.js") != 1:
        errors.append(f"{path.name}: theme controller is missing or duplicated")

    staff_links_in_nav = doc.xpath("//nav//a[contains(@href, 'acces-personnel.html')]")
    if staff_links_in_nav:
        errors.append(f"{path.name}: personal access link must not appear in navigation")

for css_path in ROOT.glob("assets/css/*.css"):
    source = css_path.read_text(encoding="utf-8")
    for match in re.findall(r"url\(\s*['\"]?([^)'\"]+)", source):
        check_reference(match, css_path)

if errors:
    print("VALIDATION FAILED")
    print("\n".join(f"- {error}" for error in errors))
    raise SystemExit(1)

print(f"Validated {len(HTML_FILES)} HTML files and {len(references)} local references.")
