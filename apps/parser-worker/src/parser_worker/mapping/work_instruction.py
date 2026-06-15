"""Map Arbeitsanweisung text to ParsedWorkInstruction (Anhang G.1/G.4).

The work instruction is the operative rule source (H.1). This mapper translates
its head + numbered points into structured fields and reports per-field
confidence so low-quality extractions can be routed to ``needs_review``.
"""

from __future__ import annotations

import re

from parser_worker.guardrails import (
    check_mode_from_pruefung,
    goods_type_text_from,
    priority_flags_from,
)
from parser_worker.mapping.normalize import (
    normalize_beleg_no,
    parse_bool_de,
    parse_int,
    parse_position_list,
)
from parser_worker.models import (
    ParsedWorkInstruction,
    ParsedWorkInstructionHeader,
    ParsedWorkInstructionPosition,
)

_HIGH = 0.95  # found via an explicit labelled pattern
_DERIVED = 0.7  # derived/heuristic (e.g. positions inferred from a range)

_HEADER_PATTERNS: dict[str, re.Pattern[str]] = {
    "branch_no": re.compile(r"Filiale[:\s]+(\d+)", re.I),
    "storage_location_code": re.compile(r"Lagerplatz[:\s]+(\S+)", re.I),
    "shop_area_no": re.compile(r"Shopbereich[:\s]+(\d+)", re.I),
    "delivery_note_no": re.compile(r"Lieferschein[:\s]+(\S+)", re.I),
    "we_beleg_no": re.compile(r"Beleg-?Nr\.?[:\s]+([\d.]+)", re.I),
    "total_quantity": re.compile(r"Beleg-?Menge[:\s]+(\d+)", re.I),
}

_PRICE_LABEL = re.compile(r"Preisetikettendruck[:\s]+(\w+)", re.I)
_SORT = re.compile(r"sortieren[:\s]+(\w+)", re.I)
# Pr\S+ tolerates Prüfung / Pruefung / Prufung (Anhang F: spelling variants).
_PRUEFUNG = re.compile(r"Pr\S+\s+Wareneingang[:\s]+([^\n]+)", re.I)
_BOX = re.compile(r"Boxzettel[:\s]+(\w+)", re.I)
_ZST = re.compile(r"ZST\s+stempeln[:\s]+(\w+)", re.I)
_SECTION = re.compile(r"Abschnitt[:\s]+(\w+)", re.I)
_PROSPEKT = re.compile(r"Prospekt[:\s]+(\w+)", re.I)
_ETAGE = re.compile(r"Etage[:\s]+(\w+)", re.I)
# Capture only the number list AFTER "Positionen" so the leading point number
# ("8.", "10.") never leaks into the parsed position set.
_POS_LIST = re.compile(r"Position(?:en)?\s+([\d,\s–\-]+)", re.I)


def _line_containing(text: str, *needles: str) -> str | None:
    for line in text.splitlines():
        low = line.lower()
        if all(n.lower() in low for n in needles):
            return line
    return None


def _first(pattern: re.Pattern[str], text: str | None) -> str | None:
    if not text:
        return None
    match = pattern.search(text)
    return match.group(1) if match else None


def _positions_in(line: str | None) -> list[int]:
    """Parse the position numbers that follow the word 'Positionen' on a line."""
    if not line:
        return []
    match = _POS_LIST.search(line)
    return parse_position_list(match.group(1)) if match else []


def map_work_instruction(
    text: str,
) -> tuple[ParsedWorkInstruction, dict[str, float]]:
    """Parse the AW text. Returns the model and a per-field confidence map."""
    conf: dict[str, float] = {}
    header_kwargs: dict[str, object] = {}

    for field, pattern in _HEADER_PATTERNS.items():
        match = pattern.search(text)
        if not match:
            conf[f"workInstruction.header.{field}"] = 0.0
            continue
        value: object
        if field == "we_beleg_no":
            value = normalize_beleg_no(match.group(1))
        elif field == "delivery_note_no":
            value = normalize_beleg_no(match.group(1)) or match.group(1)
        elif field == "total_quantity":
            value = parse_int(match.group(1))
        else:
            value = match.group(1)
        header_kwargs[field] = value
        conf[f"workInstruction.header.{field}"] = _HIGH if value is not None else 0.0

    header_kwargs["price_label_print_required"] = parse_bool_de(_first(_PRICE_LABEL, text))
    header_kwargs["sort_by_article_color_size_required"] = parse_bool_de(_first(_SORT, text))
    header_kwargs["box_label_required"] = parse_bool_de(_first(_BOX, text))
    header_kwargs["zst_required"] = parse_bool_de(_first(_ZST, text))

    pruefung_raw = _first(_PRUEFUNG, text)
    check_mode = check_mode_from_pruefung(pruefung_raw)
    header_kwargs["goods_receipt_check_mode"] = check_mode
    if check_mode is not None and "%" in (pruefung_raw or ""):
        header_kwargs["goods_receipt_check_percentage"] = float(parse_int(pruefung_raw) or 0)
    conf["workInstruction.header.goodsReceiptCheckMode"] = _HIGH if check_mode else 0.0

    header = ParsedWorkInstructionHeader.model_validate(header_kwargs)

    # ---- Positions (point 4 range + point 8/10 per-position flags) ----
    point4 = _line_containing(text, "Position") or ""
    point8 = _line_containing(text, "Preisetiketten", "anbringen")
    point10 = _line_containing(text, "Sicherung")

    position_nos = _positions_in(point4)
    label_positions = set(_positions_in(point8)) if point8 else set()
    security_positions = set(_positions_in(point10)) if point10 else set()
    security_required_default = (
        point10 is not None and "nicht sichern" not in point10.lower()
    )

    section_text = _first(_SECTION, point4) or _first(_SECTION, text)
    nos_indicator = "nos" in point4.lower() or "nos" in text.lower()
    prospect_text = _first(_PROSPEKT, text)
    floor = _first(_ETAGE, text)

    positions = [
        ParsedWorkInstructionPosition(
            position_no=no,
            nos_indicator=nos_indicator,
            section_text=section_text,
            prospect_text=prospect_text,
            floor=floor,
            label_attach_required=(no in label_positions) if label_positions else None,
            security_required=(no in security_positions) and security_required_default
            if security_positions
            else None,
        )
        for no in position_nos
    ]
    conf["workInstruction.positions"] = _DERIVED if positions else 0.0

    # Guardrails: prio/NOS never become a section; section text is kept verbatim.
    work_instruction = ParsedWorkInstruction(
        header=header,
        positions=positions,
        priority_flags=priority_flags_from(text),
        section=None,
        goods_type_text=goods_type_text_from(section_text),
    )
    return work_instruction, conf
