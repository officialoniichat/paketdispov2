"""Map Wareneingangsbeleg text to ParsedReceipt (Anhang G.4 / §6.3).

The WE-Beleg is the article-level basis (POS -> many SKU lines). Structural
guardrail (Position != SKU-Zeile, F.2): each POS line opens a position and the
following EAN lines are nested under it, never flattened into positions.
"""

from __future__ import annotations

import re

from parser_worker.mapping.normalize import normalize_beleg_no, parse_de_date, parse_int
from parser_worker.models import ParsedReceipt, ParsedReceiptPosition, ParsedSkuLine

_HIGH = 0.95

_BELEGNR = re.compile(r"Beleg-?Nr\.?[:\s]+([\d.]+)", re.I)
_BUCHUNG = re.compile(r"Buchungsdatum[:\s]+([\d.]+)", re.I)

_POS = re.compile(r"^\s*POS\s+(\d+)", re.I)
_WGR = re.compile(r"WGR\s+(\S+)", re.I)
_ARTIKEL = re.compile(r"Artikel\s+(\S+)", re.I)
_FARBE = re.compile(r"Farbe\s+(\S+)", re.I)
_SHOP = re.compile(r"\bShop\s+(\S+)", re.I)
_HSHOP = re.compile(r"HShop\s+(\S+)", re.I)
_ETAGE = re.compile(r"Etage\s+(\S+)", re.I)

# Gr\S+ tolerates Größe / Groesse / Grösse (Anhang F: spelling variants).
_SKU = re.compile(
    r"^\s*EAN\s+(\S+)\s+Gr\S+\s+(\S+)\s+Menge\s+(\d+)",
    re.I,
)


def _grp(pattern: re.Pattern[str], line: str) -> str | None:
    match = pattern.search(line)
    return match.group(1) if match else None


def map_we_beleg(text: str) -> tuple[ParsedReceipt, dict[str, float]]:
    """Parse the WE-Beleg text into positions with nested SKU lines."""
    conf: dict[str, float] = {}

    we_beleg_no = normalize_beleg_no(_grp(_BELEGNR, text))
    booking_date = parse_de_date(_grp(_BUCHUNG, text))
    conf["receipt.weBelegNo"] = _HIGH if we_beleg_no else 0.0

    positions: list[ParsedReceiptPosition] = []
    current: ParsedReceiptPosition | None = None
    sku_count = 0

    for line in text.splitlines():
        pos_match = _POS.search(line)
        if pos_match:
            current = ParsedReceiptPosition(
                position_no=int(pos_match.group(1)),
                wgr=_grp(_WGR, line),
                supplier_article_no=_grp(_ARTIKEL, line),
                supplier_color=_grp(_FARBE, line),
                shop_no=_grp(_SHOP, line),
                h_shop_no=_grp(_HSHOP, line),
                floor=_grp(_ETAGE, line),
            )
            positions.append(current)
            continue

        sku_match = _SKU.search(line)
        if sku_match and current is not None:
            current.sku_lines.append(
                ParsedSkuLine(
                    ean=sku_match.group(1),
                    size=sku_match.group(2),
                    expected_quantity=parse_int(sku_match.group(3)) or 0,
                )
            )
            sku_count += 1

    conf["receipt.positions"] = _HIGH if positions else 0.0
    conf["receipt.skuLines"] = _HIGH if sku_count else 0.0

    receipt = ParsedReceipt(
        we_beleg_no=we_beleg_no,
        booking_date=booking_date,
        positions=positions,
    )
    return receipt, conf
