import * as THREE from 'three';

import { MARKET_SQUARE, ROUTES, TILE } from '../sim/constants';

import type { Route } from '../sim/constants';

/**
 * The roads as they are painted: Route 1 (and any road along the map's y axis) stops at the Market Square's north edge and starts again
 * at its south edge, so the square's paving runs across unbroken. (The tiles, the collision and the walking speed are unchanged.)
 */
const PAINTED: Route[] = ROUTES.flatMap((r) => {
  const [a, b] = r.points;
  const q = MARKET_SQUARE;
  const north = q.y0 * TILE;
  const south = (q.y0 + q.h) * TILE;
  if (r.kind !== 'asphalt' || a.x !== b.x || a.x < q.x0 * TILE || a.x > (q.x0 + q.w) * TILE || a.y >= north || b.y <= south) return [r];
  return [{ kind: r.kind, points: [a, { x: a.x, y: north }] }, { kind: r.kind, points: [{ x: a.x, y: south }, b] }];
});

/**
 * Roads and dirt paths as real geometry, not painted into the terrain texture: the asphalt has
 * sharp white edge lines and a dashed yellow centre line, dirt paths have clean, slightly soft
 * edges. They stay crisp at any zoom. The centre lines come from the map generator (ROUTES).
 */

interface Frame {
  x: number;
  y: number;
  /** Unit normal (to the left of travel) and distance along the line. */
  nx: number;
  ny: number;
  s: number;
}

/** Resample a centre line smoothly every `step` metres, with normals. */
const frames = (pts: { x: number; y: number }[], step: number): Frame[] => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  const out: Frame[] = [];
  let s = 0;
  let last: THREE.Vector3 | null = null;
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    const t = curve.getTangentAt(i / n);
    if (last) s += p.distanceTo(last);
    last = p;
    out.push({ x: p.x, y: p.z, nx: -t.z, ny: t.x, s });
  }
  return out;
};

/** A strip between two offsets from the centre line, with per-vertex RGBA colours. */
const strip = (fr: Frame[], from: number, to: number, h: number, color: (f: Frame, side: 0 | 1) => [number, number, number, number]) => {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  fr.forEach((f, i) => {
    for (const [side, off] of [[0, from], [1, to]] as const) {
      pos.push(f.x + f.nx * off, h, f.y + f.ny * off);
      col.push(...color(f, side));
      uv.push(side, f.s / 4);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Depending on which side 'from' is, the triangles may wind clockwise seen from above: flip
  // them so they face up (and aren't culled or lit from below).
  if (fr.length > 1) {
    const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const p1 = new THREE.Vector3(pos[6], pos[7], pos[8]);
    const p2 = new THREE.Vector3(pos[3], pos[4], pos[5]);
    const up = new THREE.Vector3().crossVectors(p1.sub(p0), p2.sub(p0)).y;
    if (up < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  g.setIndex(idx);
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
};

/** Fine asphalt grain, tiled along the road so it stays sharp close up. */
const asphaltTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.floor(Math.random() * 55);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

const shade = (hex: number, k: number): [number, number, number, number] => {
  // THREE.Color already converts an sRGB hex to the linear working space.
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k, 1];
};

export const buildRoads = () => {
  const group = new THREE.Group();
  const flat = (transparent: boolean, map?: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, transparent, depthWrite: !transparent, map: map ?? null,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  const asphaltMap = asphaltTexture();
  for (const r of PAINTED) {
    if (r.kind === 'asphalt') {
      const fr = frames(r.points, 0.5);
      const wobble = (f: Frame) => 0.92 + 0.08 * Math.sin(f.s * 0.37) * Math.sin(f.s * 0.11);
      group.add(new THREE.Mesh(strip(fr, -2.3, 2.3, 0.03, (f) => shade(0x4a4e57, wobble(f))), flat(false, asphaltMap)));
      // Gravel shoulders with soft outer edges.
      for (const [a, b] of [[2.3, 2.9], [-2.3, -2.9]]) {
        group.add(new THREE.Mesh(strip(fr, a, b, 0.025, (_f, side) => [...shade(0x8a7d68, 1).slice(0, 3), side ? 0 : 1] as [number, number, number, number]), flat(true)));
      }
      // Edge lines.
      for (const off of [-2.05, 2.05]) group.add(new THREE.Mesh(strip(fr, off - 0.07, off + 0.07, 0.035, () => shade(0xe9e7df, 1)), flat(false)));
      // Dashed centre line: 2 m on, 2 m off.
      const dash: Frame[][] = [];
      let cur: Frame[] = [];
      for (const f of fr) {
        if (Math.floor(f.s / 2) % 2 === 0) cur.push(f);
        else if (cur.length) {
          dash.push(cur);
          cur = [];
        }
      }
      if (cur.length > 1) dash.push(cur);
      for (const d of dash) if (d.length > 1) group.add(new THREE.Mesh(strip(d, -0.07, 0.07, 0.036, () => shade(0xf2c230, 1)), flat(false)));
    } else if (r.kind === 'rail') {
      // A railway: a ballast bed with sleepers (dark cross strips) and two steel rails.
      const fr = frames(r.points, 0.4);
      group.add(new THREE.Mesh(strip(fr, -1.5, 1.5, 0.02, (f) => shade(0x7b756c, 0.9 + 0.1 * Math.sin(f.s * 1.7))), flat(false)));
      const ties: Frame[][] = [];
      let cur: Frame[] = [];
      for (const f of fr) {
        if (Math.floor(f.s / 0.8) % 2 === 0) cur.push(f);
        else if (cur.length) {
          ties.push(cur);
          cur = [];
        }
      }
      for (const d of ties) if (d.length > 1) group.add(new THREE.Mesh(strip(d, -1.15, 1.15, 0.03, () => shade(0x4a3a2c, 1)), flat(false)));
      for (const off of [-0.72, 0.72]) group.add(new THREE.Mesh(strip(fr, off - 0.06, off + 0.06, 0.06, () => shade(0x9aa0ab, 1)), flat(false)));
    } else {
      const fr = frames(r.points, 0.4);
      const dirt = (f: Frame) => 0.85 + 0.15 * Math.sin(f.s * 0.9) * Math.sin(f.s * 0.23);
      // A solid core and feathered edges.
      group.add(new THREE.Mesh(strip(fr, -1.0, 1.0, 0.015, (f) => shade(0x8a6a46, dirt(f))), flat(false)));
      for (const [a, b] of [[1.0, 1.45], [-1.0, -1.45]]) {
        group.add(new THREE.Mesh(strip(fr, a, b, 0.014, (f, side) => [...shade(0x8a6a46, dirt(f) * 1.05).slice(0, 3), side ? 0 : 1] as [number, number, number, number]), flat(true)));
      }
    }
  }
  group.traverse((o) => o instanceof THREE.Mesh && (o.receiveShadow = true));
  return group;
};

/** Distance from (x, y) to the nearest road or path centre line, for keeping grass off them. */
export const routeDistance = (() => {
  const segs = ROUTES.flatMap((r) => r.points.slice(1).map((p, i) => ({ a: r.points[i], b: p, half: r.kind === 'asphalt' ? 2.9 : r.kind === 'rail' ? 1.6 : 1.3 })));
  // A spatial hash: each tile lists the segments within a few metres of it, so a query checks a
  // handful instead of all of them (this runs for every one of the ~60k grass tufts).
  const buckets = new Map<number, typeof segs>();
  const key = (tx: number, ty: number) => ty * 1000 + tx;
  for (const s of segs) {
    const pad = s.half + 3;
    for (let ty = Math.floor((Math.min(s.a.y, s.b.y) - pad) / TILE); ty <= Math.floor((Math.max(s.a.y, s.b.y) + pad) / TILE); ty++) {
      for (let tx = Math.floor((Math.min(s.a.x, s.b.x) - pad) / TILE); tx <= Math.floor((Math.max(s.a.x, s.b.x) + pad) / TILE); tx++) {
        const k = key(tx, ty);
        const list = buckets.get(k);
        if (list) list.push(s);
        else buckets.set(k, [s]);
      }
    }
  }
  return (x: number, y: number) => {
    let best = 3; // "far": nothing within the bucket's reach
    for (const { a, b, half } of buckets.get(key(Math.floor(x / TILE), Math.floor(y / TILE))) ?? []) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t) - half;
      if (d < best) best = d;
    }
    return best;
  };
})();
