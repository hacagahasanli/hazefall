/**
 * Where the game's files (models, sounds) live. The site serves them from the root (`/assets/`); the portal build sets
 * `__LCS_ASSET_BASE__` to './assets/' (vite.portal.config.ts) so every path is relative to the page, as portals require.
 */
declare const __LCS_ASSET_BASE__: string | undefined;

export const ASSET_BASE: string = typeof __LCS_ASSET_BASE__ !== 'undefined' ? __LCS_ASSET_BASE__ : '/assets/';

export const assetUrl = (path: string) => `${ASSET_BASE}${path}`;

/** The studio's logo set (models and sounds sit in assets/, the brand files beside it in brand/). */
export const brandUrl = (file: string) => `${ASSET_BASE.replace(/assets\/$/, '')}brand/${file}`;
