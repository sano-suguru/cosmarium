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
  shielded: boolean;
  stun: number;
  spawnCooldown: number;
  teleportTimer: number;
  beamOn: number;
  kills: number;
  vet: number;
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
}

export interface Asteroid {
  x: number;
  y: number;
  radius: number;
  angle: number;
  angularVelocity: number;
}

export interface Base {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
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

export type GameState = 'menu' | 'play' | 'win';
export type GameMode = 0 | 1 | 2;
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

export function enemyTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}
