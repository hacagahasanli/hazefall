/**
 * The boot screen's picture of the battleground (build side, run by vite.portal.config.ts): the real map, tile by tile in
 * the minimap's colours, as a small PNG inlined into the page, so the first thing a player sees is the island they are
 * about to drop on, without a single extra request. Trees get a canopy with a darker rim and roofs a ridge, so it reads
 * like the view from the plane rather than a grid of squares.
 */
import { deflateSync } from 'zlib';

import { tileColor } from '../src/game/render/mapImage';
import { MAP, SIZE } from '../src/game/sim/constants';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const shade = ([r, g, b]: [number, number, number], k: number): [number, number, number] => [
  Math.max(0, Math.min(255, Math.round(r * k))),
  Math.max(0, Math.min(255, Math.round(g * k))),
  Math.max(0, Math.min(255, Math.round(b * k))),
];

/** `px` pixels per tile (4 makes a 352 px square, a few KB). */
export const bootMapPng = (px = 4) => {
  const w = SIZE * px;
  const rows: Buffer[] = [];
  for (let y = 0; y < w; y++) {
    const row = Buffer.alloc(1 + w * 3);
    const ty = Math.floor(y / px);
    const iy = y % px;
    for (let x = 0; x < w; x++) {
      const tx = Math.floor(x / px);
      const ix = x % px;
      const t = MAP[ty][tx];
      let c = rgb(tileColor(t));
      const edge = ix === 0 || iy === 0 || ix === px - 1 || iy === px - 1;
      if (t === 't' || t === 'b') {
        // A round canopy: lit in the middle, dark at the rim (the gaps between trees read as shade).
        const d = Math.hypot(ix - (px - 1) / 2, iy - (px - 1) / 2) / (px / 2);
        c = shade(c, d > 0.95 ? 0.7 : d < 0.45 ? 1.12 : 1);
      } else if (t === '#' || t === 'w') {
        // Walls and roofs: a ridge line through the middle, a shadow along one side.
        c = iy === px - 1 ? shade(c, 0.72) : iy === Math.floor(px / 2) ? shade(c, 1.06) : c;
      } else if (t === 'o') {
        c = (x + y * 3) % 11 === 0 ? shade(c, 1.15) : c;
      } else if (edge && (t === 'g' || t === 'h')) {
        c = shade(c, (tx * 7 + ty * 13) % 3 === 0 ? 0.96 : 1.02);
      }
      row[1 + x * 3] = c[0];
      row[2 + x * 3] = c[1];
      row[3 + x * 3] = c[2];
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(w, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
};
