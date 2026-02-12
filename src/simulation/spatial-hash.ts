import { CELL_SIZE, POOL_UNITS } from '../constants.ts';
import { unitPool } from '../pools.ts';

const hashMap = new Map<number, number[]>();
export const neighborBuffer: number[] = new Array(350);

const _pooled: number[][] = [];
const _used: number[][] = [];

export function buildHash() {
  for (let i = 0; i < _used.length; i++) {
    const arr = _used[i]!;
    arr.length = 0;
    _pooled.push(arr);
  }
  _used.length = 0;
  hashMap.clear();
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = unitPool[i]!;
    if (!u.alive) continue;
    const k = (((u.x / CELL_SIZE) | 0) * 73856093) ^ (((u.y / CELL_SIZE) | 0) * 19349663);
    let a = hashMap.get(k);
    if (!a) {
      a = _pooled.length > 0 ? _pooled.pop()! : [];
      hashMap.set(k, a);
      _used.push(a);
    }
    a.push(i);
  }
}

export function getNeighbors(x: number, y: number, r: number, buf: number[]): number {
  let n = 0;
  const cr = Math.ceil(r / CELL_SIZE);
  const cx = (x / CELL_SIZE) | 0,
    cy = (y / CELL_SIZE) | 0;
  for (let dx = -cr; dx <= cr; dx++) {
    for (let dy = -cr; dy <= cr; dy++) {
      const a = hashMap.get(((cx + dx) * 73856093) ^ ((cy + dy) * 19349663));
      if (a) {
        for (let i = 0; i < a.length; i++) {
          if (n < buf.length) buf[n++] = a[i]!;
        }
      }
    }
  }
  return n;
}

export function knockback(ti: number, fx: number, fy: number, force: number) {
  const u = unitPool[ti]!;
  const dx = u.x - fx,
    dy = u.y - fy;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const f = force / u.mass;
  u.vx += (dx / d) * f;
  u.vy += (dy / d) * f;
}
