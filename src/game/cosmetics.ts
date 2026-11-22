/**
 * Everything a player can unlock, in one place: outfit sets, gun finishes, canopies and the Drop Smoke setting. Every item
 * only changes how things look: nothing here reaches the sim (health, speed, damage, hitboxes, fire rate all stay). The
 * lobby's Style row, the round report's reward card, the menu's next-reward line and the unlock rules all read this table.
 *
 * Ids are kind-prefixed (`outfit:arctic`, `finish:gold`, `canopy:mint`, `smoke:canopy`); `look` (what is worn) keeps the
 * plain key (`arctic`, `gold`, `mint`, `canopy`).
 */
import { CANOPIES, canopySwatch } from './canopies';
import { mulberry32 } from './sim/bot-params';

import type { Canopy } from './canopies';
import type { FighterId } from './sim/types';

export type RewardKind = 'outfit' | 'finish' | 'canopy' | 'smoke';
/** Where an item comes from: a career level, a day streak, or the start (level 1). */
export type Source = { level: number } | { streak: number };

/** A part colour: plain hex, or one of the two shared special materials (Terminal's glow, Legend's polished gold). */
export type PartColor = number | 'gold' | 'glow';
export type OutfitParts = Record<string, PartColor>;

export const FIGHTER_ORDER: FighterId[] = ['hotfix', 'legacy', 'standup', 'intern'];

export interface Item {
  /** Kind-prefixed, as saved. */
  id: string;
  kind: RewardKind;
  /** The plain key inside its kind. */
  key: string;
  name: string;
  from: Source;
}

// ---------- outfits

export interface Outfit extends Item {
  kind: 'outfit';
  /** Per fighter, every part that differs from Standard (missing parts keep the Standard colour). */
  parts: Record<FighterId, OutfitParts>;
}

/** The colours in the code before outfits existed: every part, so a set only lists what it changes. */
const STANDARD: Record<FighterId, OutfitParts> = {
  hotfix: { top: 0xf2542d, pants: 0x1b1f2e, shoes: 0xfffaf0, hood: 0xf2542d, pocket: 0xb8441f, headset: 0x1b1f2e, mic: 0xffc93c, strings: 0xfffaf0, pack: 0x4f5638, flap: 0x3b412a, roll: 0xa08c64, belt: 0x2a2d24, buckle: 0x9a9a8a },
  legacy: { top: 0x2ec27e, pants: 0x5a4a3a, shoes: 0x4a3426, shirt: 0xeef1f6, buttons: 0x1b1f2e, lens: 0x1b1f2e, pack: 0x4f5638, flap: 0x3b412a, roll: 0xa08c64, belt: 0x2a2d24, buckle: 0x9a9a8a },
  standup: { top: 0x3e7bfa, pants: 0x1b1f2e, shoes: 0xffc93c, lanyard: 0xe23d5c, badge: 0xffc93c, pack: 0x4f5638, flap: 0x3b412a, roll: 0xa08c64, belt: 0x2a2d24, buckle: 0x9a9a8a },
  intern: { top: 0xeef1f6, pants: 0x3e7bfa, shoes: 0xe23d5c, stripe: 0xe23d5c, beanie: 0xe23d5c, cuff: 0xa82e2e, pom: 0xffc93c, bag: 0xffc93c, bagTrim: 0xc98a1b, belt: 0x2a2d24, buckle: 0x9a9a8a },
};

const kit = (pack: PartColor, flap: PartColor, roll: PartColor): OutfitParts => ({ pack, flap, roll });

const outfit = (key: string, name: string, level: number, parts: Record<FighterId, OutfitParts>, extra: OutfitParts = {}): Outfit => ({
  id: `outfit:${key}`,
  kind: 'outfit',
  key,
  name,
  from: { level },
  parts: Object.fromEntries(FIGHTER_ORDER.map((f) => [f, { ...(f === 'intern' ? {} : extra), ...parts[f] }])) as Record<FighterId, OutfitParts>,
});

const NONE: OutfitParts = {};

export const OUTFITS: Outfit[] = [
  outfit('standard', 'Standard', 1, { hotfix: NONE, legacy: NONE, standup: NONE, intern: NONE }),
  outfit('darkmode', 'Dark Mode', 3, {
    hotfix: { top: 0x262a35, pants: 0x171a22, shoes: 0xf2542d, hood: 0xf2542d, pocket: 0x1b1f2e, headset: 0x1b1f2e, strings: 0xf2542d },
    legacy: { top: 0x262a35, pants: 0x171a22, shoes: 0x2ec27e, shirt: 0x3a3f4d, buttons: 0x2ec27e, lens: 0x2ec27e },
    standup: { top: 0x262a35, pants: 0x171a22, shoes: 0x3ec5ff, lanyard: 0x3e7bfa, badge: 0x3ec5ff },
    intern: { top: 0x262a35, pants: 0x171a22, shoes: 0xffc93c, stripe: 0xffc93c, beanie: 0x262a35, cuff: 0xffc93c, pom: 0xffc93c, bag: 0xffc93c, bagTrim: 0xc98a1b },
  }),
  outfit(
    'arctic',
    'Arctic',
    7,
    {
      hotfix: { top: 0xf4f6fa, pants: 0x8fa3b8, shoes: 0x5aa9e6, hood: 0xf4f6fa, pocket: 0xbfd6ea, headset: 0x2b3045, strings: 0x5aa9e6 },
      legacy: { top: 0xf4f6fa, pants: 0x8fa3b8, shoes: 0x2b3045, shirt: 0xbfd6ea, buttons: 0x2b3045, lens: 0x5aa9e6 },
      standup: { top: 0xf4f6fa, pants: 0x8fa3b8, shoes: 0x5aa9e6, lanyard: 0x5aa9e6, badge: 0xbfd6ea },
      intern: { top: 0xf4f6fa, pants: 0x2b3045, shoes: 0x5aa9e6, stripe: 0x5aa9e6, beanie: 0x5aa9e6, cuff: 0xbfd6ea, pom: 0xf4f6fa, bag: 0xbfd6ea, bagTrim: 0x8fa3b8 },
    },
    kit(0xdfe6ee, 0xb9c4d0, 0x8fa3b8),
  ),
  outfit(
    'synthwave',
    'Synthwave',
    12,
    {
      hotfix: { top: 0x6b3fd1, pants: 0x2a1f4d, shoes: 0x3ef0ff, hood: 0xff5fa2, pocket: 0x2a1f4d, headset: 0x2a1f4d, strings: 0x3ef0ff },
      legacy: { top: 0x6b3fd1, pants: 0x2a1f4d, shoes: 0xff5fa2, shirt: 0xff5fa2, buttons: 0x3ef0ff, lens: 0x3ef0ff },
      standup: { top: 0xff5fa2, pants: 0x2a1f4d, shoes: 0x3ef0ff, lanyard: 0x3ef0ff, badge: 0x6b3fd1 },
      intern: { top: 0xff5fa2, pants: 0x2a1f4d, shoes: 0x3ef0ff, stripe: 0x3ef0ff, beanie: 0x6b3fd1, cuff: 0x2a1f4d, pom: 0x3ef0ff, bag: 0x6b3fd1, bagTrim: 0xff5fa2 },
    },
    kit(0x2a1f4d, 0x1c1440, 0xff5fa2),
  ),
  outfit(
    'terminal',
    'Terminal',
    17,
    {
      hotfix: { top: 0x1c2420, pants: 0x141a17, shoes: 0x39ff88, hood: 0x1c2420, pocket: 0x1f6b45, headset: 0x1f6b45, mic: 'glow', strings: 0x39ff88 },
      legacy: { top: 0x1c2420, pants: 0x141a17, shoes: 0x1c2420, shirt: 0x1f6b45, buttons: 0x39ff88, lens: 'glow' },
      standup: { top: 0x1c2420, pants: 0x141a17, shoes: 0x39ff88, lanyard: 0x39ff88, badge: 'glow' },
      intern: { top: 0x1c2420, pants: 0x141a17, shoes: 0x39ff88, stripe: 'glow', beanie: 0x1c2420, cuff: 0x1f6b45, pom: 0x39ff88, bag: 0x1c2420, bagTrim: 0x39ff88 },
    },
    kit(0x1c2420, 0x141a17, 0x39ff88),
  ),
  outfit(
    'legend',
    'Legend',
    20,
    {
      hotfix: { top: 0x1c2024, pants: 0x23262f, shoes: 'gold', hood: 0x1c2024, pocket: 0x23262f, headset: 'gold', strings: 'gold', belt: 0x1c2024, buckle: 'gold' },
      legacy: { top: 0x1c2024, pants: 0x23262f, shoes: 0x1c2024, shirt: 0xf4f2ea, buttons: 'gold', lens: 'gold', belt: 0x1c2024, buckle: 'gold' },
      standup: { top: 0x1c2024, pants: 0x23262f, shoes: 'gold', lanyard: 'gold', badge: 'gold', belt: 0x1c2024, buckle: 'gold' },
      intern: { top: 0x1c2024, pants: 0x23262f, shoes: 'gold', stripe: 'gold', beanie: 0x1c2024, cuff: 'gold', pom: 'gold', bag: 0x23262f, bagTrim: 'gold', belt: 0x1c2024, buckle: 'gold' },
    },
    kit(0x23262f, 0x1c2024, 'gold'),
  ),
];

export const outfitById = (key: string): Outfit => OUTFITS.find((o) => o.key === key) ?? OUTFITS[0];

/** Every part colour for one fighter in an outfit (Standard under the set's own). */
export const outfitParts = (key: string, fighter: FighterId): OutfitParts => ({ ...STANDARD[fighter], ...outfitById(key).parts[fighter] });

/** The two shared special materials. */
/**
 * The spec asks for metalness 0.85-0.9 on gold and Synthwave, but the game has no environment map, so a high metalness renders
 * brown and grey (seen on the contact sheet). Metal is capped here so gold reads as gold; colours and roughness stay as specified.
 */
const METAL_CAP = 0.5;
export const GOLD_MATERIAL = { color: 0xffc23d, metalness: METAL_CAP, roughness: 0.28, emissive: 0x2a1a00 };
export const GLOW_MATERIAL = { color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.6 };

const hexOf = (c: PartColor): number => (c === 'gold' ? GOLD_MATERIAL.color : c === 'glow' ? GLOW_MATERIAL.color : c);

// ---------- gun finishes

/** One material's change; what is not given stays as the Factory material has it. */
export interface MatTweak {
  color?: number;
  metalness?: number;
  roughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}
export type GunMat = 'steel' | 'dark' | 'polymer' | 'walnut' | 'olive' | 'tan' | 'brass' | 'red' | 'glass';

export interface Finish extends Item {
  kind: 'finish';
  mats: Partial<Record<GunMat, MatTweak>>;
}

const finish = (key: string, name: string, from: Source, mats: Finish['mats']): Finish => ({ id: `finish:${key}`, kind: 'finish', key, name, from, mats });
/** The same change on several materials. */
const same = (names: GunMat[], t: MatTweak): Finish['mats'] => Object.fromEntries(names.map((n) => [n, t]));
const WOOD: GunMat[] = ['walnut', 'olive', 'tan'];
const TRIM: GunMat[] = ['brass', 'red'];

export const FINISHES: Finish[] = [
  finish('factory', 'Factory', { level: 1 }, {}),
  finish('arctic', 'Arctic', { level: 4 }, {
    steel: { color: 0x8c97a3, metalness: 0.5, roughness: 0.4 },
    dark: { color: 0x2b3045 },
    polymer: { color: 0xe9edf2, roughness: 0.7 },
    ...same(WOOD, { color: 0xdfe6ee, roughness: 0.75 }),
    ...same(TRIM, { color: 0x5aa9e6 }),
  }),
  finish('cherry', 'Cherry', { level: 8 }, {
    steel: { color: 0x2a2c31, metalness: 0.6, roughness: 0.35 },
    dark: { color: 0x15171d },
    polymer: { color: 0xc8202f, roughness: 0.35 },
    walnut: { color: 0xc8202f, roughness: 0.35 },
    olive: { color: 0xc8202f, roughness: 0.35 },
    tan: { color: 0xf4f2ea },
    ...same(TRIM, { color: 0xf4f2ea }),
  }),
  finish('gold', 'Gold Build', { level: 10 }, {
    steel: { color: 0xffc23d, metalness: METAL_CAP, roughness: 0.22, emissive: 0x2a1a00 },
    dark: { color: 0xd9961a, metalness: METAL_CAP, roughness: 0.3 },
    polymer: { color: 0x1c2024, roughness: 0.6 },
    ...same(WOOD, { color: 0x1c2024 }),
    ...same(TRIM, { color: 0xfff0b0, metalness: 0.6 }),
    glass: { color: 0xffe08a, emissive: 0x3a2a00 },
  }),
  finish('terminal', 'Terminal', { level: 14 }, {
    steel: { color: 0x1c2420, metalness: 0.4, roughness: 0.5 },
    dark: { color: 0x0b0f0d },
    polymer: { color: 0x141a17 },
    ...same(WOOD, { color: 0x1c2420 }),
    ...same(TRIM, { color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.8 }),
    glass: { color: 0x39ff88, emissive: 0x1f6b45 },
  }),
  finish('synthwave', 'Synthwave', { level: 18 }, {
    steel: { color: 0xd6dcff, metalness: METAL_CAP, roughness: 0.25 },
    dark: { color: 0x2a1f4d },
    polymer: { color: 0x6b3fd1 },
    ...same(WOOD, { color: 0xff5fa2 }),
    ...same(TRIM, { color: 0x3ef0ff, emissive: 0x1a6b70 }),
    glass: { color: 0x3ef0ff },
  }),
  finish('ember', 'Ember', { streak: 7 }, {
    steel: { color: 0x2a1210, metalness: 0.5 },
    dark: { color: 0x150a08 },
    polymer: { color: 0x3a1410 },
    ...same(WOOD, { color: 0xd9261c }),
    ...same(TRIM, { color: 0xffb020, emissive: 0x5a2a00 }),
  }),
];

export const finishById = (key: string): Finish => FINISHES.find((f) => f.key === key) ?? FINISHES[0];

// ---------- canopies and smoke

export interface CanopyItem extends Item {
  kind: 'canopy';
  canopy: Canopy;
}
export const CANOPY_ITEMS: CanopyItem[] = CANOPIES.map((c) => ({ id: `canopy:${c.id}`, kind: 'canopy', key: c.id, name: c.name, from: c.from, canopy: c }));

export interface SmokeItem extends Item {
  kind: 'smoke';
}
export const SMOKES: SmokeItem[] = [
  { id: 'smoke:off', kind: 'smoke', key: 'off', name: 'Off', from: { level: 1 } },
  { id: 'smoke:canopy', kind: 'smoke', key: 'canopy', name: 'Canopy colour', from: { level: 5 } },
  { id: 'smoke:rainbow', kind: 'smoke', key: 'rainbow', name: 'Rainbow smoke', from: { level: 19 } },
];

export const ITEMS: Item[] = [...OUTFITS, ...FINISHES, ...CANOPY_ITEMS, ...SMOKES];
export const itemById = (id: string): Item | undefined => ITEMS.find((i) => i.id === id);
export const itemsOf = (kind: RewardKind): Item[] => ITEMS.filter((i) => i.kind === kind);

// ---------- the track and unlocking

export const MILESTONES = [5, 10, 20];
/** The levels with something new (2..20), for the menu's next-reward line. */
export const REWARD_LEVELS = [...new Set(ITEMS.flatMap((i) => ('level' in i.from && i.from.level > 1 ? [i.from.level] : [])))].sort((a, b) => a - b);

/** What reaching exactly this level gives. */
export const rewardsAtLevel = (level: number): Item[] => ITEMS.filter((i) => 'level' in i.from && i.from.level === level && level > 1);
/** What a streak of exactly this many days gives. */
export const rewardsAtStreak = (days: number): Item[] => ITEMS.filter((i) => 'streak' in i.from && i.from.streak === days);

/** Every id a career at this level and with these streak unlocks (all items at or below it). */
export const unlockedFor = (level: number, streakDays: number): string[] =>
  ITEMS.filter((i) => ('level' in i.from ? i.from.level <= level : i.from.streak <= streakDays)).map((i) => i.id);

export const LOOK_START: Look = { outfit: { hotfix: 'standard', legacy: 'standard', standup: 'standard', intern: 'standard' }, finish: 'factory', canopy: 'classic', smoke: 'off' };

/** What is worn: an outfit per fighter, and one finish, canopy and smoke setting for all of them. */
export interface Look {
  outfit: Record<FighterId, string>;
  finish: string;
  canopy: string;
  smoke: string;
}

/** The word after an item's name in the reward card. */
export const KIND_LABEL: Record<RewardKind, string> = { outfit: 'outfits', finish: 'gun finish', canopy: 'canopy', smoke: '' };

/** The words under a chip: `Arctic gun finish`, `Dark Mode outfits`, `Navy chevron canopy`, `Drop Smoke`. */
export const rewardLabel = (i: Item): string => (i.kind === 'smoke' ? (i.key === 'canopy' ? 'Drop Smoke' : i.name) : `${i.name} ${KIND_LABEL[i.kind]}`);

/** The bigger lines on the three milestone cards. */
export const MILESTONE_LINE: Record<number, string> = {
  5: 'Drop Smoke: your trail in the sky',
  10: 'Gold Build: every gun in gold',
  20: 'Legend outfits for all four fighters',
};

/** Equips what was just unlocked: outfit sets on the fighter just played, the rest as the one setting. Returns a new look. */
export const equipNew = (look: Look, ids: string[], fighter: FighterId): Look => {
  const next: Look = { ...look, outfit: { ...look.outfit } };
  for (const id of ids) {
    const i = itemById(id);
    if (!i) continue;
    if (i.kind === 'outfit') next.outfit[fighter] = i.key;
    else if (i.kind === 'finish') next.finish = i.key;
    else if (i.kind === 'canopy') next.canopy = i.key;
    else next.smoke = i.key;
  }
  return next;
};

export const lookHas = (look: Look, i: Item, fighter: FighterId): boolean =>
  i.kind === 'outfit' ? look.outfit[fighter] === i.key : i.kind === 'finish' ? look.finish === i.key : i.kind === 'canopy' ? look.canopy === i.key : look.smoke === i.key;

/** `Lv 12` or `3 days`, for a locked item. */
export const lockLabel = (from: Source) => ('level' in from ? `Lv ${from.level}` : `${from.streak} days`);

/** The footer under a locked item in the tray. */
export const lockedFooter = (from: Source, level: number, streakDays: number) =>
  'level' in from ? `Unlocks at Level ${from.level}. You are Level ${level}.` : `Unlocks on a ${from.streak}-day streak. You are on day ${streakDays}.`;

export interface NextReward {
  level: number;
  /** A starred milestone within two levels: the line is gold. */
  milestone: boolean;
  /** The words, e.g. `Next at Level 4: Arctic gun finish` or `Level 5: Drop Smoke`. */
  text: string;
  /** The item the chip shows. */
  item: Item;
}

/** The item that stands for a level: a bundle's big one (Gold Build, Legend), or the first on the track. */
export const headlineAt = (level: number): Item | undefined => {
  const items = rewardsAtLevel(level);
  return items.find((i) => i.kind === 'finish' && level === 10) ?? items.find((i) => i.kind === 'outfit' && level === 20) ?? items[0];
};

const MILESTONE_NAME: Record<number, string> = { 5: 'Drop Smoke', 10: 'Gold Build', 20: 'Legend outfits' };

/** The next reward after `level`: a milestone within two levels first (in gold), else the next one on the track. Null from Level 20. */
export const nextReward = (level: number): NextReward | null => {
  const ahead = REWARD_LEVELS.filter((l) => l > level);
  if (!ahead.length) return null;
  const star = MILESTONES.find((m) => m > level && m <= level + 2);
  const at = star ?? ahead[0];
  const head = headlineAt(at)!;
  if (star) return { level: at, milestone: true, text: `Level ${at}: ${MILESTONE_NAME[at]}`, item: head };
  return { level: at, milestone: false, text: `Next at Level ${at}: ${rewardLabel(head)}`, item: head };
};

// ---------- chips (CSS fills, the same skewed language as the old canopy swatch)

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
export const partCss = (c: PartColor) => css(hexOf(c));
const bands = (cols: string[]) => `linear-gradient(90deg, ${cols.map((c, i) => `${c} ${(i * 100) / cols.length}% ${((i + 1) * 100) / cols.length}%`).join(', ')})`;

/** The signature part shown in an outfit's chip. */
const SIGNATURE: Record<FighterId, string> = { hotfix: 'hood', legacy: 'shirt', standup: 'badge', intern: 'bag' };

/** Outfit chip: three vertical bands, the top 50 %, the main signature part 25 % and the trousers 25 %. */
export const outfitChip = (key: string, fighter: FighterId): string => {
  const p = outfitParts(key, fighter);
  return `linear-gradient(90deg, ${partCss(p.top)} 0 50%, ${partCss(p[SIGNATURE[fighter]])} 50% 75%, ${partCss(p.pants)} 75% 100%)`;
};

/** Gun chip: steel and polymer bands with a 2 px line in the trim colour across them. */
export const finishChip = (key: string): string => {
  const f = finishById(key);
  const steel = f.mats.steel?.color ?? 0x3a3e45;
  const polymer = f.mats.polymer?.color ?? 0x26282c;
  const trim = css(f.mats.brass?.color ?? f.mats.red?.color ?? 0xb08d3c);
  const line = `linear-gradient(0deg, transparent calc(50% - 1px), ${trim} calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px))`;
  if (key === 'gold') return `${line}, linear-gradient(90deg, #ffe08a, #ffc23d 50%, #d9961a)`;
  // A sheen on Arctic and Synthwave steel (light to dark), flat blocks of colour otherwise.
  const darker = (steel & 0xfefefe) >> 1;
  const left = key === 'arctic' || key === 'synthwave' ? `linear-gradient(90deg, ${css(steel)}, ${css(darker)})` : `linear-gradient(90deg, ${css(steel)}, ${css(steel)})`;
  const sheen = `${left} 0 0 / 50% 100% no-repeat, linear-gradient(90deg, ${css(polymer)}, ${css(polymer)})`;
  return `${line}, ${sheen}`;
};

/** Smoke chip: a soft puff of the colour, a rainbow for Rainbow, grey for Off (the cross is drawn by the caller). */
export const smokeChip = (key: string, own: number): string =>
  key === 'rainbow'
    ? 'linear-gradient(90deg, #ff4d6d, #ffc93c, #3ddc84, #3ec5ff, #a45cff)'
    : key === 'off'
      ? '#3a4054'
      : `radial-gradient(circle at 50% 50%, ${css(own)} 0 35%, ${css(own)}66 60%, transparent 75%), #1b1f2e`;

/** The chip fill for any item: the outfit is shown on `fighter`, the canopy and smoke take the fighter's colour. */
export const chipCss = (i: Item, fighter: FighterId, fighterColor: number): string =>
  i.kind === 'outfit' ? outfitChip(i.key, fighter) : i.kind === 'finish' ? finishChip(i.key) : i.kind === 'canopy' ? canopySwatch((i as CanopyItem).canopy, fighterColor) : smokeChip(i.key, fighterColor);

/** The colour a card's border takes: the item's main colour, as CSS. */
export const accentCss = (i: Item, fighter: FighterId, fighterColor: number): string => {
  if (i.kind === 'outfit') return partCss(outfitParts(i.key, fighter)[SIGNATURE[fighter]]);
  if (i.kind === 'finish') return css(finishById(i.key).mats.steel?.color ?? 0xb08d3c);
  if (i.kind === 'canopy') {
    const c = (i as CanopyItem).canopy;
    return c.pattern === 'rainbow' ? '#ffc93c' : css(c.id === 'classic' ? fighterColor : c.a);
  }
  return i.key === 'rainbow' ? '#ffc93c' : css(fighterColor);
};

// ---------- bots wear rewards (render only)

const pick = <T>(rand: () => number, table: [T, number][]): T => {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r < 0) return v;
  }
  return table[table.length - 1][0];
};

const hash = (a: number, b: number) => {
  let h = (2166136261 ^ a) >>> 0;
  h = Math.imul(h ^ (b + 0x9e3779b9), 16777619) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  return h >>> 0;
};

/**
 * What a bot wears: picked from a hash of the match seed and the bot's id, so the same match always dresses them the same.
 * Render only: nothing here is in the sim or on the network.
 */
export const botLook = (matchSeed: number, botId: number): Look => {
  const rand = mulberry32(hash(matchSeed | 0, botId));
  const outfitKey = pick(rand, [['standard', 55], ['darkmode', 15], ['arctic', 10], ['synthwave', 8], ['terminal', 7], ['legend', 5]]);
  const finishKey = pick(rand, [['factory', 60], ['arctic', 10], ['cherry', 10], ['gold', 7], ['terminal', 6], ['synthwave', 4], ['ember', 3]]);
  const others = CANOPIES.filter((c) => c.id !== 'classic').map((c) => [c.id, 50 / (CANOPIES.length - 1)] as [string, number]);
  const canopy = pick(rand, [['classic', 50], ...others]);
  const smoke = rand() < 0.2 ? 'canopy' : 'off';
  return { outfit: { hotfix: outfitKey, legacy: outfitKey, standup: outfitKey, intern: outfitKey }, finish: finishKey, canopy, smoke };
};

/** The plain look every online fighter wears (look ids are not sent over the network yet). */
export const DEFAULT_LOOK: Look = LOOK_START;
