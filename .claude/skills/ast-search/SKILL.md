---
name: ast-search
description: This skill should be used when the user invokes "/ast-search" to perform an explicit AST-grep pattern search. Accepts a pattern argument and searches the COSMARIUM TypeScript codebase for structural matches.
version: 0.1.0
disable-model-invocation: true
allowed-tools:
  - mcp__ast-grep__find_code
  - mcp__ast-grep__find_code_by_rule
  - mcp__ast-grep__dump_syntax_tree
  - mcp__ast-grep__test_match_code_rule
---

# /ast-search — AST-grep Pattern Search Command

Search the COSMARIUM codebase using AST-grep structural pattern matching.

## Usage

```
/ast-search <pattern>
```

## Pattern Syntax

- `$NAME` — matches any single AST node (identifier, expression, etc.)
- `$$$` — matches zero or more nodes (variadic)
- Literal code — matches exactly

## Examples

```
/ast-search spU($$$)                              # All unit spawn calls
/ast-search export function $NAME($$$) { $$$ }    # All exported functions
/ast-search gl.$METHOD($$$)                        # All WebGL API calls
/ast-search set$NAME($$$)                          # All state setter calls
/ast-search if ($COND) { $$$ } else { $$$ }       # All if-else blocks
```

## Execution

1. Parse the user-provided pattern from the command argument
2. Call `find_code` with the pattern, `lang: typescript`, targeting the `src/` directory
3. Present results grouped by file with line numbers
4. If no matches found, suggest using `dump_syntax_tree` to inspect the AST structure of a sample code snippet to debug the pattern

## Advanced: YAML Rule Search

For complex queries, use `find_code_by_rule` with a YAML rule:

```yaml
rule:
  kind: call_expression
  has:
    kind: member_expression
    pattern: gl.$METHOD
lang: typescript
```

Pass YAML rules by prefixing the argument with `rule:` followed by the YAML content.
