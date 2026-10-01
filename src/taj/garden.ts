/**
 * Charbagh garden, reflecting pool, fountains, vegetation, boundary walls, ground and river.
 *
 * Layout (metres): the long central channel runs along the main axis from the terrace steps
 * (z ≈ 72) to z ≈ 312, crossed by the east–west channel at z = 185 where the square "lotus tank"
 * sits. Four lawn quadrants with flower-bed borders, sandstone walkways and cypress avenues
 * emphasise the strict bilateral symmetry of the real complex.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, M, mul } from './geo';
import { addChhatri } from './parts';
import type { Materials } from './materials';
import { hash, makeBlobShadow, makeFoliage, rng } from './textures';
import { ReflectiveWater } from './water';
import { WORLD } from './platform';

export const GARDEN = {
  z0: 72, // back end of pool
  z1: 312, // front end of pool
  zc: 185, // cross channel / tank
  a: 4.5, // half-width of channels
  t: 11, // half-size of the central tank
  crossX: 128, // length of east–west channels
  coping: 1.2,
  walk: 3.6,
  wallX: 150,
  wallZ: 336,
  waterY: -0.12,
};

const G = GARDEN;

/* ------------------------------------------------------------------ shapes */

/** Outline of the plus-shaped pool grown by `o` (points in world x,z). */
function plusOutline(o: number): THREE.Vector2[] {
  const a = G.a + o;
  const t = G.t + o;
  const X = G.crossX + o;
  const z0 = G.z0 - o;
  const z1 = G.z1 + o;
  const zc = G.zc;
  const P = (x: number, z: number) => new THREE.Vector2(x, z);
  return [
    P(-a, z1), P(-a, zc + t), P(-t, zc + t), P(-t, zc + a), P(-X, zc + a), P(-X, zc - a),
    P(-t, zc - a), P(-t, zc - t), P(-a, zc - t), P(-a, z0), P(a, z0), P(a, zc - t),
    P(t, zc - t), P(t, zc - a), P(X, zc - a), P(X, zc + a), P(t, zc + a), P(t, zc + t),
    P(a, zc + t), P(a, z1),
  ];
}

/** ShapeGeometry from world x,z points (mesh must be rotated -90° about X to lie flat). */
function flatShape(outer: THREE.Vector2[], hole?: THREE.Vector2[]): THREE.ShapeGeometry {
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.y)));
  if (hole) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.y))));
  return new THREE.ShapeGeometry(shape);
}

function rect(x0: number, z0: number, x1: number, z1: number): THREE.Vector2[] {
  return [new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)];
}

function flatMesh(geo: THREE.BufferGeometry, mat: THREE.Material, y: number, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = receive;
  return m;
}

/* -------------------------------------------------------------------- wind */

export interface WindUniforms {
  uTime: { value: number };
  uAmp: { value: number };
}

/** Patch a standard material with a cheap vertex-shader wind sway (instance-position phase). */
function applyWind(mat: THREE.MeshStandardMaterial, wind: WindUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uAmp = wind.uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hh = max(transformed.y, 0.0);
        float ph = ip.x * 0.11 + ip.z * 0.17;
        float gust = 0.65 + 0.35 * sin(uTime * 0.35 + ph * 0.3);
        transformed.x += (sin(uTime * 1.3 + ph) + 0.45 * sin(uTime * 3.1 + ph * 1.7 + hh * 0.35)) * hh * hh * uAmp * gust;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * hh * hh * uAmp * 0.7 * gust;`
      );
  };
  mat.customProgramCacheKey = () => 'wind';
}

/* ------------------------------------------------------------- tree meshes */

function cypressGeometry(): THREE.BufferGeometry {
  const H = 14;
  const pts: THREE.Vector2[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = 0.55 * (1 - t) * (1 - t) + 0.95 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
    pts.push(new THREE.Vector2(Math.max(r, 0.001), 0.4 + t * H));
  }
  const g = new THREE.LatheGeometry(pts, 10);
  // organic irregularity
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + (hash(Math.round(x * 13 + y * 7), Math.round(z * 11 + y * 3), 5) - 0.5) * 0.18;
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function roundTreeGeometry(): THREE.BufferGeometry {
  const canopy = new THREE.IcosahedronGeometry(1, 2);
  const pos = canopy.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.84 + hash(Math.round(x * 9 + 20), Math.round(y * 9 + z * 5 + 20), 17) * 0.32;
    pos.setXYZ(i, x * k * 3.4, y * k * 2.7 + 6.0, z * k * 3.4);
  }
  canopy.computeVertexNormals();
  const trunk = new THREE.CylinderGeometry(0.26, 0.4, 5.2, 7);
  trunk.translate(0, 2.6, 0);
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const count = g.attributes.position.count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = 0.85 + hash(i, 3, 9) * 0.3;
      arr[i * 3] = r * v;
      arr[i * 3 + 1] = gr * v;
      arr[i * 3 + 2] = b * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const merged = mergeGeometries([paint(canopy, 0.3, 0.46, 0.2), paint(trunk, 0.28, 0.2, 0.14)], false)!;
  return merged;
}

/* ----------------------------------------------------------------- builder */

export interface GardenResult {
  group: THREE.Group;
  water: ReflectiveWater;
  river: THREE.Mesh;
  wind: WindUniforms;
  update(time: number): void;
  dispose(): void;
}

export interface GardenOptions {
  waterNormal: THREE.Texture;
  waterSize: { w: number; h: number };
  samples: number;
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  deepColor: THREE.Color;
  mobile: boolean;
  tick: (label: string) => Promise<void>;
}

export async function buildGarden(mats: Materials, opts: GardenOptions): Promise<GardenResult> {
  const group = new THREE.Group();
  group.name = 'garden';

  /* ---------------------------------------------------------- water + pool */
  await opts.tick('Filling the reflecting pool…');
  const waterGeo = flatShape(plusOutline(0));
  const water = new ReflectiveWater(waterGeo, {
    normalMap: mats.waterNormal,
    width: opts.waterSize.w,
    height: opts.waterSize.h,
    samples: opts.samples,
    sunDirection: opts.sunDirection,
    sunColor: opts.sunColor,
    deepColor: opts.deepColor,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = G.waterY;
  water.renderOrder = 2;
  group.add(water);

  group.add(flatMesh(flatShape(plusOutline(0.2)), mats.poolFloor, -0.9, false));

  // marble coping around the whole pool
  {
    const b = new Builder();
    const shape = new THREE.Shape(plusOutline(G.coping).map((p) => new THREE.Vector2(p.x, -p.y)));
    shape.holes.push(new THREE.Path(plusOutline(0).map((p) => new THREE.Vector2(p.x, -p.y))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false });
    b.add('marble', g, mul(M.t(0, -0.9, 0), M.rx(-Math.PI / 2)), 'box');
    const coping = b.build(mats.byKey);
    group.add(coping);
  }

  /* ------------------------------------------------- ground, paths, lawns */
  await opts.tick('Laying out the Charbagh…');
  const xIn = G.a + G.coping + G.walk; // 9.3: inner edge of lawns
  const lx1 = G.wallX - 4;
  const lzNear0 = 77;
  const lzNear1 = G.zc - xIn;
  const lzFar0 = G.zc + xIn;
  const lzFar1 = G.wallZ - 4;

  // paved base of the whole garden
  group.add(flatMesh(flatShape(rect(-G.wallX, 66, G.wallX, G.wallZ)), mats.paving, 0.02));
  // sandstone walkways around the pool
  group.add(flatMesh(flatShape(plusOutline(G.coping + G.walk), plusOutline(G.coping * 0.8)), mats.paving, 0.05));

  const quads: [number, number, number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const [za, zb] of [
      [lzNear0, lzNear1],
      [lzFar0, lzFar1],
    ]) {
      const xa = sx > 0 ? xIn : -lx1;
      const xb = sx > 0 ? lx1 : -xIn;
      quads.push([xa, za, xb, zb]);
      group.add(flatMesh(flatShape(rect(xa - 0.5 * (sx > 0 ? 1 : -1) * 0, za, xb, zb)), mats.grass, 0.035));
      // flower-bed border
      const bw = 3.0;
      group.add(flatMesh(flatShape(rect(xa, za, xb, zb), rect(xa + bw, za + bw, xb - bw, zb - bw)), mats.bed, 0.045));
    }
  }

  /* ------------------------------------------------------- walls & kiosks */
  {
    const b = new Builder();
    const wallH = 5;
    const len = G.wallZ - 65;
    for (const sx of [-1, 1]) {
      b.add('sand', new THREE.BoxGeometry(2, wallH, len), M.t(sx * (G.wallX - 1), wallH / 2, 65 + len / 2), 'box');
      b.add('sand', new THREE.BoxGeometry(3, 0.5, len + 1), M.t(sx * (G.wallX - 1), wallH + 0.25, 65 + len / 2), 'box');
    }
    b.add('sand', new THREE.BoxGeometry(G.wallX * 2, wallH, 2), M.t(0, wallH / 2, G.wallZ - 1), 'box');
    b.add('sand', new THREE.BoxGeometry(G.wallX * 2 + 1, 0.5, 3), M.t(0, wallH + 0.25, G.wallZ - 1), 'box');
    // corner pavilions (front corners at garden level, rear corners on the terrace)
    const pav = { apothem: 3.4, baseH: 4.6, archH: 4.2, domeR: 4.2, domeH: 5.2, baseKey: 'sand' };
    for (const sx of [-1, 1]) {
      addChhatri(b, M.t(sx * (G.wallX - 4.5), 0, G.wallZ - 4.5), pav);
      addChhatri(b, M.t(sx * (G.wallX - 5), WORLD.terraceY, -WORLD.terraceHalfZ + 5), pav);
      addChhatri(b, M.t(sx * (G.wallX - 5), WORLD.terraceY, WORLD.terraceHalfZ - 5), pav);
    }
    group.add(b.build(mats.byKey));

    // crenellations along the wall tops
    const merlon = new THREE.BoxGeometry(1.2, 1.1, 1.0);
    const muv = merlon.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < muv.count; i++) muv.setXY(i, muv.getX(i) * 0.15, muv.getY(i) * 0.15);
    const spots: THREE.Matrix4[] = [];
    for (let z = 67; z < G.wallZ - 1; z += 2.6) {
      for (const sx of [-1, 1]) spots.push(M.t(sx * (G.wallX - 1), wallH + 0.5 + 0.55, z).multiply(M.ry(Math.PI / 2)));
    }
    for (let x = -G.wallX + 2; x < G.wallX - 1; x += 2.6) spots.push(M.t(x, wallH + 0.5 + 0.55, G.wallZ - 1));
    const merlons = new THREE.InstancedMesh(merlon, mats.sand, spots.length);
    spots.forEach((m, i) => merlons.setMatrixAt(i, m));
    merlons.castShadow = false;
    merlons.receiveShadow = true;
    group.add(merlons);
  }

  /* ---------------------------------------------------------- fountains */
  const jetSpots: { x: number; z: number; h: number }[] = [];
  for (let z = G.z0 + 14; z < G.zc - G.t - 6; z += 12) jetSpots.push({ x: 0, z, h: 1.7 });
  for (let z = G.zc + G.t + 8; z < G.z1 - 8; z += 12) jetSpots.push({ x: 0, z, h: 1.7 });
  for (let x = G.t + 10; x < G.crossX - 8; x += 12) {
    jetSpots.push({ x, z: G.zc, h: 1.7 });
    jetSpots.push({ x: -x, z: G.zc, h: 1.7 });
  }
  jetSpots.push({ x: 0, z: G.zc, h: 4.2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) jetSpots.push({ x: sx * 6.5, z: G.zc + sz * 6.5, h: 2.4 });

  const baseGeo = new THREE.CylinderGeometry(0.5, 0.62, 0.34, 14);
  const bases = new THREE.InstancedMesh(baseGeo, mats.marble, jetSpots.length);
  const jetGeo = new THREE.ConeGeometry(0.17, 1, 8, 1, true);
  jetGeo.translate(0, 0.5, 0);
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, jetSpots.length);
  jets.frustumCulled = false;
  const tmp = new THREE.Matrix4();
  jetSpots.forEach((s, i) => {
    const big = s.h > 4;
    tmp.compose(
      new THREE.Vector3(s.x, G.waterY + 0.1, s.z),
      new THREE.Quaternion(),
      new THREE.Vector3(big ? 2.4 : 1, 1, big ? 2.4 : 1)
    );
    bases.setMatrixAt(i, tmp);
  });
  bases.castShadow = true;
  group.add(bases, jets);
  // marble pedestal in the middle of the tank
  {
    const b = new Builder();
    b.add('marble', new THREE.CylinderGeometry(2.6, 3.0, 0.9, 24), M.t(0, G.waterY + 0.3, G.zc), 'box');
    b.add('marble', new THREE.CylinderGeometry(1.2, 1.7, 0.7, 24), M.t(0, G.waterY + 1.0, G.zc), 'box');
    group.add(b.build(mats.byKey));
  }

  /* ------------------------------------------------------------ vegetation */
  await opts.tick('Planting cypress avenues…');
  const wind: WindUniforms = { uTime: { value: 0 }, uAmp: { value: 0.0011 } };
  const foliage = makeFoliage();
  foliage.repeat.set(3, 3);
  const blobTex = makeBlobShadow();

  const cypressMat = new THREE.MeshStandardMaterial({
    color: 0x2f4a2b,
    map: foliage,
    bumpMap: foliage,
    bumpScale: 1.2,
    roughness: 0.95,
  });
  applyWind(cypressMat, wind);
  const roundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: foliage, roughness: 0.95 });
  applyWind(roundMat, wind);

  const cypressPos: [number, number][] = [];
  const orchardPos: [number, number][] = [];
  // avenues flanking the central channel
  for (const sx of [-1, 1]) {
    for (let z = 86; z <= 166; z += 12) cypressPos.push([sx * 14, z]);
    for (let z = 204; z <= 324; z += 12) cypressPos.push([sx * 14, z]);
    for (const sz of [-1, 1]) {
      for (let x = 30; x <= 138; x += 12) cypressPos.push([sx * x, G.zc + sz * 14]);
    }
  }
  // orchards in each quadrant
  for (const sx of [-1, 1]) {
    for (const x of [36, 60, 84, 108, 132]) {
      for (const z of [102, 126, 150, 228, 252, 276, 300]) orchardPos.push([sx * x, z]);
    }
  }

  const r = rng(2024);
  const addInstances = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    list: { x: number; y: number; z: number; s: number; rot: number }[],
    cast: boolean
  ) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const c = new THREE.Color();
    list.forEach((t, i) => {
      tmp.compose(
        new THREE.Vector3(t.x, t.y, t.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot),
        new THREE.Vector3(t.s, t.s * (0.92 + r() * 0.16), t.s)
      );
      mesh.setMatrixAt(i, tmp);
      const v = 0.85 + r() * 0.3;
      mesh.setColorAt(i, c.setRGB(v, v * (0.96 + r() * 0.08), v * 0.92));
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  addInstances(
    cypressGeometry(),
    cypressMat,
    cypressPos.map(([x, z]) => ({ x, y: 0.03, z, s: 1.0, rot: r() * 6.28 })),
    true
  );
  addInstances(
    roundTreeGeometry(),
    roundMat,
    orchardPos.map(([x, z]) => ({ x, y: 0.03, z, s: 1.05, rot: r() * 6.28 })),
    true
  );

  // contact blobs under garden trees
  {
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const all = [
      ...cypressPos.map(([x, z]) => ({ x, z, s: 5.2 })),
      ...orchardPos.map(([x, z]) => ({ x, z, s: 11 })),
    ];
    const blobs = new THREE.InstancedMesh(blobGeo, blobMat, all.length);
    all.forEach((t, i) => {
      tmp.compose(new THREE.Vector3(t.x + 0.8, 0.08, t.z - 0.8), new THREE.Quaternion(), new THREE.Vector3(t.s, 1, t.s));
      blobs.setMatrixAt(i, tmp);
    });
    blobs.renderOrder = 0.6;
    group.add(blobs);
  }

  // outer groves (beyond the garden walls) and the far river bank
  {
    const groves: { x: number; y: number; z: number; s: number; rot: number }[] = [];
    const count = opts.mobile ? 260 : 560;
    let guard = 0;
    while (groves.length < count && guard++ < 20000) {
      const x = (r() * 2 - 1) * 750;
      const z = -60 + r() * 760;
      if (Math.abs(x) < 170 && z < 350) continue;
      if (Math.abs(x) < 160 && z < 70) continue;
      // cluster: accept by low-frequency noise
      const n = hash(Math.floor(x / 60), Math.floor(z / 60), 7);
      if (n < 0.38) continue;
      groves.push({ x, y: -0.05, z, s: 1.1 + r() * 0.9, rot: r() * 6.28 });
    }
    addInstances(roundTreeGeometry(), roundMat, groves, false);

    const far: typeof groves = [];
    for (let i = 0; i < (opts.mobile ? 160 : 340); i++) {
      far.push({ x: (r() * 2 - 1) * 1100, y: -9.1, z: -440 - r() * 70, s: 2 + r() * 1.8, rot: r() * 6.28 });
    }
    addInstances(roundTreeGeometry(), roundMat, far, false);
  }

  /* ------------------------------------------------------- flower clusters */
  {
    const pal = [0xe9a21b, 0xd9588c, 0xc63b3b, 0xefece2, 0x8d52b4];
    const geo = new THREE.IcosahedronGeometry(0.34, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const list: { x: number; z: number; c: number }[] = [];
    for (const [xa, za, xb, zb] of quads) {
      const inset = 1.5;
      const x0 = Math.min(xa, xb) + inset;
      const x1 = Math.max(xa, xb) - inset;
      const z0 = za + inset;
      const z1 = zb - inset;
      for (let x = x0; x <= x1; x += 1.8) {
        const ci = Math.floor(Math.abs(x) / 10) % pal.length;
        list.push({ x, z: z0, c: ci }, { x, z: z1, c: ci });
      }
      for (let z = z0 + 1.8; z < z1; z += 1.8) {
        const ci = Math.floor(Math.abs(z - G.zc) / 10) % pal.length;
        list.push({ x: x0, z, c: ci }, { x: x1, z, c: ci });
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((f, i) => {
      tmp.compose(new THREE.Vector3(f.x, 0.2, f.z), new THREE.Quaternion(), new THREE.Vector3(1, 0.7, 1));
      mesh.setMatrixAt(i, tmp);
      mesh.setColorAt(i, col.setHex(pal[f.c]));
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  /* ------------------------------------------------- outer land and river */
  await opts.tick('Flowing the Yamuna…');
  const land = flatMesh(flatShape(rect(-4000, -66, 4000, 4000)), mats.outerGround, -0.08);
  group.add(land);
  const farBank = flatMesh(flatShape(rect(-4000, -4000, 4000, -470)), mats.outerGround, -9.2);
  group.add(farBank);
  const river = flatMesh(flatShape(rect(-4000, -470, 4000, -66)), mats.river, -11, false);
  group.add(river);
  const bankWall = new THREE.Mesh(new THREE.BoxGeometry(8000, 11, 2), mats.bank);
  bankWall.position.set(0, -5.5, -67);
  group.add(bankWall);
  const farWall = new THREE.Mesh(new THREE.BoxGeometry(8000, 2.2, 2), mats.bank);
  farWall.position.set(0, -10.1, -470);
  group.add(farWall);

  const jetBase = jetSpots.map((s) => s.h);
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const riverNormal = mats.river.normalMap!;

  return {
    group,
    water,
    river,
    wind,
    update(time: number) {
      wind.uTime.value = time;
      // animated fountain jets
      for (let i = 0; i < jetSpots.length; i++) {
        const s = jetSpots[i];
        const flick = 0.88 + 0.12 * Math.sin(time * 3.1 + i * 1.7) + 0.05 * Math.sin(time * 7.3 + i);
        const big = jetBase[i] > 4 ? 1.8 : 1;
        pos.set(s.x, G.waterY + 0.2, s.z);
        scl.set(big, jetBase[i] * flick, big);
        tmp.compose(pos, quat, scl);
        jets.setMatrixAt(i, tmp);
      }
      jets.instanceMatrix.needsUpdate = true;
      riverNormal.offset.set(time * 0.004, time * 0.0025);
    },
    dispose() {
      water.dispose();
    },
  };
}
