# Suggested Commands

## Development
- `bun install` — Install dependencies
- `bun run dev` — Dev server at http://localhost:5173
- `bun run build` — Production build

## Quality Checks
- `bun run typecheck` — Type check (strict mode)
- `bun run lint:fix` — Biome lint with auto-fix
- `bun run format` — Biome format (write)
- `bun run format:check` — Biome format check (read-only)
- `bun run knip` — Unused export detection
- `bun run cpd` — Copy-paste detection
- `bun run similarity` — Code similarity detection (threshold 0.92, min 7 lines)
- `bun run check:deps` — Dependency rules validation

## Testing
- `bun run test` — Vitest watch mode
- `bun run test:run` — Vitest single run
- `bun run bench` — Vitest benchmark
- `bunx vitest run src/path/to.test.ts` — Run single test file

## All Checks Combined
- `bun run check` — typecheck + biome ci + knip + cpd + similarity + vitest run + check:deps

## System Utilities (Darwin)
- `git` — Version control
- `ls`, `find`, `grep` — File operations (prefer Serena tools when available)
