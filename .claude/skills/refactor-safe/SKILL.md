---
name: refactor-safe
description: This skill should be used when performing code refactoring operations such as "rename this function", "extract this into a module", "move this code", "refactor the combat system", or any code modification that could affect multiple files. Combines AST-grep and LSP for safe, verified refactoring of the COSMARIUM codebase.
version: 0.1.0
---

# Safe Refactoring with AST-grep + LSP

Perform safe code refactoring by combining AST-grep (structural pattern matching) and LSP (semantic analysis) to ensure correctness. Follow the four-step procedure for every refactoring operation.

## Four-Step Refactoring Procedure

### Step 1: Impact Analysis

Before changing any code, assess the full impact:

1. **LSP `find_references`** — Find all reference sites of the target symbol
2. **AST-grep `find_code`** — Search for structural patterns that may be affected (e.g., dynamic access, string references)
3. **Grep** — Catch string literals, comments, and non-code references
4. Document the complete list of affected files and locations

### Step 2: Plan Changes

Based on the impact analysis:

1. List every file that needs modification
2. Identify the order of changes (types first, then implementations, then usages)
3. Note any special cases (re-exports, dynamic access, string-based references)
4. Check for circular dependencies that could complicate the change

### Step 3: Execute Changes

Apply the planned modifications:

1. Update type definitions and interfaces first
2. Update implementations (function bodies, module internals)
3. Update all usage sites
4. Update string references in UI text if applicable

### Step 4: Verify

Confirm correctness after changes:

1. **LSP `diagnostics`** — Check for TypeScript errors in modified files
2. **AST-grep `find_code`** — Verify no old patterns remain
3. **Grep** — Search for any remaining references to the old name/pattern
4. **`bun run typecheck`** — Run full type check
5. **`bun run check`** — Run all project checks (typecheck + biome + knip + cpd)

## COSMARIUM Refactoring Notes

Refer to `references/cosmarium-refactoring.md` for project-specific considerations including:
- State setter pattern requirements
- Pool system constraints
- WebGL resource lifecycle
- Abbreviated naming conventions
- AGENTS.md guidance for each module
