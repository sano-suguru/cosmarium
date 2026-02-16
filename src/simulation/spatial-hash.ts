import { CELL_SIZE, NEIGHBOR_BUFFER_SIZE, POOL_UNITS } from '../constants.ts';
import { getUnit } from '../pools.ts';
import type { UnitIndex } from '../types.ts';

const hashMap = new Map<number, UnitIndex[]>();
const neighborBuffer: UnitIndex[] = new Array(NEIGHBOR_BUFFER_SIZE);

/** Hot-path accessor — bounds guaranteed by caller's count loop */
export function getNeighborAt(i: number): UnitIndex {
  const v = neighborBuffer[i];
  if (v === undefined) throw new RangeError(`Invalid neighbor index: ${i}`);
  return v;
}

const _pooled: UnitIndex[][] = [];
const _used: UnitIndex[][] = [];

export function buildHash() {
  for (let i = 0; i < _used.length; i++) {
    const arr = _used[i];
    if (arr === undefined) throw new RangeError(`Invalid _used index: ${i}`);
    arr.length = 0;
    _pooled.push(arr);
  }
  _used.length = 0;
  hashMap.clear();
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    const k = (((u.x / CELL_SIZE) | 0) * 73856093) ^ (((u.y / CELL_SIZE) | 0) * 19349663);
    let a = hashMap.get(k);
    if (!a) {
      const pooled = _pooled.pop();
      a = pooled !== undefined ? pooled : [];
      hashMap.set(k, a);
      _used.push(a);
    }
    a.push(i as UnitIndex);
  }
}

/** Collect units from a single hash cell into neighborBuffer */
function collectCellNeighbors(key: number, count: number): number {
  const a = hashMap.get(key);
  if (!a) return count;
  let n = count;
  for (let i = 0; i < a.length; i++) {
    const idx = a[i];
    if (idx === undefined) throw new RangeError(`Invalid cell entry at position ${i}`);
    if (n < neighborBuffer.length) neighborBuffer[n++] = idx;
  }
  return n;
}

export function getNeighbors(x: number, y: number, r: number): number {
  let n = 0;
  const cr = Math.ceil(r / CELL_SIZE);
  const cx = (x / CELL_SIZE) | 0,
    cy = (y / CELL_SIZE) | 0;
  for (let dx = -cr; dx <= cr; dx++) {
    for (let dy = -cr; dy <= cr; dy++) {
      n = collectCellNeighbors(((cx + dx) * 73856093) ^ ((cy + dy) * 19349663), n);
    }
  }
  return n;
}

export function knockback(ti: UnitIndex, fx: number, fy: number, force: number) {
  const u = getUnit(ti);
  const dx = u.x - fx,
    dy = u.y - fy;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const f = force / u.mass;
  u.vx += (dx / d) * f;
  u.vy += (dy / d) * f;
}
