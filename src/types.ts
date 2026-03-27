/** チーム番号: [0, MAX_TEAMS)。MAX_TEAMS 変更時は手動更新が必要 */
export type Team = 0 | 1 | 2 | 3 | 4;

/** バトル/スペクテイトモード専用の2チーム型。battle 系関数の引数に使用 */
export type BattleTeam = 0 | 1;

/** 搭載主砲の性能パラメータ */
export type Armament = { readonly fireRate: number; readonly damage: number; readonly range: number };

export interface Unit {
  alive: boolean;
  team: Team;
  type: UnitTypeIndex;
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
  mergeDmgMul: number;
  moduleId: ModuleId;
  squadronIdx: SquadronIndex;
}

export interface Squadron {
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
  sourceType: UnitTypeIndex;
}

/** reflectProjectile() で読み書きされる Projectile フィールドの部分型 */
export type ReflectableProjectile = Pick<
  Projectile,
  | 'x'
  | 'y'
  | 'vx'
  | 'vy'
  | 'life'
  | 'team'
  | 'r'
  | 'g'
  | 'b'
  | 'sourceType'
  | 'sourceUnit'
  | 'homing'
  | 'aoe'
  | 'target'
>;

export interface UnitType {
  name: string;
  /** UI 表示用のロール分類 */
  role: UnitRole;
  cost: number;
  size: number;
  hp: number;
  speed: number;
  turnRate: number;
  fireRate: number;
  attackRange: number;
  aggroRange: number;
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
  /** 1回の生産でスポーンする基礎クラスター数 */
  clusterSize: number;
  /** Boids separation 重み（デフォルト 3） */
  separationWeight: number;
  /** Boids alignment 重み（デフォルト 0.5） */
  alignmentWeight: number;
  /** Boids cohesion 重み（デフォルト 0.01） */
  cohesionWeight: number;
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

export type TimeScale = 1 | 2 | 4;

export type BattlePhase = 'spectate' | 'battle' | 'melee' | 'bonus' | 'battleEnding' | 'meleeEnding' | 'aftermath';

/** battle / bonus の両フェーズが battle-tracker の経過時間・生産を共有するか判定 */
export const isBattleLikePhase = (bp: BattlePhase): bp is 'battle' | 'bonus' => bp === 'battle' || bp === 'bonus';

/** プールインデックスの branded type（型レベルで異なるプール間のインデックス混用を防止） */
export type UnitIndex = number & { readonly __brand: 'UnitIndex' };
export type ParticleIndex = number & { readonly __brand: 'ParticleIndex' };
export type ProjectileIndex = number & { readonly __brand: 'ProjectileIndex' };
export type SquadronIndex = number & { readonly __brand: 'SquadronIndex' };
export type UnitTypeIndex = number & { readonly __brand: 'UnitTypeIndex' };
export type ModuleId = number & { readonly __brand: 'ModuleId' };

/** ターゲットなし / スロットなしを示すセンチネル値 */
export const NO_UNIT = -1 as UnitIndex;
export const NO_PARTICLE = -1 as ParticleIndex;
export const NO_PROJECTILE = -1 as ProjectileIndex;
export const NO_SQUADRON = -1 as SquadronIndex;
export const NO_TYPE = -1 as UnitTypeIndex;
export const NO_MODULE = -1 as ModuleId;

/** ユニットタイプのロール分類 */
export type UnitRole = 'attack' | 'support' | 'special' | 'environment' | 'mothership';
