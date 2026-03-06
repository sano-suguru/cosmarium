# Serena (MCP)

Prefer Serena's LSP tools over Grep/Glob for code analysis and editing:
- `find_symbol` / `find_referencing_symbols` — definition and reference tracking
- `get_symbols_overview` — file structure without reading entire files
- `rename_symbol` — rename with automatic reference updates
- `replace_symbol_body` / `insert_after_symbol` / `insert_before_symbol` — symbol-level editing

Use Grep/Glob for: string literal searches, filename patterns, non-code files (GLSL, JSON, MD).
