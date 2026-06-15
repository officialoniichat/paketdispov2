"""Generate the golden-master example PDFs (Anhang G / Quellen Q5, Q6).

These are *real* text-layer PDFs the parser must read end-to-end. They encode the
exact example from Anhang G.1 (Arbeitsanweisung) and a matching WE-Beleg whose
SKU quantities sum to the Beleg-Menge of 9. Run ``python generate_pdfs.py`` to
(re)create the committed fixtures; the golden test also regenerates them if
missing so the suite is self-contained.
"""

from __future__ import annotations

from pathlib import Path

GOLDEN_DIR = Path(__file__).parent / "golden"
AW_PDF = GOLDEN_DIR / "arbeitsanweisung_3656860.pdf"
WE_PDF = GOLDEN_DIR / "we_beleg_3656860.pdf"

ARBEITSANWEISUNG_LINES: list[str] = [
    "Arbeitsanweisung L+T",
    "Filiale: 1   Lagerplatz: 27   Shopbereich: 21",
    "Lieferschein: 1   Beleg-Nr.: 3.656.860   Beleg-Menge: 9",
    "Buchungsdatum: 15.06.2026",
    "1. Preisetikettendruck: Ja",
    "4. Warenbezeichnung: Positionen 1-5, Filiale 1, NOS, "
    "Abschnitt: Vororder, Prospekt: Kommission, Etage: EG",
    "5. Nach Artikel, Farbe, Größe sortieren: Ja",
    "6. Prüfung Wareneingang: Nein",
    "8. Preisetiketten anbringen: Positionen 1, 2, 3, 4, 5",
    "9. Beschriftung Boxzettel: Ja",
    "10. Sicherungsetikett: Nicht sichern für Positionen 1, 2, 3, 4, 5",
    "11. ZST stempeln: Ja",
]

WE_BELEG_LINES: list[str] = [
    "Wareneingangsbeleg",
    "Beleg-Nr.: 3.656.860   Buchungsdatum: 15.06.2026",
    "POS 1 WGR 101 Artikel ART-001 Farbe schwarz Shop 21 HShop 210 Etage EG",
    "EAN 4001234500011 Größe S Menge 1",
    "EAN 4001234500028 Größe M Menge 1",
    "POS 2 WGR 102 Artikel ART-002 Farbe blau Shop 21 HShop 210 Etage EG",
    "EAN 4001234500035 Größe M Menge 2",
    "POS 3 WGR 103 Artikel ART-003 Farbe rot Shop 21 HShop 210 Etage EG",
    "EAN 4001234500042 Größe L Menge 1",
    "POS 4 WGR 104 Artikel ART-004 Farbe gruen Shop 21 HShop 210 Etage EG",
    "EAN 4001234500059 Größe M Menge 2",
    "POS 5 WGR 105 Artikel ART-005 Farbe gelb Shop 21 HShop 210 Etage EG",
    "EAN 4001234500066 Größe S Menge 1",
    "EAN 4001234500073 Größe L Menge 1",
]


def _write_pdf(path: Path, lines: list[str]) -> None:
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page()
    y = 60.0
    for line in lines:
        page.insert_text((50, y), line, fontsize=10)
        y += 20.0
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
    doc.close()


def generate(force: bool = True) -> tuple[Path, Path]:
    """Write both fixtures. With ``force=False`` only missing files are created."""
    if force or not AW_PDF.exists():
        _write_pdf(AW_PDF, ARBEITSANWEISUNG_LINES)
    if force or not WE_PDF.exists():
        _write_pdf(WE_PDF, WE_BELEG_LINES)
    return AW_PDF, WE_PDF


if __name__ == "__main__":
    aw, we = generate()
    print(f"wrote {aw}")
    print(f"wrote {we}")
