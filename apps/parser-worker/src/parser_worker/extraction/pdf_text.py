"""PDF text extraction (Anhang E / §12.2).

Strategy: PyMuPDF for the text layer first (fast, robust for digital PDFs);
pdfplumber as a secondary pass when PyMuPDF yields almost nothing (table-heavy
layouts); OCR is only a last-resort fallback hook and is intentionally NOT run
automatically – scanned-image input should surface as low confidence, not be
silently guessed (Anhang E.2 / H.4).
"""

from __future__ import annotations

from pathlib import Path

import structlog

log = structlog.get_logger()

# Below this character count we treat the PyMuPDF text layer as "empty enough"
# to warrant the pdfplumber fallback.
_MIN_TEXT_CHARS = 20


def extract_text(source: str | Path | bytes) -> str:
    """Extract the text layer from a PDF path or raw bytes."""
    data = _read_bytes(source)
    text = _extract_pymupdf(data)
    if len(text.strip()) >= _MIN_TEXT_CHARS:
        return text

    log.warning("pdf.text_layer_sparse", chars=len(text.strip()), fallback="pdfplumber")
    fallback = _extract_pdfplumber(data)
    return fallback if len(fallback.strip()) > len(text.strip()) else text


def _read_bytes(source: str | Path | bytes) -> bytes:
    if isinstance(source, bytes):
        return source
    return Path(source).read_bytes()


def _extract_pymupdf(data: bytes) -> str:
    import fitz  # PyMuPDF

    parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            parts.append(page.get_text("text"))
    return "\n".join(parts)


def _extract_pdfplumber(data: bytes) -> str:
    import io

    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)
