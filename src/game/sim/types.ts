// Pure simulation types: no DOM, no Three.js, so a game server can run the same code.

export type FighterId = 'hotfix' | 'legacy' | 'standup' | 'intern';
export type WeaponKind = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'rockets';
/** Heals you carry (as many as your backpack holds): a bandage is small and quick, a med kit big and slow, coffee a boost over time. */
export type HealKind = 'bandage' | 'medkit' | 'coffee';
export type ItemKind = 'bomb' | HealKind;
export type LootKind = Exclude<WeaponKind, 'fists'> | ItemKind | 'armor' | 'ammo' | 'backpack';

/** A gun in a slot: what it is, its rarity (0 common, 1 tuned, 2 prime), rounds in the magazine and spare rounds. */
export interface Gun {
  weapon: WeaponKind;
  rarity: number;
  mag: number;
  ammo: number;
}

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
  /** Dodge roll (Shift). */
  roll: boolean;
  jump: boolean;
  /** First-person view: the body turns to the aim at once (the mouse is the neck), no turn rate. */
  snap?: boolean;
  /** First person: how far up (+) or down (-) you look, radians. A rocket flies that way. */
  pitch?: number;
  /** Looking through the sniper's scope (right mouse button, Z, or the touch button). */
  scope?: boolean;
  /** Mouse aim: the aim point is where to throw (a bomb lands under the cursor). */
  throwAt?: boolean;
  /** Draw the gun in slot 1 or 2, or take the heals (3) or a bomb (4) in hand (0 = no change). */
  slot?: number;
  /** Switch to the other gun (X, the mouse wheel, the touch SWAP button). */
  cycle?: boolean;
  /** Heal: a med kit when badly hurt, else a bandage; coffee when there is nothing to heal. */
  heal?: boolean;
  /** Drink a coffee. */
  coffee?: boolean;
  /** Crouched (G toggles it on the client; the sim gets the state). */
  crouch?: boolean;
  /** Aim point on the map. */
  aimX: number;
  aimY: number;
}

export const NO_INPUT: Input = { mx: 0, my: 0, fire: false, super: false, use: false, reload: false, lean: 0, roll: false, jump: false, aimX: 0, aimY: 0 };

export interface Player {
  id: number;
  name: string;
  fighter: FighterId;
  bot: boolean;
  /** Where in the drop: on the plane, falling (free fall, then under the parachute), or on the ground. */
  stage: 'drone' | 'falling' | 'ground';
  /** In the air: height above the ground (m), descent speed (m/s, down is positive) and seconds since the canopy's pull (-1 before). */
  alt: number;
  vz: number;
  canopy: number;
  x: number;
  y: number;
  /** Velocity: movement accelerates and slows down instead of snapping. */
  vx: number;
  vy: number;
  /** On the ground: feet above the ground (m; a roof or a hop lifts them) and vertical speed (m/s, up is positive). */
  z: number;
  jz: number;
  /** Climbing a ladder onto a roof: seconds left (uses vaultFrom/vaultTo for where from and to). */
  climb: number;
  heading: number;
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  /** The gun in your hands: kind and rarity (0 common, 1 tuned, 2 prime). */
  weapon: WeaponKind;
  rarity: number;
  /** Rounds in the magazine, and spare rounds carried for this gun. */
  mag: number;
  ammo: number;
  /** Which of the two slots is in your hands (0 = slot 1), and the gun in the other one (null = empty). */
  slot: number;
  holster: Gun | null;
  /** Seconds left of drawing the other gun (no shooting meanwhile). */
  swapping: number;
  /** The vest you wear (0 none, 1..3) and the backpack (0 none, 1..2). `armor` is what is left of the vest. */
  vest: number;
  pack: number;
  bandages: number;
  medkits: number;
  coffees: number;
  bombs: number;
  /** Using a heal: which, and seconds left (you walk slowly and cannot shoot; firing, rolling or swapping cancels it). */
  using: HealKind | null;
  useLeft: number;
  /** Coffee: seconds of its boost left (healing over time and a little faster on your feet). */
  buzz: number;
  /** Seconds of reloading left (0 = not reloading). */
  reload: number;
  cooldown: number;
  superCharge: number; // 0..1
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
  /** Crouching: 0 (standing) .. 1 (down), eased towards the input. */
  crouch: number;
  /** In hand instead of the gun (3 / 4): the heals (shoot uses one) or a bomb (hold shoot, let go to throw). */
  item: 'heal' | 'bomb' | null;
  /** Dodge roll: seconds left, its direction, and the recharge. */
  rolling: number;
  rollDir: number;
  rollCooldown: number;
  /** Deadline damage taken in the current second, and how far into that second we are. */
  zoneSum: number;
  zoneClock: number;
  /** Holding to throw a rocket or a bomb farther (seconds held), or aiming the slow-field canister: what is being charged. */
  charge: number;
  charging: 'rockets' | 'bomb' | 'super' | null;
  kills: number;
  damage: number;
  placement: number; // 0 while alive
  lastHitBy: number | null;
  /** What hit you last: a gun, 'explosion', 'super' or 'zone'. */
  lastHitWith: string | null;
  /** For the result screen: who took you out and with what (null by = the Deadline), and when. */
  killedBy: number | null;
  killedWith: string | null;
  diedAt: number;
  /** Bullets and pellets fired, how many hit someone, metres moved on the ground. */
  shots: number;
  hits: number;
  distance: number;
  prev: Input;
  /** The tick this fighter touched down (absent until they do). */
  landedTick?: number;
}

export interface Projectile {
  id: number;
  owner: number;
  kind: 'bullet' | 'lob' | 'rocket';
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
  /** A rocket flies under its own power; kept for old snapshots. */
  rocket?: boolean;
  /** The slow-field canister (a super): bursts and leaves a slow field instead of exploding. */
  field?: boolean;
  /**
   * Height above the ground (m). Bullets: from the shooter's height to the target's over `hd`
   * metres (so a round fired up at a parachute climbs to it). Rockets: their own height, with
   * vertical speed `vh` and a gentle drop.
   */
  h?: number;
  h0?: number;
  h1?: number;
  hd?: number;
  vh?: number;
}

export interface Loot {
  id: number;
  kind: LootKind;
  x: number;
  y: number;
  /** Rounds left in a dropped weapon, points left in a vest, how many in a stack of heals. */
  ammo: number;
  /** A gun's rarity (0 common, 1 tuned, 2 prime), a vest's tier (1..3) or a backpack's (1..2). */
  tier?: number;
  active: boolean;
  /** Height it lies at (dropped on a roof); absent = on the ground or a floor. */
  z?: number;
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
  /** Height it lies at (on a roof); absent = the ground. */
  z?: number;
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
  /** Seconds since anybody last damaged another player (drives the lull breaker). */
  calm: number;
  /** This wait was already halved by the endgame squeeze. */
  halved: boolean;
}

export interface Drone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number; // 0..1 along the flight
}

export type GameEvent =
  /** `len`: for a round that lands the tick it is fired (the sniper), how far it flew before it stopped, so the contrail ends there. */
  | { type: 'shot'; owner: number; x: number; y: number; angle: number; weapon: WeaponKind; len?: number }
  | { type: 'hit'; target: number; by: number | null; x: number; y: number; damage: number; armor: boolean; ko: boolean }
  /** `z`: the height it happened at (absent = the old default height). */
  | { type: 'impact'; x: number; y: number; z?: number }
  | { type: 'explosion'; x: number; y: number; radius: number; z?: number }
  | { type: 'rackBroken'; x: number; y: number }
  | { type: 'super'; owner: number; fighter: FighterId; x: number; y: number; angle: number }
  | { type: 'pickup'; player: number; kind: LootKind }
  /** Drew the other gun. */
  | { type: 'swap'; player: number; weapon: WeaponKind }
  /** A bomb thrown from the hand (the throw's swing). */
  | { type: 'throw'; player: number }
  /** Started (`done` false) or finished (true) using a heal. */
  | { type: 'heal'; player: number; kind: HealKind; done: boolean }
  /** Once a second while someone stands outside the Deadline: what it took that second. */
  | { type: 'zoneHurt'; player: number; x: number; y: number; amount: number }
  | { type: 'reload'; player: number; weapon: WeaponKind; x: number; y: number }
  | { type: 'dryFire'; player: number }
  | { type: 'vault'; player: number; x: number; y: number }
  | { type: 'roll'; player: number; x: number; y: number }
  /** A jump on foot pushed off (the jump key, or Space where the mouse shoots). */
  | { type: 'hop'; player: number; x: number; y: number }
  /** The slow-field canister burst: the burst radius and the field's. */
  | { type: 'slowBurst'; owner: number; x: number; y: number; burst: number; radius: number; z?: number }
  | { type: 'jump'; player: number }
  /** The trigger was pulled in the plane, in free fall or under the canopy (nothing fires there): the hint "Land first, then shoot". */
  | { type: 'fireBlocked'; player: number }
  | { type: 'land'; player: number; x: number; y: number; z?: number }
  /** Feet coming down hard on foot (off a roof's edge, from a ladder's top): a thump, not a parachute landing. */
  | { type: 'thud'; player: number; x: number; y: number; z?: number }
  | { type: 'ko'; victim: number; by: number | null; with: string | null; x: number; y: number }
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
  /** A new player's first rounds: the bots go easy on the person (see `NEWBIE`). Part of the match setup, so the sim stays deterministic. */
  rookie?: boolean;
}
