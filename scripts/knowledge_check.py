#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAX_AGENTS_MD_LINES = 160

REQUIRED_PATHS = [
    ROOT / "AGENTS.md",
    ROOT / "docs" / "index.md",
    ROOT / "docs" / "core-beliefs.md",
    ROOT / "ARCHITECTURE.md",
    ROOT / "docs" / "plans" / "active",
    ROOT / "docs" / "plans" / "completed",
    ROOT / "docs" / "plans" / "plan-template.md",
    ROOT / "docs" / "plans" / "tech-debt-tracker.md",
]

RE_MD_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _fail(errors: list[str]) -> None:
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    raise SystemExit(1)


def _extract_local_link_targets(md_text: str) -> list[str]:
    targets: list[str] = []
    for m in RE_MD_LINK.finditer(md_text):
        raw = m.group(1).strip()
        if raw.startswith("<") and raw.endswith(">"):
            raw = raw[1:-1].strip()
        targets.append(raw)
    return targets


def _is_external_link(target: str) -> bool:
    lower = target.lower()
    return (
        lower.startswith("http://")
        or lower.startswith("https://")
        or lower.startswith("mailto:")
        or lower.startswith("tel:")
    )


def _resolve_target(from_file: Path, target: str) -> Path | None:
    if not target or target.startswith("#") or _is_external_link(target):
        return None

    path_part = target.split("#", 1)[0].strip()
    if not path_part:
        return None

    if path_part.startswith("/"):
        resolved = (ROOT / path_part.lstrip("/")).resolve()
    else:
        resolved = (from_file.parent / path_part).resolve()

    try:
        resolved.relative_to(ROOT)
    except ValueError:
        return Path(f"<outside-repo>:{resolved}")

    return resolved


def main() -> None:
    errors: list[str] = []

    for p in REQUIRED_PATHS:
        if not p.exists():
            errors.append(f"Missing required path: {p.relative_to(ROOT)}")

    agents_md = ROOT / "AGENTS.md"
    if agents_md.exists():
        line_count = len(_read_text(agents_md).splitlines())
        if line_count > MAX_AGENTS_MD_LINES:
            errors.append(
                f"AGENTS.md is {line_count} lines; must be <= {MAX_AGENTS_MD_LINES} (keep it a map)."
            )

    markdown_files = [
        ROOT / "AGENTS.md",
        ROOT / "docs" / "index.md",
        ROOT / "docs" / "core-beliefs.md",
        ROOT / "ARCHITECTURE.md",
    ]
    for md in markdown_files:
        if not md.exists():
            continue
        for target in _extract_local_link_targets(_read_text(md)):
            resolved = _resolve_target(md, target)
            if resolved is None:
                continue
            if str(resolved).startswith("<outside-repo>:"):
                errors.append(
                    f"{md.relative_to(ROOT)} links outside repo: ({target}) -> {resolved}"
                )
                continue
            if not resolved.exists():
                errors.append(
                    f"Broken link in {md.relative_to(ROOT)}: ({target}) -> {resolved.relative_to(ROOT)}"
                )

    if errors:
        _fail(errors)

    print("OK: knowledge base checks passed.")


if __name__ == "__main__":
    main()
