// Pure simulation types: no DOM, no Three.js, so a game server can run the same code.

export type FighterId = 'hotfix' | 'legacy' | 'standup' | 'intern';
export type WeaponKind = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'rockets';
export type ItemKind = 'bomb' | 'medkit';
export type LootKind = Exclude<WeaponKind, 'fists'> | ItemKind | 'armor' | 'ammo';

export interface Input {
  /** Movement, each -1..1 (x right, y down the map). */
  mx: number;
  my: number;
  fire: boolean;
  /** Jump out of the drone / use super. */
  super: boolean;
  /** Pick up, swap, or use the item. */
  use: boolean;
  /** Reload the gun (R). */
  reload: boolean;
  /** Lean round a corner: -1 left (Q), 1 right (E), 0 upright. */
  lean: number;
  jump: boolean;
  /** Aim point on the map. */
  aimX: number;
  aimY: number;
}

export const NO_INPUT: Input = { mx: 0, my: 0, fire: false, super: false, use: false, reload: false, lean: 0, jump: false, aimX: 0, aimY: 0 };

export interface Player {
  id: number;
  name: string;
  fighter: FighterId;
  bot: boolean;
  /** Where in the drop: on the plane, falling (free fall, then under the parachute), or on the ground. */
  stage: 'drone' | 'falling' | 'ground';
  fall: number; // seconds of the descent left; the parachute is open for the last DROP.chute seconds
  x: number;
  y: number;
  /** Velocity: movement accelerates and slows down instead of snapping. */
  vx: number;
  vy: number;
  heading: number;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  weapon: WeaponKind;
  /** Rounds in the magazine, and spare rounds carried for this gun. */
  mag: number;
  ammo: number;
  /** Seconds of reloading left (0 = not reloading). */
  reload: number;
  cooldown: number;
  item: ItemKind | null;
  superCharge: number; // 0..1
  healLeft: number;
  sinceCombat: number;
  revealed: number;
  dashTime: number;
  dashAngle: number;
  dashHit: number[];
  slowed: number;
  /** Vaulting over a fence, window sill or low furniture: seconds left, and from/to. */
  vault: number;
  vaultFrom: { x: number; y: number };
  vaultTo: { x: number; y: number };
  /** How long you've been pushing into something you could vault. */
  pushing: number;
  /** Leaning: -1 (left) .. 1 (right), eased towards the input. */
  lean: number;
  /** Holding to throw a rocket or a bomb farther: seconds held, and what is being charged. */
  charge: number;
  charging: 'rockets' | 'bomb' | null;
  kills: number;
  damage: number;
  placement: number; // 0 while alive
  lastHitBy: number | null;
  prev: Input;
}

export interface Projectile {
  id: number;
  owner: number;
  kind: 'bullet' | 'lob';
  /** The gun that fired it: sets how damage falls off with distance. */
  weapon: WeaponKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  sx: number; // lob start
  sy: number;
  tx: number; // lob target
  ty: number;
  t: number; // 0..1 along the arc
  duration: number;
  radius: number;
}

export interface Loot {
  id: number;
  kind: LootKind;
  x: number;
  y: number;
  /** Ammo left in a dropped weapon. */
  ammo: number;
  active: boolean;
}

export interface TempWall {
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
}

export interface Field {
  x: number;
  y: number;
  r: number;
  life: number;
  owner: number;
}

export interface Zone {
  phase: number;
  state: 'wait' | 'shrink' | 'done';
  timer: number;
  cx: number;
  cy: number;
  r: number;
  fromX: number;
  fromY: number;
  fromR: number;
  toX: number;
  toY: number;
  toR: number;
  dps: number;
}

export interface Drone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number; // 0..1 along the flight
}

export type GameEvent =
  | { type: 'shot'; owner: number; x: number; y: number; angle: number; weapon: WeaponKind }
  | { type: 'hit'; target: number; by: number | null; x: number; y: number; damage: number; armor: boolean; ko: boolean }
  | { type: 'impact'; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'rackBroken'; x: number; y: number }
  | { type: 'super'; owner: number; fighter: FighterId; x: number; y: number; angle: number }
  | { type: 'pickup'; player: number; kind: LootKind }
  | { type: 'reload'; player: number; weapon: WeaponKind; x: number; y: number }
  | { type: 'dryFire'; player: number }
  | { type: 'vault'; player: number; x: number; y: number }
  | { type: 'jump'; player: number }
  | { type: 'land'; player: number; x: number; y: number }
  | { type: 'ko'; victim: number; by: number | null; x: number; y: number }
  | { type: 'zone'; phase: number; state: Zone['state'] }
  | { type: 'win'; player: number };

export interface GameState {
  tick: number;
  phase: 'drop' | 'play' | 'over';
  seed: number;
  nextId: number;
  drone: Drone;
  /** Rack health per tile index; 0 = broken or no rack. */
  racks: number[];
  players: Player[];
  projectiles: Projectile[];
  loot: Loot[];
  walls: TempWall[];
  fields: Field[];
  zone: Zone;
  winner: number | null;
  events: GameEvent[];
}
