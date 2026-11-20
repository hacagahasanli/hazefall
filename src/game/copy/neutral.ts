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
  botNames: ['Maverick', 'Pebble', 'Nova', 'Rusty', 'Kiwi', 'Bolt', 'Juniper', 'Ziggy', 'Comet'],
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
  howTo: [
    ['Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and one magazine.'],
    ['Loot', 'Guns, armor, ammo, med kits and bombs lie in houses, barns and yards. Walk over them or press F.'],
    ['Survive', 'Stay inside the safe zone. Space shoots, Q / E lean, Shift rolls, G is your super, hide in tall grass. P pauses.'],
  ],
};
