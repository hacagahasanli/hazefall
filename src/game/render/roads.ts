import * as THREE from 'three';

import { ROUTES } from '../sim/constants';

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
  for (const r of ROUTES) {
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
  const segs = ROUTES.flatMap((r) => r.points.slice(1).map((p, i) => ({ a: r.points[i], b: p, half: r.kind === 'asphalt' ? 2.9 : 1.3 })));
  return (x: number, y: number) => {
    let best = Infinity;
    for (const { a, b, half } of segs) {
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
