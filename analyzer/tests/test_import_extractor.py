"""Tests for codemap.parser.import_extractor."""

from pathlib import Path

import pytest

from codemap.parser.import_extractor import ImportRecord, extract_imports

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> tuple[str, bytes]:
    p = FIXTURES / name
    return name, p.read_bytes()


class TestBasicTs:
    source_file, source_bytes = _load("basic.ts")

    @pytest.fixture(scope="class")
    def records(self) -> list[ImportRecord]:
        return extract_imports(self.source_file, self.source_bytes)

    def test_count(self, records: list[ImportRecord]) -> None:
        assert len(records) == 5

    def test_static_fs(self, records: list[ImportRecord]) -> None:
        assert ImportRecord("fs", "static", self.source_file) in records

    def test_static_path(self, records: list[ImportRecord]) -> None:
        assert ImportRecord("path", "static", self.source_file) in records

    def test_static_token(self, records: list[ImportRecord]) -> None:
        assert ImportRecord("../utils/token", "static", self.source_file) in records

    def test_reexport(self, records: list[ImportRecord]) -> None:
        assert ImportRecord("./serializer", "reexport", self.source_file) in records

    def test_dynamic_string(self, records: list[ImportRecord]) -> None:
        assert ImportRecord("./lazy-module", "dynamic", self.source_file) in records

    def test_no_unknown_kinds(self, records: list[ImportRecord]) -> None:
        assert all(r.kind in ("static", "dynamic", "reexport") for r in records)


class TestDynamicVariable:
    source_file, source_bytes = _load("dynamic_variable.ts")

    @pytest.fixture(scope="class")
    def records(self) -> list[ImportRecord]:
        return extract_imports(self.source_file, self.source_bytes)

    def test_count(self, records: list[ImportRecord]) -> None:
        assert len(records) == 1

    def test_dynamic_placeholder(self, records: list[ImportRecord]) -> None:
        r = records[0]
        assert r.kind == "dynamic"
        assert r.raw_path == "<dynamic>"
        assert r.source_file == self.source_file
