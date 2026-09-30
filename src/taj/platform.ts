/**
 * Terrace, marble plinth, stairs, flanking red-sandstone buildings (mosque & jawab)
 * and soft ambient-occlusion decals.
 *
 * World layout (metres, +z is toward the garden / the viewer, y up):
 *   garden level      y = 0
 *   sandstone terrace y = 3      (x ±150, z ±65)
 *   marble plinth     y = 3 … 10 (95 × 95)
 *   mausoleum sits on y = 10, minarets at the plinth corners
 */
import * as THREE from 'three';
import {
  Builder,
  M,
  Opening,
  lotusGeometry,
  mul,
  openingFill,
  openingOutline,
  panelWithOpenings,
  ribbon,
} from './geo';
import { addChhatri, addDome } from './parts';
import { buildMausoleum } from './mausoleum';
import { buildMinaret, MINARET_LEAN } from './minaret';
import type { Materials } from './materials';
import { makeRectAO } from './textures';

export const WORLD = {
  terraceY: 3,
  plinthH: 7,
  plinthHalf: 47.5,
  terraceHalfX: 150,
  terraceHalfZ: 65,
  minaretOffset: 41.8,
  flankX: 104,
};

/* ------------------------------------------------------------------ plinth */

function buildPlinth(mats: Materials): THREE.Group {
  const b = new Builder();
  const H = WORLD.plinthH;
  const half = WORLD.plinthHalf;

  b.add('marble', new THREE.BoxGeometry(98.4, 1.2, 98.4), M.t(0, 0.6, 0), 'box');
  b.add('marble', new THREE.BoxGeometry(94.2, H - 2.1, 94.2), M.t(0, 1.2 + (H - 2.1) / 2, 0), 'box');
  b.add('marble', new THREE.BoxGeometry(96.8, 0.9, 96.8), M.t(0, H - 0.45, 0), 'box');

  // blind arched panels around all four sides of the plinth
  const n = 15;
  const pw = (half * 2) / n;
  const op: Opening = { cx: 0, y0: 0.7, halfW: pw * 0.3, spring: 2.5, rise: 1.5 };
  const panel = panelWithOpenings(pw, H - 2.1, [op], 0.45);
  for (let side = 0; side < 4; side++) {
    const R = M.ry((side * Math.PI) / 2);
    for (let i = 0; i < n; i++) {
      const x = -half + pw * (i + 0.5);
      const F = mul(R, M.t(x, 1.2, half));
      b.add('marble', panel, F, 'box');
      b.add('inlay', ribbon(openingOutline(op, 0.22), 0.09), mul(F, M.t(0, 0, 0.03)));
    }
  }

  // black & white marble chequer on the plinth surface
  const checker = new THREE.PlaneGeometry(95.6, 95.6);
  checker.rotateX(-Math.PI / 2);
  b.add('decalChecker', checker, M.t(0, H + 0.02, 0), 'box');

  // central staircase (south side)
  const steps = 6;
  for (let j = 0; j < steps; j++) {
    const top = j + 1;
    const ext = (steps - j) * 1.5;
    b.add('marble', new THREE.BoxGeometry(17, top, ext + 0.3), M.t(0, top / 2, half + ext / 2 - 0.15), 'box');
  }
  // low cheek walls
  for (const s of [-1, 1]) {
    b.add('marble', new THREE.BoxGeometry(1.0, 2.2, steps * 1.5 + 0.3), M.t(s * 9, 1.1 + 0.55, half + (steps * 1.5) / 2), 'box');
  }

  const g = b.build(mats.byKey);
  g.name = 'plinth';
  return g;
}

/* ----------------------------------------------------------------- terrace */

function buildTerrace(mats: Materials): THREE.Group {
  const b = new Builder();
  const T = WORLD.terraceY;
  const hx = WORLD.terraceHalfX;
  const hz = WORLD.terraceHalfZ;
  const depth = 15; // down to river level at the back
  b.add('sand', new THREE.BoxGeometry(hx * 2, depth, hz * 2), M.t(0, T - depth / 2, 0), 'box');
  // edge coping band
  b.add('sand', new THREE.BoxGeometry(hx * 2 + 0.8, 0.6, hz * 2 + 0.8), M.t(0, T - 0.3, 0), 'box');
  // front steps down to the garden (central)
  for (let j = 0; j < 3; j++) {
    const top = j + 1;
    const ext = (3 - j) * 2.2;
    b.add('sand', new THREE.BoxGeometry(24, top, ext), M.t(0, top / 2, hz + ext / 2 - 0.2), 'box');
  }
  const g = b.build(mats.byKey);
  g.name = 'terrace';
  return g;
}

/* ------------------------------------------------- flanking mosque / jawab */

/** Red-sandstone hall with a white marble trim, three white domes and four corner kiosks. Facade faces +z. */
function buildFlank(mats: Materials): THREE.Group {
  const b = new Builder();
  const L = 56;
  const D = 23;
  const H = 15;
  const fz = D / 2;
  const t = 1.4;

  b.add('sand', new THREE.BoxGeometry(L + 2, 1.2, D + 2), M.t(0, 0.6, 0), 'box');
  b.add('sand', new THREE.BoxGeometry(L, H - 1.2, D - t), M.t(0, 1.2 + (H - 1.2) / 2, -t / 2), 'box');

  const ops: Opening[] = [{ cx: 0, y0: 1.0, halfW: 3.2, spring: 7.6, rise: 4.6 }];
  for (const cx of [-24, -16, -8, 8, 16, 24]) ops.push({ cx, y0: 1.0, halfW: 2.0, spring: 6.4, rise: 3.4 });
  const panel = panelWithOpenings(L, H - 1.2, ops, t);
  b.add('sand', panel, M.t(0, 1.2, fz), 'box');
  const F = M.t(0, 1.2, fz);
  for (const op of ops) {
    b.add('dark', openingFill(op), mul(F, M.t(0, 0, -t + 0.06)));
    b.add('marble', ribbon(openingOutline(op, 0.5), 0.42), mul(F, M.t(0, 0, 0.04)), 'box');
  }
  // plain red sides / back are boxes (already in the core). Marble cornice + parapet:
  b.add('marble', new THREE.BoxGeometry(L + 1.4, 0.8, D + 1.4), M.t(0, H + 0.0, 0), 'box');
  const roofY = H + 0.4;

  // three white domes on drums
  for (const [x, R, Hd] of [
    [-17, 4.4, 6.6],
    [0, 5.1, 7.8],
    [17, 4.4, 6.6],
  ] as [number, number, number][]) {
    const drumR = R * 0.9;
    b.add('marble', new THREE.CylinderGeometry(drumR, drumR * 1.02, 2.4, 32, 1), M.t(x, roofY + 1.2, -t / 2), 'box');
    b.add('marble', new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.35, 32, 1), M.t(x, roofY + 2.55, -t / 2), 'box');
    const yd = roofY + 2.7;
    b.add('marble', lotusGeometry(0.94 * R, 0.89 * R, 0.19 * R, 24, 0.3), M.t(x, yd - 0.04, -t / 2), 'box');
    addDome(b, M.t(x, yd, -t / 2), R, Hd, 48);
  }
  // corner kiosks
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addChhatri(b, M.t(sx * 25, roofY, sz * 8.2 - t / 2), {
        apothem: 1.5,
        baseH: 1.2,
        archH: 3.0,
        domeR: 2.1,
        domeH: 2.7,
      });
    }
  }
  const g = b.build(mats.byKey);
  g.name = 'flank';
  return g;
}

/* ---------------------------------------------------------- AO decal helper */

function aoDecal(tex: THREE.Texture, w: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    color: 0x000000,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.renderOrder = 0.5;
  return m;
}

/* --------------------------------------------------------------- assembly */

export interface MonumentResult {
  group: THREE.Group;
}

export function buildMonument(mats: Materials): MonumentResult {
  const group = new THREE.Group();
  group.name = 'monument';

  const terrace = buildTerrace(mats);
  group.add(terrace);

  const plinthGroup = new THREE.Group();
  plinthGroup.position.y = WORLD.terraceY;
  plinthGroup.add(buildPlinth(mats));
  const maus = buildMausoleum(mats);
  maus.position.y = WORLD.plinthH;
  plinthGroup.add(maus);

  // four minarets, leaning slightly outward like the originals
  const minaret = buildMinaret(mats);
  const o = WORLD.minaretOffset;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(sx * o, WORLD.plinthH, sz * o);
      const m = minaret.clone();
      const axis = new THREE.Vector3(sz, 0, -sx).normalize();
      m.quaternion.setFromAxisAngle(axis, MINARET_LEAN);
      holder.add(m);
      plinthGroup.add(holder);
    }
  }
  group.add(plinthGroup);

  // flanking buildings, facades turned toward the central axis
  const flank = buildFlank(mats);
  const left = flank.clone();
  left.position.set(-WORLD.flankX, WORLD.terraceY, 0);
  left.rotation.y = Math.PI / 2;
  const right = flank.clone();
  right.position.set(WORLD.flankX, WORLD.terraceY, 0);
  right.rotation.y = -Math.PI / 2;
  group.add(left, right);

  // contact shadows / ambient occlusion on the terrace
  const aoTex = makeRectAO(0.78);
  group.add(aoDecal(aoTex, 128, 128, 0, WORLD.terraceY + 0.03, 0));
  const aoFlank = makeRectAO(0.62);
  group.add(aoDecal(aoFlank, 48, 90, -WORLD.flankX, WORLD.terraceY + 0.03, 0));
  group.add(aoDecal(aoFlank, 48, 90, WORLD.flankX, WORLD.terraceY + 0.03, 0));

  return { group };
}
