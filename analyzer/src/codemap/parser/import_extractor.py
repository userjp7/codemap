"""Tree-sitter-based import extraction for TypeScript and JavaScript files.

Parses source bytes and returns structured records for every static import,
re-export, and dynamic import() call found in the file.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import tree_sitter_typescript as _tsts
from tree_sitter import Language, Node, Parser

_TS_LANGUAGE = Language(_tsts.language_typescript())
_TSX_LANGUAGE = Language(_tsts.language_tsx())

_TSX_EXTENSIONS = {".tsx", ".jsx"}


def _make_parser(source_file: str) -> Parser:
    ext = Path(source_file).suffix.lower()
    lang = _TSX_LANGUAGE if ext in _TSX_EXTENSIONS else _TS_LANGUAGE
    return Parser(lang)


@dataclass
class ImportRecord:
    """A single import dependency extracted from a source file.

    Attributes:
        raw_path: The module specifier as written in source, e.g. ``'../utils/token'``.
            Set to ``'<dynamic>'`` when the argument is not a string literal.
        kind: One of ``'static'`` (ES import statement), ``'dynamic'``
            (``import()`` call expression), or ``'reexport'``
            (``export … from`` statement).
        source_file: Project-relative path of the file that was parsed.
    """

    raw_path: str
    kind: Literal["static", "dynamic", "reexport"]
    source_file: str


def _string_fragment(node: Node) -> str | None:
    """Return the text of the first ``string_fragment`` child of *node*, or None."""
    for child in node.children:
        if child.type == "string_fragment":
            return child.text.decode()  # type: ignore[union-attr]
    return None


def _walk(node: Node, source_file: str, results: list[ImportRecord]) -> None:
    """Recursively walk *node*, appending ImportRecords to *results*."""
    ntype = node.type

    if ntype == "import_statement":
        # import ... from 'path'   OR   import 'side-effect'
        for child in node.children:
            if child.type == "string":
                path = _string_fragment(child)
                if path is not None:
                    results.append(ImportRecord(path, "static", source_file))
                break
        # No need to recurse into an import_statement.
        return

    if ntype == "export_statement":
        # Re-exports: export { x } from './y'  or  export * from './y'
        # Only count when there is a 'string' child (the from-source).
        has_source = any(c.type == "string" for c in node.children)
        if has_source:
            for child in node.children:
                if child.type == "string":
                    path = _string_fragment(child)
                    if path is not None:
                        results.append(ImportRecord(path, "reexport", source_file))
                    break
        # Still recurse — an export_statement body can contain nested expressions.
        for child in node.children:
            _walk(child, source_file, results)
        return

    if ntype == "call_expression":
        # import('path')  or  import(variable)
        children = node.children
        if children and children[0].type == "import":
            # Find the arguments node.
            for child in children:
                if child.type == "arguments":
                    # arguments: ( <expr> )
                    args = [c for c in child.children if c.type not in ("(", ")")]
                    if len(args) == 1 and args[0].type == "string":
                        path = _string_fragment(args[0])
                        raw = path if path is not None else "<dynamic>"
                    else:
                        raw = "<dynamic>"
                    results.append(ImportRecord(raw, "dynamic", source_file))
                    break
            # Do not recurse further into this call.
            return

    for child in node.children:
        _walk(child, source_file, results)


def extract_imports(source_file: str, source_bytes: bytes) -> list[ImportRecord]:
    """Parse *source_bytes* and return every import dependency found.

    Uses the TypeScript tree-sitter grammar for ``.ts``/``.js`` files and the
    TSX grammar for ``.tsx``/``.jsx`` files.

    Args:
        source_file: Project-relative path of the file being parsed. Stored
            verbatim on each returned :class:`ImportRecord`.
        source_bytes: Raw UTF-8 encoded source of the file.

    Returns:
        List of :class:`ImportRecord` instances in document order.  Includes:

        * **static** — ``import … from 'path'`` and bare ``import 'path'``
        * **reexport** — ``export { … } from 'path'`` and ``export * from 'path'``
        * **dynamic** — ``import('path')`` (``raw_path`` is the literal string)
          or ``import(expr)`` (``raw_path`` is ``'<dynamic>'``)
    """
    parser = _make_parser(source_file)
    tree = parser.parse(source_bytes)
    results: list[ImportRecord] = []
    _walk(tree.root_node, source_file, results)
    return results
