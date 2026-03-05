export interface Unit {
  alive: boolean;
  team: Team;
  type: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
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
  broadsidePhase: number;
  swarmN: number;
  boostTimer: number;
  boostCooldown: number;
  hitFlash: number;
  kbVx: number;
  kbVy: number;
  blinkCount: number;
  blinkPhase: number;
  energy: number;
  maxEnergy: number;
  shieldSourceUnit: UnitIndex;
  shieldCooldown: number;
  reflectFieldHp: number;
  fieldGrantCooldown: number;
  ampBoostTimer: number;
  scrambleTimer: number;
  catalystTimer: number;
  squadIdx: SquadIndex;
}

export interface Squad {
  alive: boolean;
  team: Team;
  leader: UnitIndex;
  objectiveX: number;
  objectiveY: number;
  objectiveTimer: number;
  memberCount: number;
}

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
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
  prevX: number;
  prevY: number;
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
  target: UnitIndex;
  sourceUnit: UnitIndex;
}

export interface UnitType {
  name: string;
  cost: number;
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
  accel: number;
  drag: number;
  /** 偏差射撃精度 (0=直射, 1=完全予測)。プロジェクタイル発射時にインターセプト予測を適用する度合い */
  leadAccuracy: number;
  description: string;
  attackDesc: string;
  aoe: number;
  carpet: boolean;
  beam: boolean;
  heals: boolean;
  reflects: boolean;
  spawns: boolean;
  homing: boolean;
  rams: boolean;
  emp: boolean;
  teleports: boolean;
  chain: boolean;
  sweep: boolean;
  swarm: boolean;
  broadside: boolean;
  /** 1トリガーあたりの合計発射数。1=単射 */
  shots: number;
  /** 1バーストあたりの同時発射数。2=左右ツイン。0=従来の単射 */
  salvo: number;
  /** salvo用キャノン位置オフセット [xRatio, yRatio][] — バーストインデックスで循環 */
  cannonOffsets?: readonly (readonly [number, number])[];
  boost?: { multiplier: number; duration: number; cooldown: number; triggerRange: number };
  massWeight: number;
  engageMin: number;
  engageMax: number;
  cooldownResetOnKill?: number;
  /** HP比率がこの値を下回ると退避行動を開始 (0-1, 省略時は退避なし) */
  retreatHpRatio?: number;
  shields: boolean;
  amplifies: boolean;
  scrambles: boolean;
  catalyzes: boolean;
  /** 味方追従の強度（0=なし, 0.4=弱い防御型, 1=フルサポート） */
  supportFollow: number;
  maxEnergy: number;
  energyRegen: number;
  shieldCooldown: number;
}

/** ユニットのCodexデモで「どの能力を見せるか」を決めるフラグ名。aoe/shots は number 型のため対象外。'burst' は UnitType プロパティ名ではなく shots > 1 の派生フラグ */
export type DemoFlag =
  | 'swarm'
  | 'carpet'
  | 'homing'
  | 'burst'
  | 'heals'
  | 'reflects'
  | 'spawns'
  | 'emp'
  | 'chain'
  | 'teleports'
  | 'rams'
  | 'sweep'
  | 'beam'
  | 'broadside'
  | 'shields'
  | 'amplifies'
  | 'scrambles'
  | 'catalyzes';

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
  tapered: boolean;
  stepDiv: number;
  lightning: boolean;
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

export type GameState = 'menu' | 'compose' | 'play' | 'result';

export type FleetEntry = { readonly type: number; readonly count: number };
export type FleetComposition = readonly FleetEntry[];

export type BattleSnapshot = { readonly survivors: number; readonly enemyKills: number };

export type BattleResult = {
  readonly victory: boolean;
  readonly elapsed: number;
  readonly playerSurvivors: number;
  readonly enemyKills: number;
  readonly playerLosses: number;
  readonly initialPlayerUnits: number;
};

/** チーム上限。Team / TeamCounts の基数を決定する（変更時は Team 定義も更新すること） */
export const MAX_TEAMS = 5;

/** チーム番号: [0, MAX_TEAMS)。MAX_TEAMS 変更時は手動更新が必要 */
export type Team = 0 | 1 | 2 | 3 | 4;

/** MAX_TEAMS 長の数値タプル（自動導出） */
type _Repeat<N extends number, T, Acc extends T[] = []> = Acc['length'] extends N ? Acc : _Repeat<N, T, [...Acc, T]>;
export type TeamTuple<T> = _Repeat<typeof MAX_TEAMS, T>;
export type TeamCounts = TeamTuple<number>;

/** TeamCounts の浅いコピーを型安全に生成する */
export function copyTeamCounts(src: Readonly<TeamCounts>): TeamCounts {
  return src.slice() as unknown as TeamCounts;
}

/** プールインデックスの branded type（型レベルで異なるプール間のインデックス混用を防止） */
export type UnitIndex = number & { readonly __brand: 'UnitIndex' };
export type ParticleIndex = number & { readonly __brand: 'ParticleIndex' };
export type ProjectileIndex = number & { readonly __brand: 'ProjectileIndex' };
export type SquadIndex = number & { readonly __brand: 'SquadIndex' };

/** ターゲットなし / スロットなしを示すセンチネル値 */
export const NO_UNIT = -1 as UnitIndex;
export const NO_PARTICLE = -1 as ParticleIndex;
export const NO_PROJECTILE = -1 as ProjectileIndex;
export const NO_SQUAD = -1 as SquadIndex;
