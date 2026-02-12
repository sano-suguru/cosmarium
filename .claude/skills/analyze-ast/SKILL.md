---
name: analyze-ast
description: This skill should be used when performing structural code pattern searches, impact analysis before refactoring, or bulk detection of syntax patterns such as "find all calls to spU", "search for var usage", "find functions matching a pattern", or "analyze code structure". Provides AST-grep based structural pattern matching for the COSMARIUM codebase.
version: 0.1.0
---

# AST-grep Structural Pattern Search

Perform structural code pattern searches using AST-grep MCP tools. Unlike text-based grep, AST-grep understands syntax tree structure, eliminating false positives from comments, strings, and partial matches.

## When to Use

- Searching for function call patterns across the codebase (e.g., all `spU()` invocations)
- Impact analysis before renaming or refactoring symbols
- Detecting specific syntax patterns (e.g., `var` usage, `any` type annotations)
- Finding structurally similar code blocks

## Tool Usage

### `find_code` — Simple Pattern Match (Start Here)

Use for straightforward pattern searches. Pattern syntax:
- `$NAME` — matches any single AST node
- `$$$` — matches zero or more arguments/nodes

```
# All spU calls
spU($$$)

# All export functions
export function $NAME($$$) { $$$ }

# All setter calls
set$NAME($$$)
```

Always specify `lang: typescript` for `.ts` files.

### `find_code_by_rule` — Advanced YAML Rule Search

Use when simple patterns are insufficient. Supports structural constraints:
- `kind` — filter by AST node type
- `inside` / `has` — parent/child relationships
- `follows` / `precedes` — sibling relationships

### `dump_syntax_tree` — Inspect AST Structure

Use when a pattern does not match as expected. Pass a code snippet to see its AST node types and structure.

### `test_match_code_rule` — Test Rule Before Searching

Validate a rule against a code snippet before running it across the codebase.

## COSMARIUM-Specific Patterns

Refer to `references/cosmarium-patterns.md` for a comprehensive list of project-specific patterns including pool operations, state management, WebGL calls, and spatial hash patterns.

## Search Scope

- Target `src/` directory for TypeScript files
- Exclude `src/shaders/` (GLSL files are not TypeScript)
- Always use `lang: typescript`
