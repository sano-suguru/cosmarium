---
paths:
  - "src/**/*.test.ts"
---

# Testing Rules

## Vitest

Test files: `src/**/*.test.ts`. Single file: `bunx vitest run src/path/to.test.ts`

Helpers in `src/__test__/pool-helper.ts`:
- `resetPools()` / `resetState()` — reset pools/state to defaults
- `spawnAt(team, type, x, y)` — mock `Math.random` for deterministic spawning
- `fillUnitPool()` — fill entire unit pool
- `makeGameLoopState()` — create `GameLoopState` for testing
- Standard afterEach: `resetPools(); resetState(); vi.restoreAllMocks();`

## PRNG

`rng()` (`state.ts`) — deterministic mulberry32. Fix seed with `seedRng(seed)` in tests. Camera shake uses `Math.random()` (not seeded). Codex demo uses `demoRng` (`Math.random`-based, intentionally non-deterministic).
