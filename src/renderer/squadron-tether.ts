import { teamBaseColor } from '../colors.ts';
import { lerpX, lerpY } from '../interpolation.ts';
import { unitIdx } from '../pool-index.ts';
import { getUnitHWM, poolCounts, unit } from '../pools.ts';
import { getSquadronTetherTarget } from '../simulation/squadron.ts';
import { NO_UNIT } from '../types.ts';
import type { BeamEmitFn, BeamVisibilityFn } from './beam-segment.ts';
import { BEAM_ALPHA, BEAM_MAX_WIDTH_SCALE, beamFlicker, beamSegmentCount, beamWidthScale } from './beam-segment.ts';

const SQUADRON_TETHER_WIDTH = 0.75;
const SQUADRON_TETHER_DIM = 0.4;

export function renderSquadronTethers(now: number, emit: BeamEmitFn, isVisible: BeamVisibilityFn) {
  for (let i = 0, rem = poolCounts.units; i < getUnitHWM() && rem > 0; i++) {
    const u = unit(i);
    if (!u.alive) {
      continue;
    }
    rem--;
    const tgt = getSquadronTetherTarget(u, unitIdx(i));
    if (tgt === NO_UNIT) {
      continue;
    }
    const leader = unit(tgt);
    const x1 = lerpX(u);
    const y1 = lerpY(u);
    const x2 = lerpX(leader);
    const y2 = lerpY(leader);
    if (!isVisible(x1, y1, x2, y2, SQUADRON_TETHER_WIDTH * BEAM_MAX_WIDTH_SCALE)) {
      continue;
    }
    const c = teamBaseColor(u.team);
    const r = c[0] * SQUADRON_TETHER_DIM;
    const g = c[1] * SQUADRON_TETHER_DIM;
    const b = c[2] * SQUADRON_TETHER_DIM;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = beamSegmentCount(d);
    const ang = Math.atan2(dy, dx);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const fl = beamFlicker(j, now);
      emit(
        x1 + dx * t,
        y1 + dy * t,
        SQUADRON_TETHER_WIDTH * beamWidthScale(j, now),
        r * fl,
        g * fl,
        b * fl,
        BEAM_ALPHA,
        ang,
      );
    }
  }
}
