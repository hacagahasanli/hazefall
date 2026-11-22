import type { FighterId } from '../sim/types';

/**
 * Every line of player-facing text that carries the studio's developer jokes, in one shape. The site ships `studio.ts`
 * (Hotfix, the Deadline, "merged to main"); the portal build swaps in `neutral.ts` at build time (see vite.portal.config.ts),
 * so none of the jokes reach the portal bundle. Ids (`hotfix`, ...) are internal and never shown.
 */
export interface FighterCopy {
  name: string;
  role: string;
  superName: string;
  superText: string;
}

export interface Copy {
  fighters: Record<FighterId, FighterCopy>;
  /** The nineteen offline bots, in seat order (one per seat after yours: PLAYERS - 1). */
  botNames: string[];
  /** Prefix for a random guest name ("dev_4821"). */
  guestPrefix: string;
  zone: {
    /** As a cause of death and in sentences: "the Deadline". */
    name: string;
    waiting: string;
    closing: string;
    final: string;
    outside: string;
    /** Kill feed line for a player the zone took. */
    /** The feed line when the zone knocks someone out; `you` is true for the player ("You were caught", not "you was caught"). */
    caught: (who: string, you?: boolean) => string;
  };
  result: { won: string; lost: string; wonLine: (others: number) => string };
  /** The title card on the plane: optional lines above and below, two title lines, one sentence. */
  intro: { above: string | null; title: (players: number) => [string, string]; line: string; below: string | null };
  /** Item names: the three gun grades (common, tuned, prime) and the heals. */
  items: { rarity: [string, string, string]; bandage: string; medkit: string; coffee: string };
  /** The lobby's three how-to cards. */
  howTo: [string, string][];
  /** Loading-screen tips: only things the game really does, no keys (they differ by device and can be rebound). */
  tips: string[];
}
