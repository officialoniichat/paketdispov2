"""Parser output contract (Pydantic).

Mirrors the shared Zod contract in
``packages/domain-types/src/parser-contract.ts`` field-for-field so the Python
producer and the TypeScript consumer agree. Low-confidence results land in
``needs_review`` instead of being auto-trusted (Anhang E.2 / H.4).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DEFAULT_PARSE_CONFIDENCE_THRESHOLD = 0.8


class ParseStatus(StrEnum):
    PENDING = "pending"
    PARSED = "parsed"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"


class CheckMode(StrEnum):
    QUANTITY_ONLY = "quantity_only"
    PERCENTAGE_CHECK = "percentage_check"
    FULL_CHECK = "full_check"


class DocumentKind(StrEnum):
    DELIVERY_NOTE = "delivery_note"
    GOODS_RECEIPT = "goods_receipt"
    WORK_INSTRUCTION = "work_instruction"
    UNKNOWN = "unknown"


class _Model(BaseModel):
    # Wire format is camelCase (mirrors the Zod contract); Python uses snake_case.
    # populate_by_name lets both forms be accepted on input; dump with
    # ``by_alias=True`` to emit the camelCase the TS consumer expects.
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ParseJobFile(_Model):
    kind: DocumentKind
    file_name: str
    storage_key: str


class ParseJobInput(_Model):
    document_set_id: str
    parser_version: str | None = None
    files: list[ParseJobFile] = Field(default_factory=list)


class ParsedWorkInstructionHeader(_Model):
    branch_no: str | None = None
    storage_location_code: str | None = None
    shop_area_no: str | None = None
    delivery_note_no: str | None = None
    we_beleg_no: str | None = None
    total_quantity: int | None = None
    price_label_print_required: bool | None = None
    sort_by_article_color_size_required: bool | None = None
    # Guardrail: 'Nein' -> quantity_only, never none (Anhang G.1 / F.2).
    goods_receipt_check_mode: CheckMode | None = None
    goods_receipt_check_percentage: float | None = None
    # Minimum quantity check is mandatory by design (H.1).
    minimum_quantity_check_always_required: bool = True
    box_label_required: bool | None = None
    zst_required: bool | None = None


class ParsedWorkInstructionPosition(_Model):
    position_no: int
    # Guardrail: NOS stored separately, NOT equated with Abschnitt (G.4 / F.2).
    nos_indicator: bool | None = None
    section_text: str | None = None
    prospect_text: str | None = None
    floor: str | None = None
    label_attach_required: bool | None = None
    label_placement_asset_ref: str | None = None
    security_required: bool | None = None
    security_instruction_text: str | None = None


class ParsedWorkInstruction(_Model):
    header: ParsedWorkInstructionHeader
    positions: list[ParsedWorkInstructionPosition] = Field(default_factory=list)
    # Prio parsed into flags, NEVER into a section (Prio != Abschnitt, F.2 / H.4).
    priority_flags: list[str] = Field(default_factory=list)
    section: int | None = None
    goods_type_text: str | None = None


class ParsedSkuLine(_Model):
    ean: str
    size: str
    expected_quantity: int
    ek_price: float | None = None
    vk_price: float | None = None


class ParsedReceiptPosition(_Model):
    position_no: int
    wgr: str | None = None
    supplier_article_no: str | None = None
    supplier_color: str | None = None
    shop_no: str | None = None
    h_shop_no: str | None = None
    floor: str | None = None
    nos_flag: bool | None = None
    sku_lines: list[ParsedSkuLine] = Field(default_factory=list)


class ParsedReceipt(_Model):
    we_beleg_no: str | None = None
    booking_date: str | None = None
    positions: list[ParsedReceiptPosition] = Field(default_factory=list)


class ParseJobResult(_Model):
    document_set_id: str
    parser_version: str
    work_instruction: ParsedWorkInstruction | None = None
    receipt: ParsedReceipt | None = None
    parse_confidence: float = Field(ge=0.0, le=1.0)
    status: ParseStatus
    warnings: list[str] = Field(default_factory=list)
    field_confidences: dict[str, float] = Field(default_factory=dict)
