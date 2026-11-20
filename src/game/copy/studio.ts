/** The site's copy: the studio's developer jokes. The portal build replaces this module with `neutral.ts`. */
import type { Copy } from './types';

export const COPY: Copy = {
  fighters: {
    hotfix: { name: 'Hotfix', role: 'On-call engineer', superName: 'Deploy', superText: 'a fast dash that hits everyone in its path' },
    legacy: { name: 'Legacy', role: 'Senior maintainer', superName: 'Deprecated', superText: 'drops a wall that blocks bullets' },
    standup: { name: 'Standup', role: 'Scrum lead', superName: 'Timebox', superText: 'a field that slows enemies' },
    intern: { name: 'Intern', role: 'First week', superName: 'Force push to main', superText: 'a blast that throws everyone back' },
  },
  botNames: ['merge_bot', 'lint_fail', 'null_ptr', 'race_cond', 'off_by_1', 'rm_rf', 'yolo_push', 'flaky_test', 'tech_debt'],
  guestPrefix: 'dev_',
  zone: {
    name: 'the Deadline',
    waiting: 'Deadline moves in',
    closing: 'Deadline closing',
    final: 'Final Deadline',
    outside: 'Outside the Deadline!',
    caught: (who) => `${who} missed the Deadline`,
  },
  result: { won: 'MERGED TO MAIN', lost: 'YOUR COMMIT WAS REVERTED', wonLine: (n) => `${n} down, one standing. You shipped it.` },
  intro: {
    above: '<<<<<<< HEAD',
    title: (n) => [`${n} DEVELOPERS`, 'ONE MERGE'],
    line: 'Nobody agrees, the Deadline closes in, and only the last commit standing gets merged.',
    below: '>>>>>>> their-branch',
  },
  howTo: [
    ['Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and one magazine.'],
    ['Loot', 'Guns, armor, ammo, med kits and bombs lie in houses, barns and yards. Walk over them or press F.'],
    ['Survive', 'Stay inside the Deadline. Space shoots, Q / E lean, Shift rolls, G is your super, hide in tall grass. Esc Esc pauses.'],
  ],
};
