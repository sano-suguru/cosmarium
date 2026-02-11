export interface Unit {
  alive: boolean;
  team: number;
  type: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  hp: number;
  mhp: number;
  cd: number;
  tgt: number;
  wn: number;
  tT: number;
  mass: number;
  aCd: number;
  shielded: boolean;
  stun: number;
  sCd: number;
  tp: number;
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
  ml: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  sh: number;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  team: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  hom: boolean;
  aoe: number;
  tx: number;
}

export interface UnitType {
  nm: string;
  sz: number;
  hp: number;
  spd: number;
  tr: number;
  fr: number;
  rng: number;
  dmg: number;
  sh: number;
  trl: number;
  mass: number;
  desc: string;
  atk: string;
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
  ml: number;
  w: number;
}

export interface Asteroid {
  x: number;
  y: number;
  r: number;
  ang: number;
  va: number;
}

export interface Base {
  x: number;
  y: number;
  hp: number;
  mhp: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
  tz: number;
  tx: number;
  ty: number;
  shkx: number;
  shky: number;
  shk: number;
}

export interface FBO {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export type Color3 = [number, number, number];

export type GameState = 'menu' | 'play' | 'win';
export type GameMode = 0 | 1 | 2;
