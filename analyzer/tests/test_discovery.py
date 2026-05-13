"""Tests for codemap.discovery.discover_files."""

from pathlib import Path

from codemap.discovery import discover_files


def _make_tree(base: Path, files: list[str]) -> None:
    """Create each path in *files* relative to *base*, including parents."""
    for rel in files:
        target = base / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()


def test_returns_only_js_ts_files(tmp_path: Path) -> None:
    _make_tree(tmp_path, [
        "src/index.ts",
        "src/App.tsx",
        "src/utils.js",
        "src/component.jsx",
        "src/helpers.py",      # excluded — wrong extension
        "config.json",         # excluded — wrong extension
        "README.md",           # excluded — wrong extension
    ])

    result = discover_files(str(tmp_path))

    assert sorted(result) == [
        "src/App.tsx",
        "src/component.jsx",
        "src/index.ts",
        "src/utils.js",
    ]


def test_node_modules_excluded(tmp_path: Path) -> None:
    _make_tree(tmp_path, [
        "src/index.ts",
        "node_modules/lodash/index.ts",   # must be excluded
        "node_modules/react/index.js",    # must be excluded
    ])

    result = discover_files(str(tmp_path))

    assert result == ["src/index.ts"]
    assert not any("node_modules" in p for p in result)


def test_gitignore_excludes_dist(tmp_path: Path) -> None:
    _make_tree(tmp_path, [
        "src/index.ts",
        "dist/bundle.js",   # excluded via .gitignore
        "dist/chunk.ts",    # excluded via .gitignore
    ])
    (tmp_path / ".gitignore").write_text("dist/\n", encoding="utf-8")

    result = discover_files(str(tmp_path))

    assert result == ["src/index.ts"]
    assert not any("dist" in p for p in result)


def test_paths_are_relative_with_forward_slashes(tmp_path: Path) -> None:
    _make_tree(tmp_path, [
        "a/b/c/deep.tsx",
    ])

    result = discover_files(str(tmp_path))

    assert result == ["a/b/c/deep.tsx"]
    # Must never contain backslashes regardless of OS.
    assert all("\\" not in p for p in result)


def test_extra_exclude_patterns(tmp_path: Path) -> None:
    _make_tree(tmp_path, [
        "src/index.ts",
        "generated/types.ts",   # excluded via caller pattern
    ])

    result = discover_files(str(tmp_path), exclude=["generated/"])

    assert result == ["src/index.ts"]


def test_empty_directory_returns_empty(tmp_path: Path) -> None:
    assert discover_files(str(tmp_path)) == []


def test_always_excluded_dirs(tmp_path: Path) -> None:
    always_excluded = [
        ".git/config.ts",
        "build/out.js",
        ".next/server.tsx",
        "__pycache__/mod.js",
        ".cache/tmp.ts",
        "coverage/report.jsx",
    ]
    _make_tree(tmp_path, ["src/index.ts"] + always_excluded)

    result = discover_files(str(tmp_path))

    assert result == ["src/index.ts"]
