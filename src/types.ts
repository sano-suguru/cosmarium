export interface Unit {
  alive: boolean;
  team: Team;
  type: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  target: UnitIndex;
  wanderAngle: number;
  trailTimer: number;
  mass: number;
  abilityCooldown: number;
  shieldLingerTimer: number;
  stun: number;
  spawnCooldown: number;
  teleportTimer: number;
  beamOn: number;
  sweepPhase: number;
  sweepBaseAngle: number;
  kills: number;
  vet: number;
  burstCount: number;
  swarmN: number;
}

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  shape: number;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  team: Team;
  size: number;
  r: number;
  g: number;
  b: number;
  homing: boolean;
  aoe: number;
  targetIndex: UnitIndex;
}

export interface UnitType {
  name: string;
  size: number;
  hp: number;
  speed: number;
  turnRate: number;
  fireRate: number;
  range: number;
  damage: number;
  shape: number;
  trailInterval: number;
  mass: number;
  description: string;
  attackDesc: string;
  aoe?: number;
  beam?: boolean;
  heals?: boolean;
  reflects?: boolean;
  spawns?: boolean;
  homing?: boolean;
  rams?: boolean;
  emp?: boolean;
  teleports?: boolean;
  chain?: boolean;
  sweep?: boolean;
  swarm?: boolean;
  burst?: number;
}

export interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  width: number;
  tapered?: boolean;
  stepDiv?: number;
  lightning?: boolean;
}

export interface TrackingBeam {
  srcUnit: UnitIndex;
  tgtUnit: UnitIndex;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  width: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
  targetZ: number;
  targetX: number;
  targetY: number;
  shakeX: number;
  shakeY: number;
  shake: number;
}

export interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export type Color3 = [number, number, number];

export type GameState = 'menu' | 'play';
export type Team = 0 | 1;
export const TEAMS: readonly [Team, Team] = [0, 1];

/** プールインデックスの branded type（型レベルで異なるプール間のインデックス混用を防止） */
export type UnitIndex = number & { readonly __brand: 'UnitIndex' };
export type ParticleIndex = number & { readonly __brand: 'ParticleIndex' };
export type ProjectileIndex = number & { readonly __brand: 'ProjectileIndex' };

/** ターゲットなし / スロットなしを示すセンチネル値 */
export const NO_UNIT = -1 as UnitIndex;
export const NO_PARTICLE = -1 as ParticleIndex;
export const NO_PROJECTILE = -1 as ProjectileIndex;
