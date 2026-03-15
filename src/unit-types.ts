import type { UnitType } from './types.ts';
import {
  arcer,
  bomber,
  cruiser,
  drone,
  fighter,
  flagship,
  lancer,
  launcher,
  scorcher,
  sniper,
} from './unit-defs-attack.ts';
import { asteroid, asteroidLarge, carrier, disruptor, mothership, scrambler, teleporter } from './unit-defs-special.ts';
import { amplifier, bastion, catalyst, healer, reflector } from './unit-defs-support.ts';

export const TYPES: UnitType[] = [
  drone,
  fighter,
  bomber,
  cruiser,
  flagship, // 0-4
  healer,
  reflector, // 5-6
  carrier, // 7
  sniper,
  lancer,
  launcher, // 8-10
  disruptor, // 11
  scorcher, // 12
  teleporter, // 13
  arcer, // 14
  bastion,
  amplifier, // 15-16
  scrambler, // 17
  catalyst, // 18
  mothership, // 19
  asteroid,
  asteroidLarge,
];

export const UNIT_TYPE_COUNT = TYPES.length;
