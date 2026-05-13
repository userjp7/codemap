"""Tree-sitter-based export extraction for TypeScript and JavaScript files.

Parses source bytes and returns structured records for every export found in
the file, as well as names of all top-level declarations.
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

# Declaration node types that produce a top-level name.
_DECL_TYPES = {"function_declaration", "class_declaration"}


def _make_parser(source_file: str) -> Parser:
    ext = Path(source_file).suffix.lower()
    lang = _TSX_LANGUAGE if ext in _TSX_EXTENSIONS else _TS_LANGUAGE
    return Parser(lang)


@dataclass
class ExportRecord:
    """A single export entry extracted from a source file.

    Attributes:
        name: The exported identifier as it appears to consumers, e.g. ``'MyClass'``.
            For default exports this is always ``'default'``.
            For namespace re-exports (``export * from '...'``) this is ``'*'``.
        kind: One of:

            * ``'named'`` — ``export function/class/const/let/var`` or
              ``export { name }``
            * ``'default'`` — ``export default …``
            * ``'reexport'`` — ``export { … } from '…'`` or ``export * from '…'``
            * ``'type'`` — ``export type { … }`` or ``export type Alias = …``
        source_file: Project-relative path of the file that was parsed.
    """

    name: str
    kind: Literal["named", "default", "reexport", "type"]
    source_file: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _child_types(node: Node) -> set[str]:
    return {c.type for c in node.children}


def _first_child(node: Node, *types: str) -> Node | None:
    for c in node.children:
        if c.type in types:
            return c
    return None


def _specifier_names(export_clause: Node) -> list[str]:
    """Return the exported names from an ``export_clause`` node.

    For ``export { foo as bar }``, the exported name is ``bar``.
    """
    names: list[str] = []
    for child in export_clause.children:
        if child.type != "export_specifier":
            continue
        # Identifiers in document order; last one is the exported alias when
        # 'as' is present, otherwise the single name.
        idents = [c for c in child.children if c.type == "identifier"]
        if idents:
            names.append(idents[-1].text.decode())  # type: ignore[union-attr]
    return names


def _declaration_name(decl: Node) -> str | None:
    """Return the identifier name from a function or class declaration node."""
    for child in decl.children:
        # class_declaration uses type_identifier; function_declaration uses identifier.
        if child.type in ("identifier", "type_identifier"):
            return child.text.decode()  # type: ignore[union-attr]
    return None


def _lexical_names(decl: Node) -> list[str]:
    """Return all variable names from a ``lexical_declaration`` node."""
    names: list[str] = []
    for child in decl.children:
        if child.type == "variable_declarator":
            ident = _first_child(child, "identifier")
            if ident and ident.text:
                names.append(ident.text.decode())
    return names


def _handle_export_statement(
    node: Node,
    source_file: str,
    results: list[ExportRecord],
) -> None:
    """Classify one ``export_statement`` node and append records to *results*."""
    ctypes = _child_types(node)

    # ------------------------------------------------------------------ default
    if "default" in ctypes:
        results.append(ExportRecord("default", "default", source_file))
        return

    has_source = "string" in ctypes  # export … from '…'

    # ---------------------------------------------------------------- reexport
    if has_source:
        clause = _first_child(node, "export_clause")
        if clause:
            for name in _specifier_names(clause):
                results.append(ExportRecord(name, "reexport", source_file))
        else:
            # export * from '…'
            results.append(ExportRecord("*", "reexport", source_file))
        return

    # -------------------------------------------------------------------- type
    # export type { Foo }  — direct 'type' keyword child
    if "type" in ctypes:
        clause = _first_child(node, "export_clause")
        if clause:
            for name in _specifier_names(clause):
                results.append(ExportRecord(name, "type", source_file))
            return
        # export type Alias = …  — type_alias_declaration child
        type_alias = _first_child(node, "type_alias_declaration")
        if type_alias:
            ident = _first_child(type_alias, "type_identifier")
            if ident and ident.text:
                results.append(ExportRecord(ident.text.decode(), "type", source_file))
            return
        # interface_declaration (no direct 'type' keyword but still type-only)
        iface = _first_child(node, "interface_declaration")
        if iface:
            ident = _first_child(iface, "type_identifier")
            if ident and ident.text:
                results.append(ExportRecord(ident.text.decode(), "type", source_file))
        return

    # ------------------------------------------------------------------- named
    # export { foo, bar }
    clause = _first_child(node, "export_clause")
    if clause:
        for name in _specifier_names(clause):
            results.append(ExportRecord(name, "named", source_file))
        return

    # export function/class/const/let/var …
    for child in node.children:
        if child.type in ("function_declaration", "class_declaration"):
            if decl_name := _declaration_name(child):
                results.append(ExportRecord(decl_name, "named", source_file))
            return
        if child.type == "lexical_declaration":
            for name in _lexical_names(child):
                results.append(ExportRecord(name, "named", source_file))
            return
        if child.type == "enum_declaration":
            ident = _first_child(child, "identifier")
            if ident and ident.text:
                results.append(ExportRecord(ident.text.decode(), "named", source_file))
            return
        if child.type == "interface_declaration":
            ident = _first_child(child, "type_identifier")
            if ident and ident.text:
                results.append(ExportRecord(ident.text.decode(), "type", source_file))
            return
        if child.type == "type_alias_declaration":
            ident = _first_child(child, "type_identifier")
            if ident and ident.text:
                results.append(ExportRecord(ident.text.decode(), "type", source_file))
            return


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_exports(source_file: str, source_bytes: bytes) -> list[ExportRecord]:
    """Parse *source_bytes* and return every export found.

    Uses the TypeScript grammar for ``.ts``/``.js`` files and the TSX grammar
    for ``.tsx``/``.jsx`` files.

    Args:
        source_file: Project-relative path of the file being parsed.
        source_bytes: Raw UTF-8 encoded source of the file.

    Returns:
        List of :class:`ExportRecord` instances in document order covering:

        * ``default`` — ``export default …``
        * ``named`` — ``export { x }``, ``export function x``,
          ``export class X``, ``export const x``, ``export enum X``
        * ``reexport`` — ``export { x } from '…'``, ``export * from '…'``
        * ``type`` — ``export type { T }``, ``export type Alias = …``,
          ``export interface I``
    """
    parser = _make_parser(source_file)
    tree = parser.parse(source_bytes)
    results: list[ExportRecord] = []
    for node in tree.root_node.children:
        if node.type == "export_statement":
            _handle_export_statement(node, source_file, results)
    return results


def extract_declarations(source_file: str, source_bytes: bytes) -> list[str]:
    """Return the names of all top-level function and class declarations.

    Includes both exported and unexported declarations.  Does **not** include
    variables, type aliases, or interfaces.

    Args:
        source_file: Project-relative path of the file being parsed.
        source_bytes: Raw UTF-8 encoded source of the file.

    Returns:
        List of identifier strings in document order.
    """
    parser = _make_parser(source_file)
    tree = parser.parse(source_bytes)
    names: list[str] = []
    for node in tree.root_node.children:
        if node.type in _DECL_TYPES:
            name = _declaration_name(node)
            if name:
                names.append(name)
        elif node.type == "export_statement":
            for child in node.children:
                if child.type in _DECL_TYPES:
                    name = _declaration_name(child)
                    if name:
                        names.append(name)
    return names
