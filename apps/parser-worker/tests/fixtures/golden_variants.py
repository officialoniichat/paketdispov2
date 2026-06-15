"""Golden-master VARIANT catalog (concept §17.2 / risk F.3 / Anhang H.2).

The two baseline PDFs in ``generate_pdfs.py`` only cover one happy path. The
concept explicitly lists a set of document characteristics as "nicht verifiziert"
in Anhang H.2 (Prio-Beleg, Sicherung=Ja, Onlineartikel, Rotpreis, Prüfung=%,
mehrere Shopbereiche, mehrseitiger Beleg, CatMan>0, ohne Etikettendruck,
Hängeware). Risk F.3 demands "20-30 echte Dokumentensätze als Golden-Master" so
parser confidence and ``needs_review`` routing are gated against real variants,
not just two examples.

This module defines that catalog as deterministic, self-describing specs and
materialises each one as a real text-layer PDF under ``golden/``. Every spec
carries its own assertions so the gate (``tests/test_golden_gate.py``) fails
loudly on any regression (§16.3 "Regressionstest für Parser-Templates vor
Deployment").

The specs are *synthetic* but structurally faithful to the Anhang G layout the
parser was built against; they encode the variant-defining field so a regression
in extraction OR a guardrail violation breaks the build.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from parser_worker.models import CheckMode, ParseJobResult, ParseStatus

GOLDEN_DIR = Path(__file__).parent / "golden"
VARIANT_DIR = GOLDEN_DIR / "variants"

# An assertion is run against the full ParseJobResult; it must raise on regression.
Assertion = Callable[[ParseJobResult], None]


@dataclass(frozen=True)
class VariantSpec:
    """One golden variant: AW + WE text, expected status and field assertions."""

    slug: str
    description: str
    aw_lines: list[str]
    we_lines: list[str]
    expected_status: ParseStatus
    assertions: list[Assertion] = field(default_factory=list)
    # Some degraded variants intentionally omit a document.
    include_work_instruction: bool = True
    include_goods_receipt: bool = True

    @property
    def aw_pdf(self) -> Path:
        return VARIANT_DIR / f"aw_{self.slug}.pdf"

    @property
    def we_pdf(self) -> Path:
        return VARIANT_DIR / f"we_{self.slug}.pdf"


# --------------------------------------------------------------------------- #
# WE-Beleg builders: keep SKU sums equal to Beleg-Menge so no plausibility
# warning shaves confidence on the *clean* variants.
# --------------------------------------------------------------------------- #
def _we(beleg_no: str, positions: list[str]) -> list[str]:
    return ["Wareneingangsbeleg", f"Beleg-Nr.: {beleg_no}   Buchungsdatum: 15.06.2026", *positions]


def _pos(
    no: int, *, shop: str = "21", floor: str = "EG", skus: list[tuple[str, str, int]]
) -> list[str]:
    head = (
        f"POS {no} WGR 1{no:02d} Artikel ART-0{no:02d} Farbe schwarz "
        f"Shop {shop} HShop {shop}0 Etage {floor}"
    )
    lines = [head]
    for ean, size, menge in skus:
        lines.append(f"EAN {ean} Größe {size} Menge {menge}")
    return lines


# --------------------------------------------------------------------------- #
# Assertion helpers (closures keep the catalog declarative and readable).
# --------------------------------------------------------------------------- #
def _expect_priority(*flags: str) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        for f in flags:
            assert f in r.work_instruction.priority_flags, (
                f"priority flag {f!r} missing, got {r.work_instruction.priority_flags}"
            )
        # Guardrail: a priority flag must NEVER become a section.
        assert r.work_instruction.section is None, "priority leaked into section"

    return check


def _expect_no_priority() -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        assert r.work_instruction.priority_flags == [], (
            f"unexpected priority flags {r.work_instruction.priority_flags}"
        )

    return check


def _expect_check_mode(mode: CheckMode, *, percentage: float | None = None) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        header = r.work_instruction.header
        assert header.goods_receipt_check_mode is mode, (
            f"check_mode {header.goods_receipt_check_mode} != {mode}"
        )
        if percentage is not None:
            assert header.goods_receipt_check_percentage == percentage
        # Guardrail H.1: the minimum quantity check is ALWAYS required, even for Nein.
        assert header.minimum_quantity_check_always_required is True

    return check


def _expect_price_label(value: bool) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        assert r.work_instruction.header.price_label_print_required is value

    return check


def _expect_security(value: bool) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        positions = r.work_instruction.positions
        assert positions, "no AW positions parsed"
        assert all(p.security_required is value for p in positions), (
            f"security_required not all {value}: "
            f"{[(p.position_no, p.security_required) for p in positions]}"
        )

    return check


def _expect_section_text(value: str) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        positions = r.work_instruction.positions
        assert positions, "no AW positions parsed"
        # Variant-defining text (Onlineartikel/Rotpreis/Hängeware) is kept verbatim
        # in section_text and is NOT promoted to a structured section.
        assert all(p.section_text == value for p in positions), (
            f"section_text != {value!r}: {[p.section_text for p in positions]}"
        )
        assert r.work_instruction.section is None

    return check


def _expect_distinct_shops(*shops: str) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.receipt is not None
        seen = {p.shop_no for p in r.receipt.positions}
        for s in shops:
            assert s in seen, f"shop {s!r} missing, got {sorted(seen)}"

    return check


def _expect_position_count(count: int) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.receipt is not None
        assert len(r.receipt.positions) == count, (
            f"expected {count} WE positions, got {len(r.receipt.positions)}"
        )

    return check


def _expect_sku_grouping(position_index: int, sku_count: int) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.receipt is not None
        pos = r.receipt.positions[position_index]
        # Guardrail F.2: Position groups SKU lines (Position != SKU-Zeile).
        assert len(pos.sku_lines) == sku_count, (
            f"POS {pos.position_no} should carry {sku_count} SKU lines, "
            f"got {len(pos.sku_lines)}"
        )

    return check


def _expect_goods_type(value: str | None) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.work_instruction is not None
        assert r.work_instruction.goods_type_text == value

    return check


def _expect_receipt_beleg_missing() -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert r.receipt is not None
        assert r.receipt.we_beleg_no is None, "expected unreadable WE Beleg-Nr."

    return check


def _expect_warning_contains(needle: str) -> Assertion:
    def check(r: ParseJobResult) -> None:
        assert any(needle in w for w in r.warnings), (
            f"expected a warning containing {needle!r}, got {r.warnings}"
        )

    return check


# --------------------------------------------------------------------------- #
# The catalog. Clean variants -> parsed; degraded variants -> needs_review.
# --------------------------------------------------------------------------- #
def _clean_variants() -> list[VariantSpec]:
    return [
        VariantSpec(
            slug="prio_beleg",
            description="Prio-Beleg: priority flag present, never a section (H.4)",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.001   Beleg-Menge: 2",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-2, Prio-Beleg, Abschnitt: Nachorder",
                "6. Prüfung Wareneingang: Ja",
                "10. Sicherungsetikett: Nicht sichern für Positionen 1, 2",
            ],
            we_lines=_we(
                "3.700.001",
                [
                    *_pos(1, skus=[("4001000000011", "S", 1)]),
                    *_pos(2, skus=[("4001000000028", "M", 1)]),
                ],
            ),
            expected_status=ParseStatus.PARSED,
            assertions=[
                _expect_priority("prio"),
                _expect_goods_type("Nachorder"),
                _expect_check_mode(CheckMode.FULL_CHECK),
            ],
        ),
        VariantSpec(
            slug="sicherung_ja",
            description="Sicherung=Ja yields securing tasks on the listed positions (G.5)",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.002   Beleg-Menge: 2",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-2, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
                "10. Sicherungsetikett: Sichern für Positionen 1, 2",
            ],
            we_lines=_we(
                "3.700.002",
                [
                    *_pos(1, skus=[("4001000000035", "S", 1)]),
                    *_pos(2, skus=[("4001000000042", "M", 1)]),
                ],
            ),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_security(True), _expect_no_priority()],
        ),
        VariantSpec(
            slug="onlineartikel",
            description="Onlineartikel text kept verbatim, not misread as a section",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.003   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Onlineartikel",
                "6. Prüfung Wareneingang: Nein",
            ],
            we_lines=_we("3.700.003", _pos(1, skus=[("4001000000059", "L", 1)])),
            expected_status=ParseStatus.PARSED,
            assertions=[
                _expect_section_text("Onlineartikel"),
                _expect_goods_type(None),  # not a known GoodsTypeText
                _expect_check_mode(CheckMode.QUANTITY_ONLY),
            ],
        ),
        VariantSpec(
            slug="rotpreis",
            description="Rotpreis text kept verbatim; quantity check still mandatory (H.1)",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.004   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Rotpreis",
                "6. Prüfung Wareneingang: Nein",
            ],
            we_lines=_we("3.700.004", _pos(1, skus=[("4001000000066", "M", 1)])),
            expected_status=ParseStatus.PARSED,
            assertions=[
                _expect_section_text("Rotpreis"),
                _expect_check_mode(CheckMode.QUANTITY_ONLY),
            ],
        ),
        VariantSpec(
            slug="pruefung_prozent",
            description="Prüfung=% -> percentage_check with the parsed percentage value",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.005   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: 20%",
            ],
            we_lines=_we("3.700.005", _pos(1, skus=[("4001000000073", "S", 1)])),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_check_mode(CheckMode.PERCENTAGE_CHECK, percentage=20.0)],
        ),
        VariantSpec(
            slug="mehrere_shopbereiche",
            description="Multiple Shopbereiche: positions retain distinct shop numbers",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.006   Beleg-Menge: 3",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-3, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            we_lines=_we(
                "3.700.006",
                [
                    *_pos(1, shop="21", skus=[("4001000000080", "S", 1)]),
                    *_pos(2, shop="22", skus=[("4001000000097", "M", 1)]),
                    *_pos(3, shop="23", skus=[("4001000000103", "L", 1)]),
                ],
            ),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_distinct_shops("21", "22", "23"), _expect_position_count(3)],
        ),
        VariantSpec(
            slug="mehrseitiger_beleg",
            description="Multi-page WE-Beleg: positions split across pages all extracted",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.007   Beleg-Menge: 6",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-6, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            # The marker --PAGEBREAK-- starts a new PDF page in the generator.
            we_lines=_we(
                "3.700.007",
                [
                    *_pos(1, skus=[("4001000000110", "S", 1)]),
                    *_pos(2, skus=[("4001000000127", "M", 1)]),
                    *_pos(3, skus=[("4001000000134", "L", 1)]),
                    "--PAGEBREAK--",
                    *_pos(4, skus=[("4001000000141", "S", 1)]),
                    *_pos(5, skus=[("4001000000158", "M", 1)]),
                    *_pos(6, skus=[("4001000000165", "L", 1)]),
                ],
            ),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_position_count(6)],
        ),
        VariantSpec(
            slug="catman_positiv",
            description="CatMan>0 -> catman_due priority flag (never a section)",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.008   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, CatMan: 3, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            we_lines=_we("3.700.008", _pos(1, skus=[("4001000000172", "M", 1)])),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_priority("catman_due")],
        ),
        VariantSpec(
            slug="ohne_etikettendruck",
            description="ohne Etikettendruck -> price_label_print_required is False",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.009   Beleg-Menge: 1",
                "1. Preisetikettendruck: Nein",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            we_lines=_we("3.700.009", _pos(1, skus=[("4001000000189", "S", 1)])),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_price_label(False)],
        ),
        VariantSpec(
            slug="haengeware",
            description="Hängeware text kept verbatim; multi-SKU position stays grouped",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.010   Beleg-Menge: 3",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-2, Abschnitt: Hängeware",
                "6. Prüfung Wareneingang: Ja",
            ],
            we_lines=_we(
                "3.700.010",
                [
                    # POS 1 carries two SKU lines -> Position != SKU-Zeile must hold.
                    *_pos(1, skus=[("4001000000196", "S", 1), ("4001000000202", "M", 1)]),
                    *_pos(2, skus=[("4001000000219", "L", 1)]),
                ],
            ),
            expected_status=ParseStatus.PARSED,
            assertions=[_expect_section_text("Hängeware"), _expect_sku_grouping(0, 2)],
        ),
    ]


def _degraded_variants() -> list[VariantSpec]:
    """Intentionally degraded inputs that MUST route to needs_review (E.2 / H.4)."""
    return [
        VariantSpec(
            slug="degraded_we_beleg_unreadable",
            description="WE-Beleg header unreadable -> critical field missing -> needs_review",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.011   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            # No "Beleg-Nr." line -> receipt.weBelegNo is None (critical).
            we_lines=[
                "Wareneingangsbeleg (Kopf unleserlich)",
                *_pos(1, skus=[("4001000000226", "S", 1)]),
            ],
            expected_status=ParseStatus.NEEDS_REVIEW,
            assertions=[_expect_receipt_beleg_missing()],
        ),
        VariantSpec(
            slug="degraded_menge_mismatch",
            description="Beleg-Menge != sum of SKU quantities -> plausibility warning -> review",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.012   Beleg-Menge: 9",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            # SKU sum is 1, but Beleg-Menge says 9 -> contradiction.
            we_lines=_we("3.700.012", _pos(1, skus=[("4001000000233", "S", 1)])),
            expected_status=ParseStatus.NEEDS_REVIEW,
            assertions=[_expect_warning_contains("Beleg-Menge")],
        ),
        VariantSpec(
            slug="degraded_beleg_no_mismatch",
            description="AW vs WE Beleg-Nr. mismatch -> warning + lowered confidence -> review",
            aw_lines=[
                "Arbeitsanweisung L+T",
                "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
                "Beleg-Nr.: 3.700.013   Beleg-Menge: 1",
                "1. Preisetikettendruck: Ja",
                "4. Warenbezeichnung: Positionen 1-1, Abschnitt: Vororder",
                "6. Prüfung Wareneingang: Ja",
            ],
            we_lines=_we("3.999.999", _pos(1, skus=[("4001000000240", "S", 1)])),
            expected_status=ParseStatus.NEEDS_REVIEW,
            assertions=[_expect_warning_contains("weBelegNo mismatch")],
        ),
        VariantSpec(
            slug="degraded_only_lieferschein",
            description="Only a Lieferschein present -> no parseable basis -> needs_review",
            aw_lines=[],
            we_lines=[],
            expected_status=ParseStatus.NEEDS_REVIEW,
            include_work_instruction=False,
            include_goods_receipt=False,
        ),
    ]


VARIANTS: list[VariantSpec] = [*_clean_variants(), *_degraded_variants()]


# --------------------------------------------------------------------------- #
# PDF materialisation (deterministic text-layer PDFs, PyMuPDF).
# --------------------------------------------------------------------------- #
def _write_pdf(path: Path, lines: list[str]) -> None:
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page()
    y = 60.0
    for line in lines:
        if line == "--PAGEBREAK--":
            page = doc.new_page()
            y = 60.0
            continue
        page.insert_text((50, y), line, fontsize=10)
        y += 20.0
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
    doc.close()


def generate_variants(force: bool = True) -> list[VariantSpec]:
    """Materialise every variant's PDFs. ``force=False`` only writes missing files."""
    for spec in VARIANTS:
        if spec.include_work_instruction and (force or not spec.aw_pdf.exists()):
            _write_pdf(spec.aw_pdf, spec.aw_lines)
        if spec.include_goods_receipt and (force or not spec.we_pdf.exists()):
            _write_pdf(spec.we_pdf, spec.we_lines)
    return VARIANTS


if __name__ == "__main__":
    written = generate_variants()
    print(f"wrote {len(written)} variant document sets into {VARIANT_DIR}")
    for spec in written:
        print(f"  - {spec.slug}: {spec.expected_status.value} ({spec.description})")
