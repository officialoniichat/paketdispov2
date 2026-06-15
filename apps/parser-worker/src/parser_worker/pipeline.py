"""Pure parse pipeline: ParseJobInput -> ParseJobResult.

This is the heart of the worker and is intentionally free of queue/IO concerns
so it can be golden-master tested directly. The BullMQ adapter (``queue.py``)
only feeds jobs into :func:`parse_document_set`.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from parser_worker import PARSER_VERSION
from parser_worker.confidence import aggregate_confidence, decide_status
from parser_worker.extraction.pdf_text import extract_text
from parser_worker.mapping.we_beleg import map_we_beleg
from parser_worker.mapping.work_instruction import map_work_instruction
from parser_worker.models import (
    DEFAULT_PARSE_CONFIDENCE_THRESHOLD,
    DocumentKind,
    ParsedReceipt,
    ParsedWorkInstruction,
    ParseJobFile,
    ParseJobInput,
    ParseJobResult,
)

# A resolver turns a job file into the PDF bytes/path. Default reads storage_key
# as a local path; production injects an object-store reader.
FileResolver = Callable[[ParseJobFile], bytes | str | Path]


def _default_resolver(file: ParseJobFile) -> str:
    return file.storage_key


def parse_document_set(
    job: ParseJobInput,
    *,
    resolver: FileResolver = _default_resolver,
    threshold: float = DEFAULT_PARSE_CONFIDENCE_THRESHOLD,
) -> ParseJobResult:
    """Parse one DocumentSet. Lieferschein is carried but never parsed (H.1)."""
    warnings: list[str] = []
    field_conf: dict[str, float] = {}

    work_instruction: ParsedWorkInstruction | None = None
    receipt: ParsedReceipt | None = None

    aw_file = _find(job, DocumentKind.WORK_INSTRUCTION)
    we_file = _find(job, DocumentKind.GOODS_RECEIPT)

    if aw_file is None:
        warnings.append("missing work_instruction document")
    else:
        text = extract_text(resolver(aw_file))
        work_instruction, conf = map_work_instruction(text)
        field_conf.update(conf)

    if we_file is None:
        warnings.append("missing goods_receipt document")
    else:
        text = extract_text(resolver(we_file))
        receipt, conf = map_we_beleg(text)
        field_conf.update(conf)

    warnings.extend(_plausibility_warnings(work_instruction, receipt))

    confidence = aggregate_confidence(field_conf)
    # Each unresolved plausibility warning shaves a little confidence so internal
    # contradictions cannot ride a high field score into auto-processing.
    confidence = max(0.0, confidence - 0.1 * len(warnings))

    # An incomplete set (e.g. only a Lieferschein) is NOT a parser failure – the
    # parser ran fine, the input is incomplete – so it routes to needs_review for
    # a teamlead (§4.2 step 6). FAILED is reserved for extraction exceptions and
    # is raised by the queue adapter, not here.
    status = decide_status(confidence, field_conf, threshold=threshold)

    return ParseJobResult(
        document_set_id=job.document_set_id,
        parser_version=job.parser_version or PARSER_VERSION,
        work_instruction=work_instruction,
        receipt=receipt,
        parse_confidence=round(confidence, 4),
        status=status,
        warnings=warnings,
        field_confidences=field_conf,
    )


def _find(job: ParseJobInput, kind: DocumentKind) -> ParseJobFile | None:
    return next((f for f in job.files if f.kind == kind), None)


def _plausibility_warnings(
    wi: ParsedWorkInstruction | None, receipt: ParsedReceipt | None
) -> list[str]:
    """Cross-document consistency checks (Python side of §14.3)."""
    warnings: list[str] = []
    if wi is None or receipt is None:
        return warnings

    aw_no = wi.header.we_beleg_no
    we_no = receipt.we_beleg_no
    if aw_no and we_no and aw_no != we_no:
        warnings.append(f"weBelegNo mismatch: AW={aw_no} WE={we_no}")

    sku_sum = sum(s.expected_quantity for p in receipt.positions for s in p.sku_lines)
    if wi.header.total_quantity is not None and sku_sum and wi.header.total_quantity != sku_sum:
        warnings.append(
            f"Beleg-Menge {wi.header.total_quantity} != sum of SKU quantities {sku_sum}"
        )

    we_positions = {p.position_no for p in receipt.positions}
    missing = sorted({p.position_no for p in wi.positions} - we_positions)
    if missing:
        warnings.append(f"AW positions not found in WE-Beleg: {missing}")

    return warnings
