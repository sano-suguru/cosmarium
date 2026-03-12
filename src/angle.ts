import { PI, TAU } from './constants.ts';

/** 角度差 (target - current) を [-π, π] 範囲に正規化する */
export function normalizeAngleDelta(target: number, current: number): number {
  let ad = target - current;
  if (ad > PI) {
    ad -= TAU;
  }
  if (ad < -PI) {
    ad += TAU;
  }
  return ad;
}
