"""Value normalisation helpers shared by the AW and WE-Beleg mappers.

Pure functions only – every helper returns ``None`` when the input cannot be
interpreted, so the caller can lower the field confidence instead of guessing
(Anhang H.4: assumptions must not be sold as facts).
"""

from __future__ import annotations

import re

# Beleg-Nr. "3.656.860" -> "3656860" (G.1). Keep digits only.
_NON_DIGITS = re.compile(r"\D+")
# German date DD.MM.YYYY.
_DE_DATE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
# Position lists: "1, 2, 3, 4, 5" or ranges "1-5" / "1–5".
_RANGE = re.compile(r"\b(\d+)\s*[-–]\s*(\d+)\b")
_INT = re.compile(r"\d+")


def normalize_beleg_no(raw: str | None) -> str | None:
    """Strip separators from a Beleg-/Lieferschein number (``3.656.860`` -> ``3656860``)."""
    if raw is None:
        return None
    digits = _NON_DIGITS.sub("", raw)
    return digits or None


def parse_bool_de(raw: str | None) -> bool | None:
    """Map German Ja/Nein (and common synonyms) to a bool; ``None`` if unclear."""
    if raw is None:
        return None
    token = raw.strip().lower()
    if token.startswith(("ja", "yes", "true")):
        return True
    if token.startswith(("nein", "no", "false")):
        return False
    return None


def parse_int(raw: str | None) -> int | None:
    """Extract the first integer from a string."""
    if raw is None:
        return None
    match = _INT.search(raw)
    return int(match.group()) if match else None


def parse_de_date(raw: str | None) -> str | None:
    """Convert a German ``DD.MM.YYYY`` date to ISO ``YYYY-MM-DD``."""
    if raw is None:
        return None
    match = _DE_DATE.search(raw)
    if not match:
        return None
    day, month, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def parse_position_list(raw: str | None) -> list[int]:
    """Parse ``1, 2, 3`` or a range ``1-5`` / ``1–5`` into sorted unique ints."""
    if raw is None:
        return []
    range_match = _RANGE.search(raw)
    if range_match:
        start, end = int(range_match.group(1)), int(range_match.group(2))
        if start <= end:
            return list(range(start, end + 1))
    return sorted({int(n) for n in _INT.findall(raw)})
