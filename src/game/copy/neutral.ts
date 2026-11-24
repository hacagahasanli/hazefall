/**
 * The portal build's copy: plain battle-royale words for players who are not developers. Same shape as `studio.ts`;
 * vite.portal.config.ts swaps it in, and `npm run build:portal` fails if a studio joke slips through.
 */
import type { Copy } from './types';

export const COPY: Copy = {
  fighters: {
    hotfix: { name: 'Blaze', role: 'Runner', superName: 'Rush', superText: 'a fast dash that hits everyone in its path' },
    legacy: { name: 'Hedge', role: 'Defender', superName: 'Barricade', superText: 'drops a wall that blocks bullets' },
    standup: { name: 'Tempo', role: 'Controller', superName: 'Slow Bomb', superText: 'a thrown canister that bursts and slows enemies' },
    intern: { name: 'Rookie', role: 'Brawler', superName: 'Shockwave', superText: 'a blast that throws everyone back' },
  },
  botNames: [
    'Maverick', 'Pebble', 'Nova', 'Rusty', 'Kiwi', 'Bolt', 'Juniper', 'Ziggy', 'Comet',
    'Pickle', 'Sprocket', 'Willow', 'Cobalt', 'Marble', 'Tango', 'Pepper', 'Echo', 'Waffle', 'Biscuit',
  ],
  guestPrefix: 'player_',
  zone: {
    name: 'the Haze',
    waiting: 'Haze moves in',
    closing: 'Haze closing',
    final: 'Final Haze',
    outside: 'Outside the safe zone!',
    caught: (who, you) => (you ? 'You were caught in the Haze' : `${who} was caught in the Haze`),
  },
  result: { won: 'LAST ONE STANDING', lost: 'KNOCKED OUT', wonLine: (n) => `${n} down, one standing. The win is yours.` },
  intro: {
    above: null,
    title: (n) => [`${n} PLAYERS`, 'ONE WINNER'],
    line: 'Land, grab a gun and stay inside the safe zone as the Haze closes in. The last one standing wins.',
    below: null,
  },
  items: { rarity: ['Common', 'Tuned', 'Prime'], bandage: 'Bandage', medkit: 'Med kit', coffee: 'Energy drink' },
  howTo: [
    ['Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and two spare magazines.'],
    ['Loot', 'Walk over loot to take it; press F when a key shows over an item. Two gun slots: 1 / 2, X or the mouse wheel to swap. Blue and gold beams mark the best gear.'],
    ['Survive', 'Left click shoots, right click scopes a sniper. 3 bandage, 4 med kit, 5 bomb then click to throw. Q / E lean, C crouch, Shift roll, G super. Stay inside the safe zone.'],
  ],
  tips: [
    'Jump from the plane whenever you like, then steer your parachute down.',
    'You land with a pistol and two spare magazines: grab a better gun fast.',
    'Blue and gold beams mark the best gear.',
    'Tall grass hides you.',
    'Lean round corners and roll out of trouble.',
    'Two gun slots: keep a close-range gun and a long one.',
    'Vests I to III soak up hits; a bigger backpack carries more heals.',
    'Stay inside the safe zone: it closes phase by phase and hurts more each time.',
    'Your super is ready when its bar turns gold.',
  ],
};
