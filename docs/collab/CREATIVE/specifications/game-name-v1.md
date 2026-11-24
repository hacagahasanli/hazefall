# Game name v1 (R-020)

Status: decided 2026-11-24. Replaces "Last Commit Standing" for the new CrazyGames entry, the site and the in-game title.

## Decision
**HAZEFALL.** One word, two syllables, owns the game's signature element (the Haze) and its opening beat (the fall from the plane under a canopy). It names this game and no other battle royale: no "battle", "royale", "storm", "zone", "squad", "legends" or "-fire" parts, so it cannot be read as PUBG, Fortnite, Apex, Free Fire or Warzone.

## Ranked candidates
| # | Name | Meaning, why it fits | 200 px cover read |
|---|------|----------------------|-------------------|
| 1 | Hazefall | The Haze falls on the countryside town; twenty fall from the sky. Ties the store tagline to the title. | 8 letters, distinct shape (Z, double L), reads cleanly in Bungee at 200 px. |
| 2 | Lastfield | The last field you stand on; last one standing in farmland. Keeps the "last" echo of the old name. | 9 letters, plain shapes, readable; less ownable. |
| 3 | Dropfield | The drop into open fields. Very literal, simple. | 9 letters, readable; generic feel. |
| 4 | Droptown | Drop into the town (Old Town, The Pitch). | 8 letters, readable; sounds lighter, more casual-arcade. |
| 5 | Fieldfall | Falling onto the fields. | Double F and double L blur at small size; weakest read. |

## Checks done 2026-11-24 (exact word)
| Name | CrazyGames | Poki | Steam | itch.io | Web "+ game" | Trademark |
|------|-----------|------|-------|---------|--------------|-----------|
| Hazefall | none (crazygames.com/game/hazefall 404; site search: none) | none (site search) | none (store search suggest) | none | none; near: Hazewalker, Haze (2008), Haze Together | no exact mark found via web search of TM mirrors |
| Lastfield | none | none | none | none | none | not found |
| Dropfield | none | none | none | none (near: Dragfield) | none (near: Dropfall, a tiny Cinevva browser game) | not found |
| Droptown | none | none | none | none | none | not found |
| Fieldfall | none | none | none | none | none (near: FlowerFall board game) | not found |

Dropped after checks: Holdfast (Steam: Holdfast: Nations At War), Hazeland (itch.io game "hazeland"), Lastdrop (Last Drop, Steam / Wikipedia), Hazeline (too close to HAZELIGHT, a registered US game mark of Hazelight Studios).

Method and links: Steam `store.steampowered.com/search/suggest?term=<word>`, `itch.io/search?q=<word>`, `crazygames.com/game/<slug>` plus site-limited web search for crazygames.com and poki.com, web search `"<word>" game`, web search `<word> trademark` (justia/trademarkdir mirrors).

Limitations: USPTO and EUIPO search tools are script apps that could not be queried from here, so trademark status is "no hit in public mirrors", not a cleared search. Poki's own search page did not answer automated requests; Poki was checked by site-limited web search only. Before the CG upload, Reis should run one manual search for HAZEFALL at tmsearch.uspto.gov and euipo.europa.eu/eSearch (classes 9 and 41).

## Title lockup (covers, via _studio/keyart/compose.mjs)
- One line: `HAZEFALL`, Bungee, all caps, same size and placement as the V2 cover title.
- `HAZE` in white, `FALL` in the existing title gold. The split matches the art: white Haze above, gold for the action.
- Same dark outline/drop shadow as the V2 lockup. No subtitle on the cover.
- Square/portrait crops: still one line; scale to fit, never break into two lines.

## Tagline
Keep: "Twenty drop in. The Haze closes. One stays standing." It already sets up the name; no change.

## Engineering notes
- Rename everywhere the player sees the title: page title, manifest name/short_name, menu logo text, store copy (cg-store-copy-v2 §1 title becomes Hazefall), site hero. Domain/subdomain changes are out of scope for this spec.
- Do not rename internal code identifiers for this.
