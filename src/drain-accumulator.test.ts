import { describe, expect, it, vi } from 'vitest';
import { SIM_DT } from './constants.ts';
import { drainAccumulator, MAX_SIM_STEPS_PER_FRAME } from './drain-accumulator.ts';

describe('drainAccumulator', () => {
  it('SIM_DT 未満 → stepFn 未呼出、accumulator そのまま返却', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(SIM_DT * 0.5, stepFn);
    expect(stepFn).not.toHaveBeenCalled();
    expect(result).toBeCloseTo(SIM_DT * 0.5);
  });

  it('ちょうど 1 SIM_DT → stepFn 1回', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(SIM_DT, stepFn);
    expect(stepFn).toHaveBeenCalledTimes(1);
    expect(result).toBeCloseTo(0);
  });

  it('4 SIM_DT → stepFn 4回', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(SIM_DT * 4, stepFn);
    expect(stepFn).toHaveBeenCalledTimes(4);
    expect(result).toBeCloseTo(0);
  });

  it('8 SIM_DT (キャップぴったり) → stepFn 8回', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(SIM_DT * MAX_SIM_STEPS_PER_FRAME, stepFn);
    expect(stepFn).toHaveBeenCalledTimes(MAX_SIM_STEPS_PER_FRAME);
    expect(result).toBeCloseTo(0);
  });

  it('12 SIM_DT (キャップ超過) → stepFn 8回、残余破棄 (return 0)', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(SIM_DT * 12, stepFn);
    expect(stepFn).toHaveBeenCalledTimes(MAX_SIM_STEPS_PER_FRAME);
    expect(result).toBe(0);
  });

  it('8 SIM_DT + 端数 → stepFn 8回、端数 (< SIM_DT) 保持', () => {
    const stepFn = vi.fn();
    const fraction = SIM_DT * 0.3;
    const result = drainAccumulator(SIM_DT * MAX_SIM_STEPS_PER_FRAME + fraction, stepFn);
    expect(stepFn).toHaveBeenCalledTimes(MAX_SIM_STEPS_PER_FRAME);
    expect(result).toBeCloseTo(fraction);
  });

  it('0 → stepFn 未呼出、0 返却', () => {
    const stepFn = vi.fn();
    const result = drainAccumulator(0, stepFn);
    expect(stepFn).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });
});
