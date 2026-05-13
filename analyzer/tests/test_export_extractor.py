"""Tests for codemap.parser.export_extractor."""

from pathlib import Path

import pytest

from codemap.parser.export_extractor import ExportRecord, extract_declarations, extract_exports

FIXTURES = Path(__file__).parent / "fixtures"
SOURCE_FILE = "exports.ts"
SOURCE_BYTES = (FIXTURES / SOURCE_FILE).read_bytes()


@pytest.fixture(scope="module")
def records() -> list[ExportRecord]:
    return extract_exports(SOURCE_FILE, SOURCE_BYTES)


@pytest.fixture(scope="module")
def decl_names() -> list[str]:
    return extract_declarations(SOURCE_FILE, SOURCE_BYTES)


# ---------------------------------------------------------------------------
# extract_exports
# ---------------------------------------------------------------------------


class TestExportRecords:
    def test_total_count(self, records: list[ExportRecord]) -> None:
        # default, namedFunc, CONST_VAL, SomeType, helper
        assert len(records) == 5

    def test_default_export(self, records: list[ExportRecord]) -> None:
        assert ExportRecord("default", "default", SOURCE_FILE) in records

    def test_named_function(self, records: list[ExportRecord]) -> None:
        assert ExportRecord("namedFunc", "named", SOURCE_FILE) in records

    def test_named_const(self, records: list[ExportRecord]) -> None:
        assert ExportRecord("CONST_VAL", "named", SOURCE_FILE) in records

    def test_type_export(self, records: list[ExportRecord]) -> None:
        assert ExportRecord("SomeType", "type", SOURCE_FILE) in records

    def test_reexport(self, records: list[ExportRecord]) -> None:
        assert ExportRecord("helper", "reexport", SOURCE_FILE) in records

    def test_unexported_function_not_in_exports(self, records: list[ExportRecord]) -> None:
        names = {r.name for r in records}
        assert "unexported" not in names

    def test_source_file_on_all_records(self, records: list[ExportRecord]) -> None:
        assert all(r.source_file == SOURCE_FILE for r in records)

    def test_all_kinds_are_valid(self, records: list[ExportRecord]) -> None:
        valid = {"named", "default", "reexport", "type"}
        assert all(r.kind in valid for r in records)


# ---------------------------------------------------------------------------
# extract_declarations
# ---------------------------------------------------------------------------


class TestExtractDeclarations:
    def test_includes_exported_class(self, decl_names: list[str]) -> None:
        # 'export default class App' is still a top-level class_declaration.
        assert "App" in decl_names

    def test_includes_exported_function(self, decl_names: list[str]) -> None:
        assert "namedFunc" in decl_names

    def test_includes_unexported_function(self, decl_names: list[str]) -> None:
        assert "unexported" in decl_names

    def test_does_not_include_const(self, decl_names: list[str]) -> None:
        # lexical_declaration — not a function or class.
        assert "CONST_VAL" not in decl_names

    def test_does_not_include_type_alias(self, decl_names: list[str]) -> None:
        assert "SomeType" not in decl_names

    def test_total_count(self, decl_names: list[str]) -> None:
        # App, namedFunc, unexported
        assert len(decl_names) == 3
