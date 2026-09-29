/**
 * Reusable architectural parts: domes with lotus + finial, chhatri kiosks, guldasta pinnacles.
 * Every function appends to a Builder using a parent matrix `m` (origin = base centre, y up).
 */
import * as THREE from 'three';
import {
  Builder,
  M,
  domeGeometry,
  finialGeometries,
  flatten,
  lotusGeometry,
  mul,
  panelWithOpenings,
} from './geo';

/** Lotus-petal collar under a gilded finial. `s` is the finial scale (≈ 0.1 × dome radius). */
export function addFinial(b: Builder, m: THREE.Matrix4, s: number) {
  b.add('marble', lotusGeometry(0.75 * s, 1.35 * s, 1.6 * s, 14, 0.2), m, 'box');
  const fm = mul(m, M.t(0, 1.1 * s, 0));
  for (const g of finialGeometries(s)) b.add('gold', g, fm);
}

/** Onion dome + lotus collar + finial. */
export function addDome(b: Builder, m: THREE.Matrix4, R: number, H: number, radial = 48) {
  b.add('marble', domeGeometry(R, H, radial), m);
  addFinial(b, mul(m, M.t(0, H, 0)), 0.1 * R);
}

export interface ChhatriParams {
  apothem: number;
  baseH: number;
  archH: number;
  domeR: number;
  domeH: number;
  baseKey?: string;
}

/**
 * Octagonal open kiosk: plinth, eight pointed-arch openings between slender piers,
 * entablature, onion dome with lotus collar, gilded finial.
 * Returns the total height.
 */
export function addChhatri(b: Builder, m: THREE.Matrix4, p: ChhatriParams): number {
  const a = p.apothem;
  const rv = (ap: number) => ap / Math.cos(Math.PI / 8);
  const baseKey = p.baseKey ?? 'marble';
  const cyl8 = (r: number, h: number, y: number, key: string) =>
    b.add(key, flatten(new THREE.CylinderGeometry(rv(r), rv(r), h, 8, 1)), mul(m, M.t(0, y, 0)), 'box');

  if (p.baseH > 0) {
    cyl8(a + 0.55, 0.4, 0.2, baseKey);
    cyl8(a + 0.28, p.baseH - 0.8, 0.4 + (p.baseH - 0.8) / 2, baseKey);
    cyl8(a + 0.6, 0.4, p.baseH - 0.2, baseKey);
  }

  // Arcade of eight arched panels
  const w = 2 * a * Math.tan(Math.PI / 8);
  const op = { cx: 0, y0: 0, halfW: w * 0.33, spring: p.archH * 0.58, rise: p.archH * 0.3, open: true };
  const panel = panelWithOpenings(w, p.archH, [op], 0.34);
  for (let k = 0; k < 8; k++) {
    const ang = ((k + 0.5) * Math.PI * 2) / 8;
    b.add('marble', panel, mul(m, M.t(0, p.baseH, 0), M.ry(ang), M.t(0, 0, a)), 'box');
  }
  const yTop = p.baseH + p.archH;
  // ceiling under the dome (so the kiosk reads as a hollow pavilion)
  cyl8(a - 0.05, 0.12, yTop - 0.06, 'marble');
  // entablature and slab
  cyl8(a + 0.35, 0.6, yTop + 0.3, 'marble');
  cyl8(a + 0.7, 0.28, yTop + 0.74, 'marble');
  const yDome = yTop + 0.88;

  b.add('marble', lotusGeometry(0.72 * p.domeR + 0.75, 0.72 * p.domeR + 0.05, 0.6, 12, 0.15), mul(m, M.t(0, yDome - 0.05, 0)), 'box');
  addDome(b, mul(m, M.t(0, yDome, 0)), p.domeR, p.domeH, 32);
  const finialH = 9.2 * 0.1 * p.domeR;
  return yDome + p.domeH + finialH;
}

/** Slender octagonal pinnacle ("guldasta") crowned by a tiny domed cupola and gilded finial. */
export function addGuldasta(b: Builder, m: THREE.Matrix4, h: number, r = 0.34) {
  const oct = (rad: number, hh: number, y: number) =>
    b.add('marble', flatten(new THREE.CylinderGeometry(rad / Math.cos(Math.PI / 8), rad / Math.cos(Math.PI / 8), hh, 8, 1)), mul(m, M.t(0, y, 0)), 'box');
  oct(r * 1.9, 0.5, 0.25);
  const shaft = flatten(new THREE.CylinderGeometry((r * 0.92) / Math.cos(Math.PI / 8), (r * 1.05) / Math.cos(Math.PI / 8), h, 8, 1));
  b.add('marble', shaft, mul(m, M.t(0, 0.5 + h / 2, 0)), 'box');
  oct(r * 1.55, 0.22, 0.5 + h);
  oct(r * 1.85, 0.18, 0.5 + h + 0.2);
  addDome(b, mul(m, M.t(0, 0.5 + h + 0.28, 0)), r * 1.85, r * 3.3, 20);
}
