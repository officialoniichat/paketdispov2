from parser_worker.guardrails import (
    check_mode_from_pruefung,
    goods_type_text_from,
    priority_flags_from,
)
from parser_worker.models import CheckMode


def test_pruefung_nein_is_quantity_only_not_none() -> None:
    # Core guardrail: 'Nein' keeps the minimum quantity check.
    assert check_mode_from_pruefung("Nein") is CheckMode.QUANTITY_ONLY


def test_pruefung_ja_is_full_check() -> None:
    assert check_mode_from_pruefung("Ja") is CheckMode.FULL_CHECK


def test_pruefung_percentage_is_percentage_check() -> None:
    assert check_mode_from_pruefung("20%") is CheckMode.PERCENTAGE_CHECK
    assert check_mode_from_pruefung("Prüfung 10 Prozent") is CheckMode.PERCENTAGE_CHECK


def test_pruefung_unknown_is_none() -> None:
    assert check_mode_from_pruefung(None) is None
    assert check_mode_from_pruefung("???") is None


def test_goods_type_text_recognised() -> None:
    assert goods_type_text_from("Abschnitt: Vororder") == "Vororder"
    assert goods_type_text_from("NOS") == "NOS"
    assert goods_type_text_from("etwas anderes") is None


def test_priority_flags_detect_prio_and_catman() -> None:
    flags = priority_flags_from("Prio Ware, CatMan fällig")
    assert "prio" in flags
    assert "catman_due" in flags
    # Guardrail: these are flags, never section codes – the function returns
    # only PriorityFlag strings and no integer section.
    assert all(isinstance(f, str) for f in flags)


def test_priority_flags_empty_when_no_marker() -> None:
    assert priority_flags_from("Abschnitt: Vororder") == []
