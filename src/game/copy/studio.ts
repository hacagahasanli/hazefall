/** The site's copy: the studio's developer jokes. The portal build replaces this module with `neutral.ts`. */
import type { Copy } from './types';

export const COPY: Copy = {
  fighters: {
    hotfix: { name: 'Hotfix', role: 'On-call engineer', superName: 'Deploy', superText: 'a fast dash that hits everyone in its path' },
    legacy: { name: 'Legacy', role: 'Senior maintainer', superName: 'Deprecated', superText: 'drops a wall that blocks bullets' },
    standup: { name: 'Standup', role: 'Scrum lead', superName: 'Timebox', superText: 'a thrown canister that bursts and slows enemies' },
    intern: { name: 'Intern', role: 'First week', superName: 'Force push to main', superText: 'a blast that throws everyone back' },
  },
  botNames: [
    'merge_bot', 'lint_fail', 'null_ptr', 'race_cond', 'off_by_1', 'rm_rf', 'yolo_push', 'flaky_test', 'tech_debt',
    'seg_fault', 'stack_ovf', 'cache_miss', 'dead_lock', 'wip_final', 'todo_later', 'dep_hell', '404_bot', 'prod_fire', 'git_blame',
  ],
  guestPrefix: 'dev_',
  zone: {
    name: 'the Deadline',
    waiting: 'Deadline moves in',
    closing: 'Deadline closing',
    final: 'Final Deadline',
    outside: 'Outside the Deadline!',
    caught: (who, you) => (you ? 'You missed the Deadline' : `${who} missed the Deadline`),
  },
  result: { won: 'MERGED TO MAIN', lost: 'YOUR COMMIT WAS REVERTED', wonLine: (n) => `${n} down, one standing. You shipped it.` },
  intro: {
    above: '<<<<<<< HEAD',
    title: (n) => [`${n} DEVELOPERS`, 'ONE MERGE'],
    line: 'Nobody agrees, the Deadline closes in, and only the last commit standing gets merged.',
    below: '>>>>>>> their-branch',
  },
  items: { rarity: ['Common', 'Tuned', 'Prime'], bandage: 'Bandage', medkit: 'Med kit', coffee: 'Coffee' },
  howTo: [
    ['Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and two spare magazines. Shooting starts once you are on the ground.'],
    ['Loot', 'Two gun slots (1 / 2 or X to swap), vests I to III, backpacks, heals and bombs. The busy places hide the best gear: blue and gold beams. Walk over loot to take it; when a key shows over an item (a gun with both slots full), press F. H heals.'],
    ['Survive', 'Stay inside the Deadline. J or the left button shoots, Space jumps, Q / E lean, G crouches, hold C to look around, Shift rolls, B is your super, hide in tall grass. Esc or P pauses.'],
  ],
  tips: [
    'Jump from the plane whenever you like, then steer your parachute down.',
    'You land with a pistol and two spare magazines: grab a better gun fast.',
    'Blue and gold beams mark the best gear.',
    'Tall grass hides you.',
    'Lean round corners and roll out of trouble.',
    'Two gun slots: keep a close-range gun and a long one.',
    'Vests I to III soak up hits; a bigger backpack carries more heals.',
    'Stay inside the Deadline: it closes phase by phase and hurts more each time.',
    'Your super is ready when its bar turns gold.',
  ],
};
