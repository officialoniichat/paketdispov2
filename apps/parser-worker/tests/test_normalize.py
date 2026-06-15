from parser_worker.mapping.normalize import (
    normalize_beleg_no,
    parse_bool_de,
    parse_de_date,
    parse_int,
    parse_position_list,
)


def test_normalize_beleg_no_strips_separators() -> None:
    assert normalize_beleg_no("3.656.860") == "3656860"  # G.1 example
    assert normalize_beleg_no("WE 12 345") == "12345"
    assert normalize_beleg_no(None) is None
    assert normalize_beleg_no("abc") is None


def test_parse_bool_de() -> None:
    assert parse_bool_de("Ja") is True
    assert parse_bool_de("nein") is False
    assert parse_bool_de("vielleicht") is None
    assert parse_bool_de(None) is None


def test_parse_int() -> None:
    assert parse_int("Beleg-Menge: 9") == 9
    assert parse_int("none here") is None


def test_parse_de_date_to_iso() -> None:
    assert parse_de_date("15.06.2026") == "2026-06-15"
    assert parse_de_date("Buchungsdatum 1.2.2026") == "2026-02-01"
    assert parse_de_date("no date") is None


def test_parse_position_list_handles_ranges_and_lists() -> None:
    assert parse_position_list("1-5") == [1, 2, 3, 4, 5]
    assert parse_position_list("1–5") == [1, 2, 3, 4, 5]  # en dash
    assert parse_position_list("1, 2, 3, 4, 5") == [1, 2, 3, 4, 5]
    assert parse_position_list("") == []
