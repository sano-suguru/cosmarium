---
name: find-symbol
description: This skill should be used when investigating symbol definitions, finding all references to a function or variable, checking type information, or navigating code semantically such as "where is spU defined", "find all references to gameState", "what type does gN return", "go to definition of cam", or "show diagnostics for this file". Provides LSP-based semantic code navigation for the COSMARIUM TypeScript codebase.
version: 0.1.0
---

# LSP Semantic Code Navigation

Perform semantic code analysis using the TypeScript Language Server via mcp-language-server. Unlike text search, LSP understands types, scopes, and symbol relationships.

## When to Use

- Finding the definition of a function, variable, or type
- Locating all references to a symbol across the codebase
- Checking the inferred type or signature of a symbol
- Reviewing TypeScript diagnostics for a file

## Tool Usage

### `read_definition` — Go to Definition

Jump to where a symbol is defined. Provide the file path and position (line/character) of the symbol usage.

### `find_references` — Find All References

Locate every usage of a symbol across the entire codebase. Essential before renaming or removing symbols.

### `hover` — Type Information

Get the type signature and documentation for a symbol at a given position. Useful for understanding inferred types.

### `diagnostics` — File Diagnostics

Get TypeScript errors and warnings for a specific file. Use after making edits to verify correctness.

## AST-grep vs LSP Decision Guide

| Task | Use AST-grep | Use LSP |
|------|-------------|---------|
| Find all calls to `spU()` | Pattern: `spU($$$)` | `find_references` on `spU` definition |
| Find where `spU` is defined | - | `read_definition` |
| Check return type of `gN()` | - | `hover` on `gN` |
| Find all `export function` patterns | Pattern search | - |
| Rename safety check | Both: pattern for structure, references for completeness | |
| Find unused exports | - | `diagnostics` + knip |
| Detect `any` type usage | Pattern: `any` as type | `diagnostics` (strict mode) |

**Rule of thumb**: Use LSP for semantic queries (definitions, references, types). Use AST-grep for structural/syntactic queries (patterns, code shapes).

## COSMARIUM Key Symbols

Refer to `references/key-symbols.md` for a list of frequently investigated symbols organized by module, including pool functions, state management, renderer, and simulation symbols.

## Workflow

1. Identify the symbol to investigate
2. Use Grep or Glob to find the file containing the symbol
3. Use `read_definition` or `hover` to understand the symbol
4. Use `find_references` to see all usage sites
5. Combine with AST-grep (`analyze-ast` skill) for structural pattern analysis if needed

## Notes

- mcp-language-server is pre-beta software; if it fails, fall back to Grep-based search
- File paths must be absolute
- Line/character positions are 0-indexed
