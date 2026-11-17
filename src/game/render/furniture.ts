import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { BUILDINGS, MAP, TILE, tileAt, tileHash } from '../sim/constants';

/**
 * Furniture for the 'u' tiles, built in code from boxes: one merged geometry per kind with
 * vertex colours, drawn as one InstancedMesh per kind. Each piece stands with its back (-z) to
 * the wall it was placed against. It fits inside the collision box (2 m tile minus 0.22 m).
 */

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const cyl = (r: number, h: number, x: number, y: number, z: number, color: number) => {
  const g = new THREE.CylinderGeometry(r, r, h, 10).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const col = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};
const join = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
};

const WOOD = 0x8a5a36;
const WOOD_DARK = 0x5e3b22;
const WOOD_LIGHT = 0xc4925c;

const bed = () =>
  join([
    box(1.4, 0.32, 1.7, 0, 0, -0.05, WOOD_DARK),
    box(1.4, 0.75, 0.12, 0, 0, -0.9, WOOD_DARK), // headboard
    box(1.3, 0.2, 1.6, 0, 0.32, -0.05, 0xf1ede4), // mattress
    box(1.32, 0.08, 1.05, 0, 0.5, 0.22, 0x3d6db5), // blanket
    box(0.5, 0.12, 0.32, -0.33, 0.52, -0.62, 0xffffff),
    box(0.5, 0.12, 0.32, 0.33, 0.52, -0.62, 0xffffff),
  ]);

const sofa = () =>
  join([
    box(1.7, 0.42, 0.85, 0, 0, -0.45, 0x6b4f8a),
    box(1.7, 0.5, 0.22, 0, 0.42, -0.79, 0x5c4277), // back
    box(0.2, 0.3, 0.85, -0.85, 0.42, -0.45, 0x5c4277),
    box(0.2, 0.3, 0.85, 0.85, 0.42, -0.45, 0x5c4277),
    box(0.75, 0.1, 0.6, -0.38, 0.42, -0.42, 0x7b5f9a),
    box(0.75, 0.1, 0.6, 0.38, 0.42, -0.42, 0x7b5f9a),
    box(0.9, 0.04, 0.5, 0, 0.32, 0.4, 0xb0603c), // rug edge in front
  ]);

const bookshelf = () => {
  const parts = [box(1.6, 1.9, 0.42, 0, 0, -0.75, WOOD)];
  const colors = [0xd2453c, 0x3d6db5, 0xe8b33a, 0x3a8a5a, 0xf1ede4, 0x6b4f8a];
  for (let shelf = 0; shelf < 4; shelf++) {
    parts.push(box(1.5, 0.04, 0.38, 0, 0.12 + shelf * 0.45, -0.73, WOOD_DARK));
    let x = -0.7;
    let i = shelf * 3;
    while (x < 0.6) {
      const w = 0.07 + tileHash(i, shelf, 3) * 0.08;
      const h = 0.26 + tileHash(i, shelf, 4) * 0.12;
      parts.push(box(w, h, 0.28, x + w / 2, 0.16 + shelf * 0.45, -0.68, colors[i % colors.length]));
      x += w + 0.015;
      i += 1;
    }
  }
  return join(parts);
};

/** A developer's desk: two monitors (one showing green diff lines), keyboard, chair. */
const desk = () =>
  join([
    box(1.6, 0.06, 0.75, 0, 0.72, -0.5, WOOD_LIGHT),
    box(0.06, 0.72, 0.7, -0.75, 0, -0.5, 0x2b2f3a),
    box(0.06, 0.72, 0.7, 0.75, 0, -0.5, 0x2b2f3a),
    box(0.6, 0.38, 0.04, -0.33, 0.9, -0.78, 0x1b1f2a),
    box(0.54, 0.3, 0.02, -0.33, 0.94, -0.755, 0x2a3a4a),
    box(0.4, 0.03, 0.021, -0.4, 1.12, -0.744, 0x3ddc84),
    box(0.3, 0.03, 0.021, -0.36, 1.06, -0.744, 0xff3d6e),
    box(0.36, 0.03, 0.021, -0.38, 1.0, -0.744, 0x3ddc84),
    box(0.6, 0.38, 0.04, 0.33, 0.9, -0.78, 0x1b1f2a),
    box(0.54, 0.3, 0.02, 0.33, 0.94, -0.755, 0x3a4a5e),
    box(0.06, 0.14, 0.06, -0.33, 0.78, -0.78, 0x1b1f2a),
    box(0.06, 0.14, 0.06, 0.33, 0.78, -0.78, 0x1b1f2a),
    box(0.5, 0.02, 0.16, 0, 0.78, -0.35, 0x2b2f3a), // keyboard
    box(0.55, 0.08, 0.5, 0, 0.45, 0.2, 0x1f2430), // chair seat
    box(0.5, 0.6, 0.08, 0, 0.53, 0.45, 0x1f2430),
    cyl(0.04, 0.45, 0, 0, 0.2, 0x555b66),
  ]);

const kitchen = () =>
  join([
    box(1.7, 0.88, 0.62, 0, 0, -0.65, 0xe9e4da),
    box(1.74, 0.05, 0.66, 0, 0.88, -0.65, 0x4a4a52), // worktop
    box(0.5, 0.02, 0.38, 0.45, 0.93, -0.65, 0x9aa4ad), // sink
    box(0.04, 0.25, 0.04, 0.45, 0.93, -0.88, 0xc0c6cc),
    cyl(0.12, 0.02, -0.35, 0.93, -0.6, 0x222222), // hob rings
    cyl(0.1, 0.02, -0.65, 0.93, -0.72, 0x222222),
    box(0.4, 0.02, 0.01, -0.5, 0.6, -0.335, 0xb0a99a),
    box(0.4, 0.02, 0.01, 0.1, 0.6, -0.335, 0xb0a99a),
    box(0.4, 0.02, 0.01, 0.6, 0.6, -0.335, 0xb0a99a),
  ]);

const wardrobe = () =>
  join([
    box(1.3, 2.0, 0.6, 0, 0, -0.65, WOOD),
    box(0.01, 1.8, 0.01, 0, 0.1, -0.345, WOOD_DARK),
    box(0.04, 0.2, 0.03, -0.08, 1.0, -0.33, 0xd8c08a),
    box(0.04, 0.2, 0.03, 0.08, 1.0, -0.33, 0xd8c08a),
    cyl(0.2, 0.3, 0.75, 0, -0.6, 0x9a6a44), // a pot plant beside it
    cyl(0.28, 0.5, 0.75, 0.3, -0.6, 0x3a8a4a),
  ]);

const dining = () => {
  const parts = [
    box(1.3, 0.05, 0.85, 0, 0.74, -0.1, WOOD_LIGHT),
    ...[[-0.58, -0.45], [0.58, -0.45], [-0.58, 0.25], [0.58, 0.25]].map(([x, z]) => box(0.06, 0.74, 0.06, x, 0, z, WOOD)),
    cyl(0.07, 0.18, 0.15, 0.79, -0.1, 0xf1ede4), // a mug
  ];
  for (const [x, z, back] of [[-0.35, -0.75, -1], [0.35, -0.75, -1], [-0.35, 0.55, 1], [0.35, 0.55, 1]] as const) {
    parts.push(box(0.4, 0.05, 0.4, x, 0.45, z, WOOD));
    parts.push(box(0.4, 0.45, 0.05, x, 0.5, z + back * 0.18, WOOD));
  }
  return join(parts);
};

const hay = () =>
  join([
    box(1.2, 0.55, 0.7, -0.2, 0, -0.5, 0xd8b85a),
    box(1.2, 0.55, 0.7, 0.3, 0, 0.2, 0xcfae4e),
    box(1.2, 0.55, 0.7, 0.05, 0.55, -0.2, 0xe2c466),
    box(1.21, 0.04, 0.71, -0.2, 0.25, -0.5, 0x9a7a2a),
    box(1.21, 0.04, 0.71, 0.3, 0.25, 0.2, 0x9a7a2a),
    box(1.21, 0.04, 0.71, 0.05, 0.8, -0.2, 0x9a7a2a),
  ]);

const workbench = () =>
  join([
    box(1.7, 0.08, 0.7, 0, 0.85, -0.55, WOOD),
    ...[[-0.78, -0.82], [0.78, -0.82], [-0.78, -0.26], [0.78, -0.26]].map(([x, z]) => box(0.08, 0.85, 0.08, x, 0, z, WOOD_DARK)),
    box(1.7, 0.9, 0.04, 0, 0.93, -0.9, 0x7a6a5a), // pegboard
    box(0.35, 0.18, 0.2, -0.5, 0.93, -0.55, 0xc0392b), // toolbox
    box(0.06, 0.3, 0.02, 0.3, 1.2, -0.87, 0x8a8f99),
    box(0.25, 0.04, 0.02, 0.55, 1.3, -0.87, 0x8a8f99),
  ]);

const HOUSE_KINDS = [bed, sofa, bookshelf, desk, kitchen, wardrobe, dining];
const BARN_KINDS = [hay, hay, workbench];

/** Turn the piece so its back faces the wall next to it. */
const facing = (tx: number, ty: number) => {
  const wall = (x: number, y: number) => '#w'.includes(tileAt(x, y));
  const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const d = dirs.find(([dx, dy]) => wall(tx + dx, ty + dy)) ?? [0, -1];
  // Local -z goes to (dx, dy): rotation about y of atan2(-dx, -dy).
  return Math.atan2(-d[0], -d[1]);
};

export const buildFurniture = () => {
  const geos = [...HOUSE_KINDS, ...BARN_KINDS].map((f) => f());
  const lists = geos.map(() => [] as THREE.Matrix4[]);
  MAP.forEach((row, ty) =>
    [...row].forEach((c, tx) => {
      if (c !== 'u') return;
      const b = BUILDINGS.find((q) => tx >= q.x0 && ty >= q.y0 && tx < q.x0 + q.w && ty < q.y0 + q.h);
      const pick = tileHash(tx, ty, 21);
      const k = b?.barn ? HOUSE_KINDS.length + Math.floor(pick * BARN_KINDS.length) : Math.floor(pick * HOUSE_KINDS.length);
      lists[k].push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(tx * TILE + TILE / 2, 0, ty * TILE + TILE / 2),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facing(tx, ty), 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
    }),
  );
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const g = new THREE.Group();
  geos.forEach((geo, i) => {
    if (!lists[i].length) return;
    const im = new THREE.InstancedMesh(geo, m, lists[i].length);
    lists[i].forEach((mm, j) => im.setMatrixAt(j, mm));
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  });
  return g;
};

/** Rugs in the middle of rooms, for colour (no collision). */
export const buildRugs = () => {
  const g = new THREE.Group();
  const colors = [0xb0603c, 0x3d6db5, 0x6b4f8a, 0x3a8a5a, 0xc9a24a];
  BUILDINGS.forEach((b, i) => {
    if (b.barn) return;
    const w = Math.max(1.6, (b.w - 3) * TILE * 0.6);
    const d = Math.max(1.4, (b.h - 3) * TILE * 0.55);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set((b.x0 + b.w / 2) * TILE, 0.02, (b.y0 + b.h / 2) * TILE);
    rug.receiveShadow = true;
    g.add(rug);
  });
  return g;
};
