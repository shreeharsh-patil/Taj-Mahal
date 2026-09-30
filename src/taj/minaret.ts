/**
 * Minaret — local origin at the centre of its base on the plinth surface.
 *
 * Octagonal arcaded base (7.6 m) → 16-sided tapering shaft with two corbelled balconies →
 * third gallery carrying an eight-arch chhatri with onion dome and gilded finial.
 * Total height ≈ 41 m, matching the real monument.
 */
import * as THREE from 'three';
import { Builder, M, Opening, flatten, mul, panelWithOpenings, ringPolygon } from './geo';
import { addChhatri } from './parts';
import type { Materials } from './materials';

export const MINARET_LEAN = 0.012; // radians, outward (as on the real minarets)

function polyCyl(b: Builder, key: string, sides: number, r: number, h: number, y: number, m: THREE.Matrix4) {
  b.add(key, flatten(new THREE.CylinderGeometry(r, r, h, sides, 1)), mul(m, M.t(0, y, 0)), 'box');
}

function addBalcony(b: Builder, m: THREE.Matrix4, yB: number, rs: number) {
  // stepped corbels (muqarnas-like brackets) growing outward
  for (let i = 0; i < 3; i++) {
    const r = rs + 0.5 + 0.45 * i;
    polyCyl(b, 'marble', 16, r, 0.34, yB - 1.0 + 0.34 * i + 0.17, m);
  }
  // floor slab
  const rf = rs + 1.85;
  polyCyl(b, 'marble', 16, rf, 0.3, yB + 0.17, m);
  // arcaded parapet
  const sides = 16;
  const Ar = rf - 0.15;
  const w = 2 * Ar * Math.tan(Math.PI / sides);
  const rail: Opening = { cx: 0, y0: 0.22, halfW: w * 0.3, spring: 0.62, rise: 0.4 };
  const panel = panelWithOpenings(w, 1.15, [rail], 0.14);
  for (let k = 0; k < sides; k++) {
    const ang = ((k + 0.5) * Math.PI * 2) / sides;
    b.add('marble', panel, mul(m, M.t(0, yB + 0.32, 0), M.ry(ang), M.t(0, 0, Ar)), 'box');
  }
  const cap = ringPolygon(sides, (Ar + 0.12) / Math.cos(Math.PI / sides), (Ar - 0.16) / Math.cos(Math.PI / sides), 0.12);
  b.add('marble', cap, mul(m, M.t(0, yB + 0.32 + 1.15, 0)), 'box');
}

export function buildMinaret(mats: Materials): THREE.Group {
  const b = new Builder();
  const I = new THREE.Matrix4();

  /* ---- octagonal base ---- */
  const Ab = 5.2;
  const baseH = 7.6;
  const wb = 2 * Ab * Math.tan(Math.PI / 8);
  const ops: Opening[] = [
    { cx: 0, y0: 1.0, halfW: 1.2, spring: 3.5, rise: 1.6 }, // apex 5.1
    { cx: 0, y0: 5.6, halfW: 0.7, spring: 6.2, rise: 0.8 }, // apex 7.0 (< 7.6)
  ];
  const panel = panelWithOpenings(wb, baseH, ops, 0.5);
  for (let k = 0; k < 8; k++) {
    const ang = ((k + 0.5) * Math.PI * 2) / 8;
    b.add('marble', panel, mul(M.ry(ang), M.t(0, 0, Ab)), 'box');
  }
  const rv = (a: number) => a / Math.cos(Math.PI / 8);
  polyCyl(b, 'marble', 8, rv(Ab - 0.5), baseH, baseH / 2, I);
  polyCyl(b, 'marble', 8, rv(Ab + 0.38), 0.7, 0.35, I); // plinth moulding
  polyCyl(b, 'marble', 8, rv(Ab + 0.55), 0.7, baseH + 0.25, I); // cornice
  polyCyl(b, 'marble', 8, rv(4.3), 0.5, baseH + 0.85, I);

  /* ---- shaft ---- */
  const yS = baseH + 1.1;
  const yB1 = 16.5;
  const yB2 = 24.5;
  const yB3 = 31.5;
  const r0 = 3.1;
  const r1 = 2.6;
  const rAt = (y: number) => r0 + ((r1 - r0) * (y - yS)) / (yB3 - yS);
  const shaft = flatten(new THREE.CylinderGeometry(r1, r0, yB3 - yS, 16, 1));
  b.add('marble', shaft, M.t(0, (yS + yB3) / 2, 0), 'box');

  // black inlay bands beneath each gallery and at the foot
  for (const y of [yS + 0.5, yB1 - 1.8, yB1 - 2.1, yB2 - 1.8, yB2 - 2.1, yB3 - 1.8, yB3 - 2.1]) {
    const r = rAt(y) + 0.03;
    b.add('inlay', flatten(new THREE.CylinderGeometry(r, r, 0.14, 16, 1)), M.t(0, y, 0));
  }

  /* ---- balconies ---- */
  addBalcony(b, I, yB1, rAt(yB1));
  addBalcony(b, I, yB2, rAt(yB2));
  addBalcony(b, I, yB3, rAt(yB3));

  /* ---- crowning chhatri ---- */
  addChhatri(b, M.t(0, yB3 + 0.32, 0), {
    apothem: 2.2,
    baseH: 0,
    archH: 2.9,
    domeR: 2.6,
    domeH: 3.1,
  });

  const g = b.build(mats.byKey);
  g.name = 'minaret';
  return g;
}
