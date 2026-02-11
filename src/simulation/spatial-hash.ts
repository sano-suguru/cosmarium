import { CELL, PU } from '../constants.ts';
import { uP } from '../pools.ts';

var hM = new Map<number, number[]>();
export var _nb: number[] = new Array(350);

var _pooled: number[][] = [];
var _used: number[][] = [];

export function bHash() {
  for (var i = 0; i < _used.length; i++) {
    var arr = _used[i]!;
    arr.length = 0;
    _pooled.push(arr);
  }
  _used.length = 0;
  hM.clear();
  for (var i = 0; i < PU; i++) {
    var u = uP[i]!;
    if (!u.alive) continue;
    var k = (((u.x / CELL) | 0) * 73856093) ^ (((u.y / CELL) | 0) * 19349663);
    var a = hM.get(k);
    if (!a) {
      a = _pooled.length > 0 ? _pooled.pop()! : [];
      hM.set(k, a);
      _used.push(a);
    }
    a.push(i);
  }
}

export function gN(x: number, y: number, r: number, buf: number[]): number {
  var n = 0;
  var cr = Math.ceil(r / CELL);
  var cx = (x / CELL) | 0,
    cy = (y / CELL) | 0;
  for (var dx = -cr; dx <= cr; dx++) {
    for (var dy = -cr; dy <= cr; dy++) {
      var a = hM.get(((cx + dx) * 73856093) ^ ((cy + dy) * 19349663));
      if (a) {
        for (var i = 0; i < a.length; i++) {
          if (n < buf.length) buf[n++] = a[i]!;
        }
      }
    }
  }
  return n;
}

export function kb(ti: number, fx: number, fy: number, force: number) {
  var u = uP[ti]!;
  var dx = u.x - fx,
    dy = u.y - fy;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  var f = force / u.mass;
  u.vx += (dx / d) * f;
  u.vy += (dy / d) * f;
}
