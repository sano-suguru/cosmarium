import type { UnitType } from './types.ts';
import { NO_FIRE, resolve } from './unit-type-resolve.ts';

/** Mothership role units (9) */

const MS_UNIT = {
  cost: 0,
  role: 'mothership' as const,
  clusterSize: 0,
  trailInterval: 1.5,
  drag: 0.5,
  leadAccuracy: 0,
  fireRate: NO_FIRE,
  attackRange: 0,
  damage: 0,
  aggroRange: 1000,
  engageMin: 300,
  engageMax: 1000,
  attackDesc: 'なし',
};

export const hive: UnitType = resolve({
  ...MS_UNIT,
  name: 'Hive',
  size: 45,
  hp: 500,
  speed: 35,
  turnRate: 0.3,
  shape: 19,
  mass: 50,
  accel: 1.5,
  description: '生産速度に優れる母艦。この艦が撃沈されると敗北となる。',
});

export const dreadnought: UnitType = resolve({
  ...MS_UNIT,
  name: 'Dreadnought',
  size: 50,
  hp: 750,
  speed: 30,
  turnRate: 0.25,
  fireRate: 3.0,
  attackRange: 500,
  aggroRange: 1500,
  damage: 15,
  shape: 20,
  mass: 60,
  accel: 1.2,
  description: '重装甲＋遠距離主砲を搭載した母艦。この艦が撃沈されると敗北となる。',
  attackDesc: '遠距離主砲',
});

export const reactor: UnitType = resolve({
  ...MS_UNIT,
  name: 'Reactor',
  size: 40,
  hp: 350,
  speed: 38,
  turnRate: 0.35,
  shape: 21,
  mass: 45,
  accel: 1.8,
  description: '味方全体の攻撃速度を向上させる母艦。この艦が撃沈されると敗北となる。',
});

export const colossus: UnitType = resolve({
  ...MS_UNIT,
  name: 'Colossus',
  size: 55,
  hp: 600,
  speed: 28,
  turnRate: 0.2,
  shape: 24,
  mass: 65,
  accel: 1.0,
  description: '少数精鋭の重装母艦。ユニットのHP・攻撃力が2倍だがスロットは3つ。',
});

export const carrierBay: UnitType = resolve({
  ...MS_UNIT,
  name: 'Carrier Bay',
  size: 48,
  hp: 400,
  speed: 38,
  turnRate: 0.3,
  shape: 25,
  mass: 50,
  accel: 1.5,
  description: '7スロットの大型格納庫を持つ母艦。多様な編成で大器晩成を狙う。',
});

export const accelerator: UnitType = resolve({
  ...MS_UNIT,
  name: 'Accelerator',
  size: 44,
  hp: 450,
  speed: 35,
  turnRate: 0.3,
  shape: 26,
  mass: 48,
  accel: 1.6,
  description: 'スロット1の生産速度が3倍。一点特化で主力を高速展開する。',
});

export const syndicate: UnitType = resolve({
  ...MS_UNIT,
  name: 'Syndicate',
  size: 42,
  hp: 400,
  speed: 38,
  turnRate: 0.3,
  shape: 27,
  mass: 45,
  accel: 1.5,
  description: '無料リロール2回＋売却ボーナス。経済力で編成の質を高める。',
});

export const bloodborne: UnitType = resolve({
  ...MS_UNIT,
  name: 'Bloodborne',
  size: 46,
  hp: 800,
  speed: 30,
  turnRate: 0.25,
  shape: 28,
  mass: 55,
  accel: 1.2,
  description: '母艦HP半減と引き換えに毎ラウンド+4Cr。ハイリスク・ハイリターン。',
});

export const ascension: UnitType = resolve({
  ...MS_UNIT,
  name: 'Ascension',
  size: 42,
  hp: 350,
  speed: 36,
  turnRate: 0.3,
  shape: 29,
  mass: 45,
  accel: 1.6,
  description: 'マージ10回で覚醒。覚醒後は全ユニットのHP＋30%＆ダメージ＋20%。',
});
