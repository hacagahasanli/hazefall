import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching: many small meshes that never move become one mesh per material, so a house, a barn, the roads or the
 * container yard cost a few draw calls instead of dozens. Transforms are baked into the vertices; the materials are the
 * originals (meshes that share a material, or an identical one, end up in the same batch).
 */

const hex = (c?: THREE.Color) => (c ? c.getHexString() : '-');

/** Materials that would draw the same: same kind, colours, maps and flags. */
export const materialKey = (m: THREE.Material) => {
  const s = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [
    m.type, hex(s.color), hex(s.emissive), s.emissiveIntensity, s.map?.uuid, s.vertexColors, s.roughness, s.metalness, s.flatShading,
    m.side, m.transparent, m.opacity, m.depthWrite, m.blending, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.alphaTest,
    m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? '' : m.uuid,
  ].join('|');
};

/** Non-indexed copy, with the transform applied and only these attributes kept. */
const prepare = (g: THREE.BufferGeometry, m: THREE.Matrix4, keep: string[]) => {
  const out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
  for (const name of Object.keys(out.attributes)) if (!keep.includes(name)) out.deleteAttribute(name);
  out.morphAttributes = {};
  out.clearGroups();
  out.applyMatrix4(m);
  return out;
};

interface Part {
  geo: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  /** A tag the caller can use to show or hide a part later (a building index). */
  tag: number;
  renderOrder: number;
}

/** The meshes under `root` (not instanced), with their transforms relative to `root`. */
export const collectParts = (root: THREE.Object3D, tag = 0): Part[] => {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts: Part[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.visible) return;
    if (Array.isArray(o.material)) throw new Error('mergeStatic: multi-material meshes are not supported');
    parts.push({ geo: o.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, tag, renderOrder: o.renderOrder });
  });
  return parts;
};

/** One merged mesh, whose parts can be hidden and shown again by tag (their triangles collapse). */
export interface Batch {
  mesh: THREE.Mesh;
  /** Hide (or show) every part with this tag. */
  setHidden: (tag: number, hidden: boolean) => void;
}

const batchOf = (parts: Part[], bake: boolean): Batch => {
  // Same attributes everywhere: keep the ones every part has.
  const names = Object.keys(parts[0].geo.attributes).filter((n) => parts.every((p) => p.geo.attributes[n]) && n !== 'uv1' && n !== 'uv2');
  const sorted = [...parts].sort((a, b) => a.tag - b.tag);
  const geos = sorted.map((p) => {
    if (!bake) return prepare(p.geo, p.matrix, names);
    const src = p.material as THREE.MeshStandardMaterial;
    return withColor(prepare(p.geo, p.matrix, bakedNames(src)), src);
  });
  const counts = geos.map((g) => g.getAttribute('position').count);
  const geo = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  // A plain index so a tag's range can be collapsed (all zeros: degenerate triangles) and restored.
  const count = geo.getAttribute('position').count;
  const full = new Uint32Array(count);
  for (let i = 0; i < count; i++) full[i] = i;
  geo.setIndex(new THREE.BufferAttribute(full.slice(), 1));
  const ranges = new Map<number, [number, number]>();
  let at = 0;
  sorted.forEach((p, i) => {
    const n = counts[i];
    const r = ranges.get(p.tag);
    if (r) r[1] += n;
    else ranges.set(p.tag, [at, n]);
    at += n;
  });
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const mesh = new THREE.Mesh(geo, bake ? bakedMaterial(sorted[0].material as THREE.MeshStandardMaterial) : sorted[0].material);
  mesh.castShadow = parts.some((p) => p.castShadow);
  mesh.receiveShadow = parts.some((p) => p.receiveShadow);
  mesh.renderOrder = parts[0].renderOrder;
  const hidden = new Set<number>();
  return {
    mesh,
    setHidden: (tag, hide) => {
      if (hidden.has(tag) === hide) return;
      const r = ranges.get(tag);
      if (!r) return;
      if (hide) hidden.add(tag);
      else hidden.delete(tag);
      const idx = geo.index!;
      const arr = idx.array as Uint32Array;
      if (hide) arr.fill(0, r[0], r[0] + r[1]);
      else arr.set(full.subarray(r[0], r[0] + r[1]), r[0]);
      idx.addUpdateRange(r[0], r[1]);
      idx.needsUpdate = true;
    },
  };
};

/**
 * Merges parts into one batch per material (and shadow flags, and chunk when `chunk` is set: parts are grouped by the
 * square of that size their centre falls in, so far batches can still be frustum-culled). With `bake`, plain coloured
 * parts have their colour, roughness, metalness and glow moved into the vertices, so they share one batch whatever
 * their colour.
 */
export const mergeParts = (parts: Part[], opts: { chunk?: number; bake?: boolean } = {}): Batch[] => {
  const groups = new Map<string, Part[]>();
  const c = new THREE.Vector3();
  for (const p of parts) {
    const baked = !!opts.bake && bakeable(p.material, p.geo);
    const what = baked ? `baked|${plainKey(p.material as THREE.MeshStandardMaterial)}` : `${materialKey(p.material)}#${Object.keys(p.geo.attributes).sort().join(',')}`;
    let key = `${what}#${p.castShadow}${p.receiveShadow}#${p.renderOrder}`;
    if (opts.chunk) {
      if (!p.geo.boundingSphere) p.geo.computeBoundingSphere();
      c.copy(p.geo.boundingSphere!.center).applyMatrix4(p.matrix);
      key += `#${Math.floor(c.x / opts.chunk)},${Math.floor(c.z / opts.chunk)}`;
    }
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(p);
  }
  return [...groups.values()].map((list) => batchOf(list, !!opts.bake && bakeable(list[0].material, list[0].geo)));
};

/** Everything under `root` merged per material into a new group (the root itself is left alone). */
export const mergeStatic = (root: THREE.Object3D, opts: { chunk?: number; bake?: boolean } = {}) => {
  const g = new THREE.Group();
  mergeParts(collectParts(root), opts).forEach((b) => g.add(b.mesh));
  g.position.copy(root.position);
  g.quaternion.copy(root.quaternion);
  g.scale.copy(root.scale);
  return g;
};

/**
 * A standard material whose look can move into the vertices: opaque, no shader hooks, no maps but a colour map (which
 * the baked material keeps), plain colours or vertex colours.
 */
const plainColor = (m: THREE.Material): m is THREE.MeshStandardMaterial =>
  m.type === 'MeshStandardMaterial' &&
  m instanceof THREE.MeshStandardMaterial &&
  !m.normalMap && !m.bumpMap && !m.roughnessMap && !m.metalnessMap && !m.emissiveMap && !m.aoMap && !m.lightMap && !m.alphaMap && !m.envMap && !m.displacementMap &&
  !m.transparent && m.opacity === 1 && !m.alphaTest && !m.wireframe &&
  m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
/** Can this mesh be baked: a plain material, and the geometry has what it needs (uvs for a map, rgb vertex colours). */
const bakeable = (m: THREE.Material, g: THREE.BufferGeometry): m is THREE.MeshStandardMaterial =>
  plainColor(m) && (!m.map || !!g.attributes.uv) && (!m.vertexColors || g.attributes.color?.itemSize === 3);
/** The attributes a baked part keeps (colour and the rest are added). */
const bakedNames = (m: THREE.MeshStandardMaterial) => ['position', 'normal', ...(m.map ? ['uv'] : []), ...(m.vertexColors ? ['color'] : [])];

/** A copy of a material that keeps its shader hooks (a plain clone drops them). */
export const cloneMaterial = <T extends THREE.Material>(m: T): T => {
  const c = m.clone() as T;
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
};
/** What a baked material still has to agree on: everything else (colour, roughness, metalness, glow) is per vertex. */
const plainKey = (m: THREE.MeshStandardMaterial) => [m.flatShading, m.side, m.map?.uuid ?? ''].join('|');
/**
 * One shared material per kind of baked mesh: a standard material that takes its colour from the vertex colours and
 * its roughness, metalness and emissive glow from two more vertex attributes, so parts that had different materials
 * draw in one call and look the same.
 */
const bakedMats = new Map<string, THREE.MeshStandardMaterial>();
const bakedMaterial = (src: THREE.MeshStandardMaterial) => {
  const key = plainKey(src);
  let m = bakedMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: src.flatShading, side: src.side, map: src.map });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nattribute vec3 aEm;\nvarying vec2 vRM;\nvarying vec3 vEm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;\nvEm = aEm;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRM;\nvarying vec3 vEm;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEm;\n#include <emissivemap_fragment>');
    };
    m.customProgramCacheKey = () => 'baked-rm-em';
    // Not one material per map: the program is the same, only the bound texture differs.
    bakedMats.set(key, m);
  }
  return m;
};
/** The material's look on every vertex: colour, roughness and metalness, emissive. */
const withColor = (g: THREE.BufferGeometry, src: THREE.MeshStandardMaterial) => {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const rm = new Float32Array(n * 2);
  const em = new Float32Array(n * 3);
  const e = src.emissive.clone().multiplyScalar(src.emissiveIntensity);
  // Vertex colours already there (a vertex-coloured material) are kept, times the material's colour.
  const had = src.vertexColors ? (g.getAttribute('color') as THREE.BufferAttribute) : null;
  for (let i = 0; i < n; i++) {
    if (had) col.set([had.getX(i) * src.color.r, had.getY(i) * src.color.g, had.getZ(i) * src.color.b], i * 3);
    else col.set([src.color.r, src.color.g, src.color.b], i * 3);
    rm.set([src.roughness, src.metalness], i * 2);
    em.set([e.r, e.g, e.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
  g.setAttribute('aEm', new THREE.BufferAttribute(em, 3));
  return g;
};

/**
 * For models built from rigid parts (a gun, a loot item, a parachute): under every group, the leaf meshes are merged
 * into one per material, in that group's space, so the group still moves them together. Parts with a plain coloured
 * material have their colour baked into the vertices, so all of those become one mesh whatever their colour. Groups
 * in `skip` are left alone; tagged parts (userData) only merge with parts tagged the same, and keep the tag.
 */
export const mergeSiblings = (root: THREE.Object3D, skip: Set<THREE.Object3D> = new Set()) => {
  const visit = (node: THREE.Object3D) => {
    if (skip.has(node)) return;
    [...node.children].forEach(visit);
    const leaves = node.children.filter(
      (o): o is THREE.Mesh => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.children.length === 0 && o.visible && !Array.isArray(o.material) && !skip.has(o),
    );
    const groups = new Map<string, THREE.Mesh[]>();
    for (const m of leaves) {
      const mat = m.material as THREE.Material;
      const what = bakeable(mat, m.geometry) ? `baked|${plainKey(mat)}` : `${materialKey(mat)}#${Object.keys(m.geometry.attributes).sort().join(',')}`;
      const key = `${what}#${m.castShadow}${m.receiveShadow}#${m.renderOrder}#${JSON.stringify(m.userData)}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(m);
    }
    for (const list of groups.values()) {
      const first = list[0].material as THREE.Material;
      const baked = bakeable(first, list[0].geometry);
      if (list.length < 2 && !baked) continue;
      const names = Object.keys(list[0].geometry.attributes).filter((n) => n !== 'uv1' && n !== 'uv2');
      const geos = list.map((m) => {
        m.updateMatrix();
        if (!baked) return prepare(m.geometry, m.matrix, names);
        const src = m.material as THREE.MeshStandardMaterial;
        return withColor(prepare(m.geometry, m.matrix, bakedNames(src)), src);
      });
      const geo = mergeGeometries(geos)!;
      geos.forEach((g) => g.dispose());
      const merged = new THREE.Mesh(geo, baked ? bakedMaterial(first) : first);
      merged.castShadow = list[0].castShadow;
      merged.receiveShadow = list[0].receiveShadow;
      merged.renderOrder = list[0].renderOrder;
      merged.userData = { ...list[0].userData };
      node.remove(...list);
      node.add(merged);
    }
  };
  visit(root);
};

/**
 * For a model whose parts never move relative to each other (a gun, a loot item): every mesh under `root`, however
 * deeply nested, is merged into `root` itself, one mesh per material (plain colours baked into the vertices).
 */
export const mergeRigid = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const flat = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o !== root && o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.visible && !Array.isArray(o.material)) meshes.push(o);
  });
  for (const m of meshes) {
    // The transform goes into the vertices (a decomposed matrix could lose a shear from a scaled, turned parent).
    const copy = new THREE.Mesh(m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)), m.material);
    copy.castShadow = m.castShadow;
    copy.receiveShadow = m.receiveShadow;
    copy.renderOrder = m.renderOrder;
    copy.userData = { ...m.userData };
    m.parent!.remove(m);
    flat.add(copy);
  }
  mergeSiblings(flat);
  root.add(...flat.children);
};

/**
 * A fighter built from rigid parts on animated groups (torso, head, upper arms, forearms, thighs, shins) drawn as a
 * skinned mesh: each group is a bone, every part is weighted fully to its group, and the parts' colours move into the
 * vertices, so all the parts with the same kind of material (and shadow flags) are one draw call. The groups keep
 * animating exactly as before. Parts under `skip` (the weapon slot) stay as they are; each group in `own` (the armour
 * vest, shown and hidden) gets its own skinned mesh inside it, so hiding the group still hides its parts.
 */
export const skinRig = (root: THREE.Object3D, skip: Set<THREE.Object3D>, own: THREE.Object3D[] = []) => {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const build = (top: THREE.Object3D, holder: THREE.Object3D, stop: Set<THREE.Object3D>) => {
    const bones: THREE.Object3D[] = [];
    const groups = new Map<string, { mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
    const leaves: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D) => {
      if (stop.has(o)) return;
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.children.length === 0 && o.visible && !Array.isArray(o.material) && bakeable(o.material, o.geometry)) leaves.push(o);
      o.children.forEach(walk);
    };
    walk(top);
    for (const m of leaves) {
      const bone = m.parent!;
      let bi = bones.indexOf(bone);
      if (bi < 0) bi = bones.push(bone) - 1;
      const src = m.material as THREE.MeshStandardMaterial;
      const key = `${plainKey(src)}|${m.castShadow}|${m.receiveShadow}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { mat: bakedMaterial(src), geos: [], cast: m.castShadow, receive: m.receiveShadow }));
      const geo = prepare(m.geometry, new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld), bakedNames(src));
      withColor(geo, src);
      const n = geo.getAttribute('position').count;
      const idx = new Uint16Array(n * 4);
      const wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        idx[i * 4] = bi;
        wt[i * 4] = 1;
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
      g.geos.push(geo);
    }
    if (!leaves.length) return;
    leaves.forEach((m) => m.parent!.remove(m));
    // Bind pose: each bone's transform relative to the root as it is now.
    const inverses = bones.map((b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert());
    const skeleton = new THREE.Skeleton(bones as THREE.Bone[], inverses);
    for (const g of groups.values()) {
      const geo = mergeGeometries(g.geos)!;
      g.geos.forEach((x) => x.dispose());
      const sm = new THREE.SkinnedMesh(geo, g.mat);
      sm.castShadow = g.cast;
      sm.receiveShadow = g.receive;
      // Culled by a fixed sphere round the rig's origin (in the mesh's own space) that holds every pose: standing,
      // running, lying flat in free fall, hanging under the canopy.
      sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.4);
      holder.add(sm);
      // Vertices are in the root's space at bind time and the bone inverses include the root, so the bind matrix is
      // the identity (in 'attached' mode the mesh's own place in the rig cancels out).
      sm.bind(skeleton, new THREE.Matrix4());
    }
  };
  const stopAll = new Set<THREE.Object3D>([...skip, ...own]);
  build(root, root, stopAll);
  for (const o of own) build(o, o, skip);
};
