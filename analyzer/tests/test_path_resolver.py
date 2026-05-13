"""Tests for codemap.resolver.alias_resolver and codemap.resolver.path_resolver."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from codemap.resolver.alias_resolver import load_aliases
from codemap.resolver.path_resolver import ResolvedImport, resolve_import

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_project(base: Path, files: list[str]) -> None:
    for rel in files:
        target = base / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()


# ---------------------------------------------------------------------------
# alias_resolver
# ---------------------------------------------------------------------------


class TestLoadAliases:
    def test_defaults_when_no_config(self, tmp_path: Path) -> None:
        aliases = load_aliases(str(tmp_path))
        assert aliases == {"@/": "src/", "~/": "src/"}

    def test_reads_tsconfig_paths(self, tmp_path: Path) -> None:
        tsconfig = {
            "compilerOptions": {
                "paths": {
                    "@/*": ["src/*"],
                    "~utils/*": ["src/utils/*"],
                }
            }
        }
        (tmp_path / "tsconfig.json").write_text(json.dumps(tsconfig))
        aliases = load_aliases(str(tmp_path))
        assert aliases == {"@/": "src/", "~utils/": "src/utils/"}

    def test_tsconfig_preferred_over_jsconfig(self, tmp_path: Path) -> None:
        ts = {"compilerOptions": {"paths": {"@/*": ["ts-src/*"]}}}
        js = {"compilerOptions": {"paths": {"@/*": ["js-src/*"]}}}
        (tmp_path / "tsconfig.json").write_text(json.dumps(ts))
        (tmp_path / "jsconfig.json").write_text(json.dumps(js))
        aliases = load_aliases(str(tmp_path))
        assert aliases["@/"] == "ts-src/"

    def test_missing_paths_key_returns_defaults(self, tmp_path: Path) -> None:
        (tmp_path / "tsconfig.json").write_text(json.dumps({"compilerOptions": {}}))
        aliases = load_aliases(str(tmp_path))
        assert aliases == {"@/": "src/", "~/": "src/"}

    def test_strips_glob_suffix(self, tmp_path: Path) -> None:
        tsconfig = {"compilerOptions": {"paths": {"lib/*": ["packages/lib/*"]}}}
        (tmp_path / "tsconfig.json").write_text(json.dumps(tsconfig))
        aliases = load_aliases(str(tmp_path))
        assert "lib/" in aliases
        assert aliases["lib/"] == "packages/lib/"


# ---------------------------------------------------------------------------
# path_resolver — fixture setup
# ---------------------------------------------------------------------------


@pytest.fixture()
def project(tmp_path: Path) -> Path:
    _make_project(tmp_path, [
        "src/utils/token.ts",
        "src/components/Button.tsx",
        "src/hooks/useAuth.ts",
    ])
    return tmp_path


@pytest.fixture()
def aliases() -> dict[str, str]:
    return {"@/": "src/", "~/": "src/"}


# ---------------------------------------------------------------------------
# path_resolver — relative imports
# ---------------------------------------------------------------------------


class TestRelativeImports:
    def test_resolves_ts_sibling(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "../utils/token",
            str(project),
            aliases,
        )
        assert result == ResolvedImport("../utils/token", "local", "src/utils/token.ts")

    def test_resolves_tsx_file(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "../components/Button",
            str(project),
            aliases,
        )
        assert result == ResolvedImport(
            "../components/Button", "local", "src/components/Button.tsx"
        )

    def test_missing_relative_returns_local_ts_guess(
        self, project: Path, aliases: dict[str, str]
    ) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "./nonexistent",
            str(project),
            aliases,
        )
        assert result.kind == "local"
        assert result.resolved.endswith(".ts")

    def test_kind_is_local(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "../utils/token",
            str(project),
            aliases,
        )
        assert result.kind == "local"


# ---------------------------------------------------------------------------
# path_resolver — alias imports
# ---------------------------------------------------------------------------


class TestAliasImports:
    def test_at_alias_resolves_tsx(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "@/components/Button",
            str(project),
            aliases,
        )
        assert result == ResolvedImport(
            "@/components/Button", "local", "src/components/Button.tsx"
        )

    def test_at_alias_resolves_ts(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "@/utils/token",
            str(project),
            aliases,
        )
        assert result == ResolvedImport(
            "@/utils/token", "local", "src/utils/token.ts"
        )

    def test_missing_alias_target_returns_local_guess(
        self, project: Path, aliases: dict[str, str]
    ) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts",
            "@/missing/Module",
            str(project),
            aliases,
        )
        assert result.kind == "local"


# ---------------------------------------------------------------------------
# path_resolver — external packages
# ---------------------------------------------------------------------------


class TestExternalImports:
    def test_react_is_external(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import("src/hooks/useAuth.ts", "react", str(project), aliases)
        assert result == ResolvedImport("react", "external", "react")

    def test_scoped_package(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts", "@scope/pkg/sub", str(project), aliases
        )
        assert result == ResolvedImport("@scope/pkg/sub", "external", "@scope/pkg")

    def test_deep_unscoped_package(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import(
            "src/hooks/useAuth.ts", "lodash/fp", str(project), aliases
        )
        assert result == ResolvedImport("lodash/fp", "external", "lodash")

    def test_kind_is_external(self, project: Path, aliases: dict[str, str]) -> None:
        result = resolve_import("src/hooks/useAuth.ts", "react", str(project), aliases)
        assert result.kind == "external"
