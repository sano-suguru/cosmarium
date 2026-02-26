import { POOL_UNITS } from '../constants.ts';
import { poolCounts, unit } from '../pools.ts';

const HOTSPOT_CELL_SIZE = 400;
const HOTSPOT_UPDATE_INTERVAL = 6;

type HotspotCell = { t0: number; t1: number; sx: number; sy: number; count: number };

let _hotspot: { x: number; y: number; radius: number } | null = null;
let frameCounter = 0;

const _cellPool: HotspotCell[] = [];
let _cellPoolIdx = 0;

function acquireCell(): HotspotCell {
  if (_cellPoolIdx < _cellPool.length) {
    const c = _cellPool[_cellPoolIdx++] as HotspotCell;
    c.t0 = 0;
    c.t1 = 0;
    c.sx = 0;
    c.sy = 0;
    c.count = 0;
    return c;
  }
  const c: HotspotCell = { t0: 0, t1: 0, sx: 0, sy: 0, count: 0 };
  _cellPool.push(c);
  _cellPoolIdx++;
  return c;
}

const _cells = new Map<number, HotspotCell>();

function cellKey(x: number, y: number): number {
  const gx = Math.floor(x / HOTSPOT_CELL_SIZE);
  const gy = Math.floor(y / HOTSPOT_CELL_SIZE);
  return gx * 100003 + gy;
}

function buildCellMap(): Map<number, HotspotCell> {
  _cells.clear();
  _cellPoolIdx = 0;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    const key = cellKey(u.x, u.y);
    let cell = _cells.get(key);
    if (!cell) {
      cell = acquireCell();
      _cells.set(key, cell);
    }
    if (u.team === 0) cell.t0 += 1;
    else cell.t1 += 1;
    cell.sx += u.x;
    cell.sy += u.y;
    cell.count += 1;
  }
  return _cells;
}

function pickBestCell(cells: Map<number, HotspotCell>): { key: number; cell: HotspotCell } | null {
  let bestKey: number | null = null;
  let bestCell: HotspotCell | null = null;
  let bestScore = 0;
  for (const [key, cell] of cells) {
    const sum = cell.t0 + cell.t1;
    const score = Math.min(cell.t0, cell.t1) * sum;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
      bestCell = cell;
    }
  }
  if (bestScore === 0 || bestCell === null || bestKey === null || bestCell.count === 0) return null;
  return { key: bestKey, cell: bestCell };
}

function maxDistanceInCell(cellKeyValue: number, centerX: number, centerY: number): number {
  let maxDist = 0;
  for (let i = 0, rem = poolCounts.units; i < POOL_UNITS && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) continue;
    rem--;
    if (cellKey(u.x, u.y) !== cellKeyValue) continue;
    const dx = u.x - centerX;
    const dy = u.y - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) maxDist = dist;
  }
  return maxDist;
}

export function updateHotspot(): void {
  if (++frameCounter < HOTSPOT_UPDATE_INTERVAL) return;
  frameCounter = 0;

  const cells = buildCellMap();
  const best = pickBestCell(cells);
  if (!best) {
    _hotspot = null;
    return;
  }

  const centerX = best.cell.sx / best.cell.count;
  const centerY = best.cell.sy / best.cell.count;
  const maxDist = maxDistanceInCell(best.key, centerX, centerY);
  _hotspot = { x: centerX, y: centerY, radius: Math.max(HOTSPOT_CELL_SIZE * 0.5, maxDist + 50) };
}

export function hotspot(): { x: number; y: number; radius: number } | null {
  return _hotspot;
}

export function resetHotspot(): void {
  _hotspot = null;
  frameCounter = 0;
}
