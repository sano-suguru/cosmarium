import { POOL_UNITS } from '../constants.ts';
import { getUnit } from '../pools.ts';

const HOTSPOT_CELL_SIZE = 400;
const HOTSPOT_UPDATE_INTERVAL = 6;

type CellData = { t0: number; t1: number; sx: number; sy: number; count: number };

let hotspot: { x: number; y: number; radius: number } | null = null;
let frameCounter = 0;

function cellKey(x: number, y: number): number {
  const gx = Math.floor(x / HOTSPOT_CELL_SIZE);
  const gy = Math.floor(y / HOTSPOT_CELL_SIZE);
  return gx * 100003 + gy;
}

function buildCellMap(): Map<number, CellData> {
  const cells = new Map<number, CellData>();
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
    const key = cellKey(u.x, u.y);
    let cell = cells.get(key);
    if (!cell) {
      cell = { t0: 0, t1: 0, sx: 0, sy: 0, count: 0 };
      cells.set(key, cell);
    }
    if (u.team === 0) cell.t0 += 1;
    else cell.t1 += 1;
    cell.sx += u.x;
    cell.sy += u.y;
    cell.count += 1;
  }
  return cells;
}

function pickBestCell(cells: Map<number, CellData>): { key: number; cell: CellData } | null {
  let bestKey: number | null = null;
  let bestCell: CellData | null = null;
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
  for (let i = 0; i < POOL_UNITS; i++) {
    const u = getUnit(i);
    if (!u.alive) continue;
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
    hotspot = null;
    return;
  }

  const centerX = best.cell.sx / best.cell.count;
  const centerY = best.cell.sy / best.cell.count;
  const maxDist = maxDistanceInCell(best.key, centerX, centerY);
  hotspot = { x: centerX, y: centerY, radius: Math.max(HOTSPOT_CELL_SIZE * 0.5, maxDist + 50) };
}

export function getHotspot(): { x: number; y: number; radius: number } | null {
  return hotspot;
}

export function resetHotspot(): void {
  hotspot = null;
  frameCounter = 0;
}
