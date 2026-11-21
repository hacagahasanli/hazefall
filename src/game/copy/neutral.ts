/**
 * The portal build's copy: plain battle-royale words for players who are not developers. Same shape as `studio.ts`;
 * vite.portal.config.ts swaps it in, and `npm run build:portal` fails if a studio joke slips through.
 */
import type { Copy } from './types';

export const COPY: Copy = {
  fighters: {
    hotfix: { name: 'Blaze', role: 'Runner', superName: 'Rush', superText: 'a fast dash that hits everyone in its path' },
    legacy: { name: 'Bastion', role: 'Defender', superName: 'Barricade', superText: 'drops a wall that blocks bullets' },
    standup: { name: 'Tempo', role: 'Controller', superName: 'Slow Field', superText: 'a field that slows enemies' },
    intern: { name: 'Rookie', role: 'Brawler', superName: 'Shockwave', superText: 'a blast that throws everyone back' },
  },
  botNames: [
    'Maverick', 'Pebble', 'Nova', 'Rusty', 'Kiwi', 'Bolt', 'Juniper', 'Ziggy', 'Comet',
    'Pickle', 'Sprocket', 'Willow', 'Cobalt', 'Marble', 'Tango', 'Pepper', 'Echo', 'Waffle', 'Biscuit',
  ],
  guestPrefix: 'player_',
  zone: {
    name: 'the Storm',
    waiting: 'Storm moves in',
    closing: 'Storm closing',
    final: 'Final Storm',
    outside: 'Outside the safe zone!',
    caught: (who) => `${who} was caught by the Storm`,
  },
  result: { won: 'LAST ONE STANDING', lost: 'KNOCKED OUT', wonLine: (n) => `${n} down, one standing. The win is yours.` },
  intro: {
    above: null,
    title: (n) => [`${n} PLAYERS`, 'ONE WINNER'],
    line: 'Land, grab a gun and stay inside the safe zone as the Storm closes in. The last one standing wins.',
    below: null,
  },
  items: { rarity: ['Common', 'Tuned', 'Prime'], bandage: 'Bandage', medkit: 'Med kit', coffee: 'Energy drink' },
  howTo: [
    ['Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and one magazine.'],
    ['Loot', 'Two gun slots (1 / 2 or X to swap), vests I to III, backpacks, heals and bombs. The busy places hide the best gear: blue and gold beams. Walk over loot to take it; when a key shows over an item (a gun with both slots full), press F. C heals.'],
    ['Survive', 'Stay inside the safe zone. Space shoots, Q / E lean, Shift rolls, G is your super, hide in tall grass. P pauses.'],
  ],
  tips: [
    'Jump from the plane whenever you like, then steer your parachute down.',
    'You land with a pistol and one magazine: grab a better gun fast.',
    'Blue and gold beams mark the best gear.',
    'Tall grass hides you.',
    'Lean round corners and roll out of trouble.',
    'Two gun slots: keep a close-range gun and a long one.',
    'Vests I to III soak up hits; a bigger backpack carries more heals.',
    'Stay inside the safe zone: it closes phase by phase and hurts more each time.',
    'Your super is ready when its bar turns gold.',
  ],
};
