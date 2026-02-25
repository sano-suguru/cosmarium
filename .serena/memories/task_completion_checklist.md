# Task Completion Checklist

After completing a coding task, run the following checks:

1. **Type check**: `bun run typecheck`
2. **Lint + format**: `bun run lint:fix` then `bun run format`
3. **Tests**: `bun run test:run`
4. **Full check** (preferred): `bun run check` — runs all checks combined

## Pre-commit Hook
Automatically runs: `bunx biome check --staged --no-errors-on-unmatched --write && git update-index --again`

## Testing Conventions
- Test files: `src/**/*.test.ts`
- Helper utilities in `src/__test__/pool-helper.ts`
- Pattern: `afterEach(() => { resetPools(); resetState(); vi.restoreAllMocks(); })`
- Mock UI/camera dependencies in simulation tests with `vi.mock()`
- Use `spawnAt(team, type, x, y)` for deterministic unit spawning in tests
