/**
 * The mausoleum (tomb chamber) — local origin at the centre of the plinth surface.
 * +z is the south/front façade facing the garden.
 *
 * Proportions follow the real monument (metres):
 *  - 56 m square with 8.5 m chamfered corners, body height 30 m
 *  - central pishtaq (iwan) 19 m wide x 33.5 m high with a 11 m wide pointed arch
 *  - two-storey arched niches on the wings and on the four chamfered corners
 *  - drum + 20 m high onion dome (≈19 m wide), lotus collar, gilded finial
 *  - four chhatri kiosks around the dome
 */
import * as THREE from 'three';
import {
  Builder,
  M,
  Opening,
  chamferedSquare,
  openingFill,
  openingOutline,
  panelWithOpenings,
  prismFromFootprint,
  ribbon,
  spandrelGeometry,
  stripQuad,
  flatten,
  lotusGeometry,
  mul,
} from './geo';
import { addChhatri, addDome, addGuldasta } from './parts';
import type { Materials } from './materials';

export const MAUS = {
  half: 28,
  chamfer: 8.5,
  bodyH: 30,
  pishW: 19,
  pishH: 33.5,
  pishProj: 1.2,
  pishDepth: 10.2,
  recess: 3,
  drumBaseY: 30.05,
  domeBaseY: 37.55,
  domeR: 9.6,
  domeH: 20,
  totalH: 67,
};

const CALLI_ASPECT = 2048 / 160;

function rectGeo(x0: number, y0: number, x1: number, y1: number) {
  return new THREE.ShapeGeometry(
    new THREE.Shape([
      new THREE.Vector2(x0, y0),
      new THREE.Vector2(x1, y0),
      new THREE.Vector2(x1, y1),
      new THREE.Vector2(x0, y1),
    ])
  );
}
const V = (x: number, y: number) => new THREE.Vector2(x, y);

/** Two-storey niche pair used on the wings and chamfered corners. */
function nicheOps(halfW: number): Opening[] {
  return [
    { cx: 0, y0: 2.6, halfW, spring: 9.6, rise: 5 },
    { cx: 0, y0: 16.6, halfW, spring: 22.6, rise: 4.9 },
  ];
}

/** Black inlay outline + rectangular frame + floral spandrels around a niche. */
function decorateNiche(b: Builder, F: THREE.Matrix4, op: Opening) {
  const apex = op.spring + op.rise;
  const inlayM = mul(F, M.t(0, 0, 0.035));
  const decalM = mul(F, M.t(0, 0, 0.02));
  b.add('inlay', ribbon(openingOutline(op, 0.32), 0.14), inlayM);
  const x0 = op.cx - op.halfW - 1.0;
  const x1 = op.cx + op.halfW + 1.0;
  const y0 = op.y0 - 1.0;
  const y1 = apex + 1.0;
  b.add('inlay', ribbon([V(x0, y0), V(x0, y1), V(x1, y1), V(x1, y0), V(x0, y0)], 0.13), inlayM);
  b.add('decalFloral', spandrelGeometry(op, 0.95, apex + 0.9), decalM);
  // small floral jambs either side of the lower part of the niche
  b.add('decalFloral', rectGeo(op.cx - op.halfW - 0.85, op.y0, op.cx - op.halfW - 0.45, op.spring), decalM);
  b.add('decalFloral', rectGeo(op.cx + op.halfW + 0.45, op.y0, op.cx + op.halfW + 0.85, op.spring), decalM);
}

/** Pishtaq decoration on the front plane (local frame: front face z=0, origin at the base centre). */
function decoratePishtaq(b: Builder, P: THREE.Matrix4, iwan: Opening) {
  const apex = iwan.spring + iwan.rise; // 28
  const dec = mul(P, M.t(0, 0, 0.02));
  const ink = mul(P, M.t(0, 0, 0.04));

  // inner inlay following the arch
  b.add('inlay', ribbon(openingOutline(iwan, 0.3), 0.14), ink);

  // calligraphy frame (inverted U): two verticals + the top band
  const bx0 = iwan.halfW + 0.5; // 6.0
  const bx1 = bx0 + 1.4; // 7.4
  b.add('decalCalli', stripQuad(-bx1, 0.3, -bx0, apex + 0.5, true, CALLI_ASPECT), dec);
  b.add('decalCalli', stripQuad(bx0, 0.3, bx1, apex + 0.5, true, CALLI_ASPECT), dec);
  b.add('decalCalli', stripQuad(-bx1, apex + 0.5, bx1, apex + 1.9, false, CALLI_ASPECT), dec);

  // black borders of the calligraphy frame
  b.add('inlay', ribbon([V(-bx1 - 0.15, 0.2), V(-bx1 - 0.15, apex + 2.05), V(bx1 + 0.15, apex + 2.05), V(bx1 + 0.15, 0.2)], 0.15), ink);
  b.add('inlay', ribbon([V(-bx0, 0.2), V(-bx0, apex + 0.5), V(bx0, apex + 0.5), V(bx0, 0.2)], 0.1), ink);

  // floral spandrels between arch and frame
  b.add('decalFloral', spandrelGeometry(iwan, 0.5, apex + 0.5), dec);

  // floral pier strips outside the calligraphy frame
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 7.9 : -9.1;
    const x1 = s > 0 ? 9.1 : -7.9;
    b.add('decalFloral', rectGeo(x0, 0.4, x1, 31.0), dec);
    b.add('inlay', ribbon([V(x0 - 0.06, 0.3), V(x0 - 0.06, 31.1), V(x1 + 0.06, 31.1), V(x1 + 0.06, 0.3), V(x0 - 0.06, 0.3)], 0.1), ink);
  }
  // upper floral frieze under the cornice
  b.add('decalFloral', rectGeo(-8.7, 30.9, 8.7, 32.7), dec);
  b.add('inlay', ribbon([V(-8.8, 30.8), V(-8.8, 32.8), V(8.8, 32.8), V(8.8, 30.8), V(-8.8, 30.8)], 0.1), ink);
  b.add('inlay', ribbon([V(-7.6, 30.05), V(7.6, 30.05)], 0.12), ink);
}

/** Back wall of the iwan: two-tier arched openings, dark doorway, jali windows, calligraphy band. */
function buildIwanBack(b: Builder, B: THREE.Matrix4) {
  // B: origin on the iwan back plane (z = recess floor), +z toward viewer
  const door: Opening = { cx: 0, y0: 0, halfW: 1.9, spring: 5.8, rise: 3.2, open: true };
  const lowNiche = (cx: number): Opening => ({ cx, y0: 1.0, halfW: 1.0, spring: 5.6, rise: 2.4 });
  const upWin: Opening = { cx: 0, y0: 11.5, halfW: 1.9, spring: 16, rise: 3.2 };
  const upNiche = (cx: number): Opening => ({ cx, y0: 11.5, halfW: 1.0, spring: 15.6, rise: 2.4 });
  const ops = [door, lowNiche(-3.9), lowNiche(3.9), upWin, upNiche(-3.9), upNiche(3.9)];
  const panel = panelWithOpenings(11, 26, ops, 1.0);
  b.add('marble', panel, mul(B, M.t(0, 0, 1.0)), 'box');

  // interior fills
  b.add('dark', openingFill(door), mul(B, M.t(0, 0, 0.15)));
  for (const cx of [-3.9, 3.9]) b.add('dark', openingFill(lowNiche(cx)), mul(B, M.t(0, 0, 0.15)));
  b.add('jali', openingFill(upWin), mul(B, M.t(0, 0, 0.15)));
  for (const cx of [-3.9, 3.9]) b.add('jali', openingFill(upNiche(cx)), mul(B, M.t(0, 0, 0.15)));

  const front = mul(B, M.t(0, 0, 1.0));
  b.add('inlay', ribbon(openingOutline(door, 0.32), 0.14), mul(front, M.t(0, 0, 0.035)));
  b.add('inlay', ribbon(openingOutline(upWin, 0.32), 0.14), mul(front, M.t(0, 0, 0.035)));
  b.add('decalCalli', stripQuad(-4.9, 9.3, 4.9, 10.5, false, CALLI_ASPECT), mul(front, M.t(0, 0, 0.02)));
  b.add('inlay', ribbon([V(-5.0, 9.2), V(5.0, 9.2)], 0.1), mul(front, M.t(0, 0, 0.035)));
  b.add('inlay', ribbon([V(-5.0, 10.6), V(5.0, 10.6)], 0.1), mul(front, M.t(0, 0, 0.035)));
  b.add('decalFloral', spandrelGeometry(door, 0.9, 9.6), mul(front, M.t(0, 0, 0.02)));
  b.add('decalFloral', spandrelGeometry(upWin, 0.9, 19.7), mul(front, M.t(0, 0, 0.02)));
}

export function buildMausoleum(mats: Materials): THREE.Group {
  const b = new Builder();
  b.tile = 8;
  const A = MAUS.half;
  const C = MAUS.chamfer;

  /* ---------------- core body with a notch behind each pishtaq ---------------- */
  {
    const h = A - MAUS.recess; // 25
    const kk = A - C - MAUS.recess * (Math.SQRT2 - 1); // 18.26
    const notchHalf = 5.4;
    const notchBack = A - 9; // iwan back wall plane (z = 19)
    const front: [number, number][] = [
      [-kk, h],
      [-notchHalf, h],
      [-notchHalf, notchBack],
      [notchHalf, notchBack],
      [notchHalf, h],
      [kk, h],
    ];
    const pts: { x: number; z: number }[] = [];
    for (let k = 0; k < 4; k++) {
      for (const [x0, z0] of front) {
        let x = x0;
        let z = z0;
        for (let r = 0; r < k; r++) {
          const nx = z;
          const nz = -x;
          x = nx;
          z = nz;
        }
        pts.push({ x, z });
      }
    }
    b.add('marble', prismFromFootprint(pts, MAUS.bodyH), undefined, 'box');
  }

  /* ---------------- façade panels ---------------- */
  const wingW = (MAUS.pishW > 0 ? (2 * (A - C) - MAUS.pishW) / 2 : 10);
  const wingCx = MAUS.pishW / 2 + wingW / 2;
  const wingPanel = panelWithOpenings(wingW, MAUS.bodyH, nicheOps(3), MAUS.recess);
  const chamferW = C * Math.SQRT2;
  const chamferPanel = panelWithOpenings(chamferW, MAUS.bodyH, nicheOps(3.4), MAUS.recess);
  const iwan: Opening = { cx: 0, y0: 0, halfW: 5.5, spring: 18, rise: 10, open: true };
  const pishPanel = panelWithOpenings(MAUS.pishW, MAUS.pishH, [iwan], MAUS.pishDepth);
  const chamferDist = (A + (A - C)) / Math.SQRT2;

  for (let k = 0; k < 4; k++) {
    const theta = (k * Math.PI) / 2;
    const R = M.ry(theta);

    // wings
    for (const s of [-1, 1]) {
      const F = mul(R, M.t(s * wingCx, 0, A));
      b.add('marble', wingPanel, F, 'box');
      for (const op of nicheOps(3)) decorateNiche(b, F, op);
    }

    // pishtaq (projecting)
    const P = mul(R, M.t(0, 0, A + MAUS.pishProj));
    b.add('marble', pishPanel, P, 'box');
    decoratePishtaq(b, P, iwan);
    // cornice slab and guldastas on top of the pishtaq
    b.add(
      'marble',
      new THREE.BoxGeometry(MAUS.pishW + 1.4, 0.8, MAUS.pishDepth + 0.6),
      mul(R, M.t(0, MAUS.pishH + 0.4, A + MAUS.pishProj - (MAUS.pishDepth - 0.6) / 2 + 0.0)),
      'box'
    );
    for (const s of [-1, 1]) {
      addGuldasta(b, mul(R, M.t(s * 8.7, MAUS.pishH + 0.8, A + MAUS.pishProj - 1.0)), 4.6, 0.36);
    }
    // iwan back wall
    buildIwanBack(b, mul(R, M.t(0, 0, A - 9)));

    // chamfered corner (between this face and the next)
    const ct = theta + Math.PI / 4;
    const CF = mul(M.ry(ct), M.t(0, 0, chamferDist));
    b.add('marble', chamferPanel, CF, 'box');
    for (const op of nicheOps(3.4)) decorateNiche(b, CF, op);
  }

  /* ---------------- roofline: cornice, parapet, pinnacles ---------------- */
  {
    const outline = chamferedSquare(A, C, 0.6).map((p) => ({ x: p.x, z: p.y }));
    b.add('marble', prismFromFootprint(outline, 0.7), M.t(0, MAUS.bodyH - 0.65, 0), 'box');

    const o = chamferedSquare(A, C, 0.35).map((p) => new THREE.Vector2(p.x, -p.y));
    const i = chamferedSquare(A, C, -0.35).map((p) => new THREE.Vector2(p.x, -p.y));
    const shape = new THREE.Shape(o);
    shape.holes.push(new THREE.Path(i));
    const par = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false });
    par.rotateX(-Math.PI / 2);
    b.add('marble', par, M.t(0, MAUS.bodyH + 0.05, 0), 'box');

    // pinnacles at the octagon vertices, chamfer midpoints and wing midpoints
    const oct = chamferedSquare(A, C, 0).map((p) => ({ x: p.x, z: p.y }));
    const spots: { x: number; z: number }[] = [];
    for (let n = 0; n < oct.length; n++) {
      const a = oct[n];
      const c = oct[(n + 1) % oct.length];
      spots.push(a);
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      if (len < 15) spots.push({ x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 }); // chamfer faces
    }
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        const x = s * wingCx;
        const ang = (k * Math.PI) / 2;
        const sx = x * Math.cos(ang) + A * Math.sin(ang);
        const sz = -x * Math.sin(ang) + A * Math.cos(ang);
        spots.push({ x: sx, z: sz });
      }
    }
    for (const sp of spots) addGuldasta(b, M.t(sp.x, MAUS.bodyH + 0.05 + 1.3, sp.z), 1.9, 0.26);
  }

  /* ---------------- drum, lotus collar, dome, finial ---------------- */
  {
    const y0 = MAUS.drumBaseY;
    // stepped base ring
    b.add('marble', new THREE.CylinderGeometry(10.1, 10.3, 1.2, 48, 1), M.t(0, y0 + 0.6, 0), 'box');
    const drumY = y0 + 1.2;
    const Ad = 8.6;
    const drumH = 5.6;
    const sides = 16;
    const w = 2 * Ad * Math.tan(Math.PI / sides);
    const dop: Opening = { cx: 0, y0: 0.9, halfW: 1.1, spring: 3.6, rise: 1.7 };
    const dpanel = panelWithOpenings(w, drumH, [dop], 0.6);
    for (let k = 0; k < sides; k++) {
      const ang = ((k + 0.5) * Math.PI * 2) / sides;
      const F = mul(M.t(0, drumY, 0), M.ry(ang), M.t(0, 0, Ad));
      b.add('marble', dpanel, F, 'box');
      b.add('inlay', ribbon(openingOutline(dop, 0.25), 0.1), mul(F, M.t(0, 0, 0.03)));
    }
    const coreR = (Ad - 0.6) / Math.cos(Math.PI / sides);
    b.add('marble', flatten(new THREE.CylinderGeometry(coreR, coreR, drumH, sides, 1)), M.t(0, drumY + drumH / 2, 0), 'box');
    const topY = drumY + drumH;
    b.add('marble', new THREE.CylinderGeometry(9.1, 9.1, 0.4, 48, 1), M.t(0, topY + 0.2, 0), 'box');
    b.add('marble', new THREE.CylinderGeometry(9.5, 9.5, 0.3, 48, 1), M.t(0, topY + 0.55, 0), 'box');

    // lotus-petal collar hugging the dome's neck, then the dome itself
    b.add('marble', lotusGeometry(9.0, 8.55, 1.9, 32, 0.35), M.t(0, MAUS.domeBaseY - 0.05, 0), 'box');
    addDome(b, M.t(0, MAUS.domeBaseY, 0), MAUS.domeR, MAUS.domeH, 80);
  }

  /* ---------------- four chhatris around the dome ---------------- */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addChhatri(b, M.t(sx * 14.5, MAUS.bodyH + 0.05, sz * 14.5), {
        apothem: 3.1,
        baseH: 1.8,
        archH: 4.3,
        domeR: 3.9,
        domeH: 4.8,
      });
    }
  }

  const group = b.build(mats.byKey);
  group.name = 'mausoleum';
  return group;
}
