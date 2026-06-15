"""Hard guardrails from Anhang F.2 / H, encoded as pure functions.

These are the rules the parser must never get wrong, even on a clean document:

* ``Prüfung Nein`` -> ``quantity_only`` (minimum quantity check stays), never ``none``.
* Prio is a flag, NEVER a section (Prio != Abschnitt).
* NOS is stored separately, NEVER equated with a section (NOS != Abschnitt).
* Position groups SKU lines (Position != SKU-Zeile) – enforced structurally in the
  WE-Beleg mapper, asserted here for completeness.
"""

from __future__ import annotations

from parser_worker.models import CheckMode

# GoodsTypeText enum (Anhang A / domain enums). Section text drives load-plan logic.
GOODS_TYPE_TEXTS = (
    "Vororder",
    "Nachorder",
    "Sonderposten",
    "NOS",
    "NOOS",
    "Extrabestellung",
    "NOS-Nachorder",
    "Prio",
)

# PriorityFlag enum (Anhang A / domain enums). NONE of these is a section.
_PRIORITY_KEYWORDS: dict[str, str] = {
    "prio": "prio",
    "catman": "catman_due",
    "überfällig": "overdue",
    "ueberfaellig": "overdue",
    "overdue": "overdue",
    "same day": "same_day_required",
    "taggleich": "same_day_required",
}


def check_mode_from_pruefung(raw: str | None) -> CheckMode | None:
    """Map 'Prüfung Wareneingang' to a CheckMode.

    Guardrail (G.1/F.2/H.1): 'Nein' means a minimum quantity check is STILL
    required, so it maps to ``quantity_only`` – never to a 'no check' state.
    """
    if raw is None:
        return None
    token = raw.strip().lower()
    if "%" in token or any(ch.isdigit() for ch in token):
        return CheckMode.PERCENTAGE_CHECK
    if token.startswith("nein"):
        return CheckMode.QUANTITY_ONLY
    if token.startswith("ja"):
        return CheckMode.FULL_CHECK
    return None


def goods_type_text_from(raw: str | None) -> str | None:
    """Return the canonical GoodsTypeText if the raw section/warenart text matches one."""
    if raw is None:
        return None
    token = raw.strip().lower()
    for canonical in GOODS_TYPE_TEXTS:
        if canonical.lower() in token:
            return canonical
    return None


def priority_flags_from(*texts: str | None) -> list[str]:
    """Detect priority flags from arbitrary header text.

    Guardrail (F.2/H.4): priority is its OWN signal. The result is a list of
    PriorityFlag values and is *never* turned into a section code by the caller.
    """
    found: list[str] = []
    haystack = " ".join(t.lower() for t in texts if t)
    for keyword, flag in _PRIORITY_KEYWORDS.items():
        if keyword in haystack and flag not in found:
            found.append(flag)
    return found
