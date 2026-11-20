import * as THREE from 'three';

/**
 * Chunked instancing: the instances of one kind (a tree, a bush, a grass tuft) are bucketed into square chunks on the
 * ground. Each frame the view decides which chunks are worth drawing (inside the camera's frustum and its view distance);
 * when that set changes, the chosen chunks are copied into the one InstancedMesh and `count` is set. So a kind still costs
 * one draw call, but only the instances near what the camera sees are drawn.
 *
 * Shadows: the chunks inside the sun's shadow box are copied first, and in the shadow pass `count` is cut to them, so far
 * instances never cost shadow-map work.
 */

export const CHUNK = 16;

/** What the camera sees this frame, shared by every chunked kind. */
export interface ChunkView {
  frustum: THREE.Frustum;
  /** Camera position on the ground plane (x, z) and height. */
  x: number;
  z: number;
  y: number;
  /** The shadow box on the ground (centre and half size), or null when shadows are off. */
  shadow: { x: number; z: number; half: number } | null;
  /** Ground distance scale: 1 normally; per-tier view distances multiply each kind's own reach. */
  reach: number;
  /** Nothing is drawn beyond this ground distance (m): past the end of the fog. */
  far: number;
  /** The far representation is used beyond this distance from the camera (Infinity: never). */
  lodNear: number;
  /** A number that changes whenever the inputs above change (camera moved or turned, tier changed). */
  frame: number;
}

export interface InstanceData {
  x: number;
  z: number;
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

interface Chunk {
  box: THREE.Box3;
  cx: number;
  cz: number;
  start: number;
  count: number;
}

const tmpBox = new THREE.Box3();

/** Ground distance from (x, z) to the nearest point of a chunk's footprint. */
const rectDistance = (c: Chunk, x: number, z: number) => {
  const dx = Math.max(c.box.min.x - x, 0, x - c.box.max.x);
  const dz = Math.max(c.box.min.z - z, 0, z - c.box.max.z);
  return Math.hypot(dx, dz);
};

export interface ChunkedKind {
  /** The mesh(es) to add to the scene: the near one, plus a far one when a cheaper geometry was given. */
  meshes: THREE.InstancedMesh[];
  update: (v: ChunkView) => void;
  /** Total instances (for tests and the perf readout). */
  total: number;
}

/**
 * One kind of instance, chunked. `height` is how tall the tallest instance stands (for the frustum test), `reach` how far
 * from the camera it is worth drawing at all (metres, before the view's reach scale), `farGeo` an optional cheaper
 * geometry for the chunks beyond the view's `lodNear`.
 */
export const chunkedInstances = (
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  items: InstanceData[],
  opts: { height: number; bottom?: number; radius?: number; reach?: number; castShadow?: boolean; farGeo?: THREE.BufferGeometry; colors?: boolean },
): ChunkedKind => {
  // A chunk's box reaches past its edge by the instances' radius, and a few metres more for shadow casters: a tree
  // just off screen still throws its shadow into view.
  const pad = (opts.radius ?? 3) + (opts.castShadow === false ? 0 : 4);
  const reach = opts.reach ?? Infinity;
  // Bucket by chunk, then lay the instances out chunk by chunk so a chunk is one contiguous range.
  const buckets = new Map<string, InstanceData[]>();
  for (const it of items) {
    const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(it);
  }
  const n = items.length;
  const srcM = new Float32Array(Math.max(1, n) * 16);
  const srcC = opts.colors ? new Float32Array(Math.max(1, n) * 3) : null;
  const chunks: Chunk[] = [];
  let at = 0;
  for (const [key, list] of buckets) {
    const [cx, cz] = key.split(',').map(Number);
    const box = new THREE.Box3(new THREE.Vector3(cx * CHUNK - pad, opts.bottom ?? -0.5, cz * CHUNK - pad), new THREE.Vector3((cx + 1) * CHUNK + pad, opts.height, (cz + 1) * CHUNK + pad));
    chunks.push({ box, cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK, start: at, count: list.length });
    for (const it of list) {
      it.matrix.toArray(srcM, at * 16);
      if (srcC) (it.color ?? new THREE.Color(1, 1, 1)).toArray(srcC, at * 3);
      at++;
    }
  }

  const make = (g: THREE.BufferGeometry) => {
    const im = new THREE.InstancedMesh(g, material, Math.max(1, n));
    im.instanceMatrix.array.set(srcM);
    if (srcC) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(srcC), 3);
    }
    im.count = n;
    im.castShadow = opts.castShadow ?? true;
    im.receiveShadow = true;
    // Culling is done here, per chunk; the mesh itself spans the map.
    im.frustumCulled = false;
    let full = n;
    im.onBeforeShadow = () => {
      full = im.count;
      im.count = (im.userData.shadowCount as number | undefined) ?? im.count;
    };
    im.onAfterShadow = () => {
      im.count = full;
    };
    return im;
  };
  const near = make(geo);
  const far = opts.farGeo ? make(opts.farGeo) : null;
  const meshes = far ? [near, far] : [near];

  /** Copies these chunks into a mesh (shadow ones first) and sets its counts. */
  const fill = (im: THREE.InstancedMesh, list: Chunk[], shadowed: Set<Chunk>) => {
    list.sort((a, b) => Number(shadowed.has(b)) - Number(shadowed.has(a)));
    const dst = im.instanceMatrix.array as Float32Array;
    const dstC = im.instanceColor?.array as Float32Array | undefined;
    let k = 0;
    let shadowCount = 0;
    for (const c of list) {
      dst.set(srcM.subarray(c.start * 16, (c.start + c.count) * 16), k * 16);
      if (dstC && srcC) dstC.set(srcC.subarray(c.start * 3, (c.start + c.count) * 3), k * 3);
      k += c.count;
      if (shadowed.has(c)) shadowCount = k;
    }
    im.count = k;
    im.userData.shadowCount = shadowCount;
    im.visible = k > 0;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };

  // null: nothing chosen yet (an empty view is a choice too).
  let lastKey: string | null = null;
  const nearList: Chunk[] = [];
  const farList: Chunk[] = [];
  const shadowed = new Set<Chunk>();
  return {
    meshes,
    total: n,
    update: (v) => {
      nearList.length = 0;
      farList.length = 0;
      shadowed.clear();
      const limit = Math.min(reach * v.reach, v.far);
      let key = '';
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const d = rectDistance(c, v.x, v.z);
        if (d > limit) continue;
        if (!v.frustum.intersectsBox(c.box)) continue;
        // Fewer faces by true distance (the camera may be high above: falling, or the plane).
        const isFar = far !== null && Math.hypot(d, Math.max(0, v.y - opts.height)) > v.lodNear;
        (isFar ? farList : nearList).push(c);
        if (v.shadow && opts.castShadow !== false) {
          tmpBox.copy(c.box);
          const s = v.shadow;
          if (tmpBox.min.x < s.x + s.half && tmpBox.max.x > s.x - s.half && tmpBox.min.z < s.z + s.half && tmpBox.max.z > s.z - s.half) shadowed.add(c);
        }
        key += `${i}${isFar ? 'f' : 'n'}${shadowed.has(c) ? 's' : ''},`;
      }
      if (key === lastKey) return;
      lastKey = key;
      fill(near, nearList, shadowed);
      if (far) fill(far, farList, shadowed);
    },
  };
};
