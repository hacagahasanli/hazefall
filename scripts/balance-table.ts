/**
 * Prints the weapon balance table (common grade) from the live constants as Markdown, for docs/BALANCE.md.
 * Run: npx tsx scripts/balance-table.ts [distances=5,20,50]
 */
import { ALL, BARE, burstDps, GEARED, pelletsHit, shotDamage, shotInterval, sustainedDps, timeToKill } from '../src/game/sim/balance';
import { WEAPONS } from '../src/game/sim/constants';

const distances = (process.argv[2] ?? '5,20,50').split(',').map(Number);
const t = (s: number) => (Number.isFinite(s) ? `${s.toFixed(2)} s` : 'n/a');
const ttk = (k: (typeof ALL)[number], d: number, hp: number) => {
  const r = timeToKill(WEAPONS[k], d, hp, 0, k);
  return Number.isFinite(r.seconds) ? `${t(r.seconds)} (${r.shots})` : 'n/a';
};

const head = ['Weapon', 'Dmg', 'RPM', 'Burst DPS', 'Sustained DPS', 'Mag/reserve', 'Reload'];
for (const d of distances) head.push(`TTK 100 @${d} m`, `TTK 200 @${d} m`);
console.log(`| ${head.join(' | ')} |`);
console.log(`|${head.map(() => '---').join('|')}|`);
for (const k of ALL) {
  const w = WEAPONS[k];
  const dmg = w.bullets > 1 ? `${w.damage}x${w.bullets}` : `${w.damage}`;
  const row = [
    w.name, dmg, Math.round(60 / shotInterval(w)).toString(), Math.round(burstDps(w)).toString(), Math.round(sustainedDps(w, k)).toString(),
    Number.isFinite(w.mag) ? `${w.mag}/${w.ammo - w.mag}` : '-', w.reload ? `${w.reload} s` : '-',
  ];
  for (const d of distances) row.push(ttk(k, d, BARE), ttk(k, d, GEARED));
  console.log(`| ${row.join(' | ')} |`);
}
console.log('\nexpected damage per trigger pull (pellets that connect for the shotgun):');
for (const k of ALL) {
  const w = WEAPONS[k];
  const cells = [2, 5, 8, 12, 15, 20, 30, 50, 100].map((d) => `${d}m ${shotDamage(w, d, 0, k).toFixed(1)}${w.bullets > 1 ? `[${pelletsHit(w, d)}]` : ''}`);
  console.log(`${w.name.padEnd(8)} ${cells.join('  ')}`);
}
