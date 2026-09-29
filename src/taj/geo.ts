/**
 * Geometry toolkit used to construct the Taj Mahal procedurally:
 *  - Builder: collects geometry per material key, bakes transforms + world-space UVs, merges to few draw calls
 *  - Pointed (Persian) arch outlines, extruded facade panels with recessed openings
 *  - Inlay ribbons, spandrel decals
 *  - Onion dome lathe profile, lotus-petal rings, gilded finial
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ matrices */

export const M = {
  t: (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z),
  ry: (a: number) => new THREE.Matrix4().makeRotationY(a),
  rx: (a: number) => new THREE.Matrix4().makeRotationX(a),
  s: (x: number, y: number, z: number) => new THREE.Matrix4().makeScale(x, y, z),
};
/** Multiply matrices left-to-right (first = outermost). */
export function mul(...ms: THREE.Matrix4[]): THREE.Matrix4 {
  const r = new THREE.Matrix4();
  for (const m of ms) r.multiply(m);
  return r;
}

/* ------------------------------------------------------------------- Builder */

type UVMode = 'box' | 'keep';

/** Project world-space box UVs (continuous across planar faces at any yaw). */
function boxProject(g: THREE.BufferGeometry, tile: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  let uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    g.setAttribute('uv', uv);
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const horizontal = Math.abs(n.y) > 0.6;
    const hl = Math.hypot(n.x, n.z) || 1;
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      if (horizontal) uv.setXY(i + k, p.x / tile, p.z / tile);
      else uv.setXY(i + k, (-n.z * p.x + n.x * p.z) / hl / tile, p.y / tile);
    }
  }
  uv.needsUpdate = true;
}

export class Builder {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  tile = 8;

  add(key: string, geom: THREE.BufferGeometry, matrix?: THREE.Matrix4, uv: UVMode = 'keep') {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (matrix) g.applyMatrix4(matrix);
    if (uv === 'box') boxProject(g, this.tile);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key)!.push(g);
  }

  /** Merge each material bucket into one mesh. Keys starting with "decal" never cast shadows. */
  build(materials: Record<string, THREE.Material>, receive = true): THREE.Group {
    const group = new THREE.Group();
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mat = materials[key];
      if (!mat) throw new Error(`Builder: no material for key "${key}"`);
      const mesh = new THREE.Mesh(merged, mat);
      const isDecal = key.startsWith('decal');
      mesh.castShadow = !isDecal;
      mesh.receiveShadow = receive;
      if (isDecal) mesh.renderOrder = 1;
      mesh.name = key;
      group.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
    return group;
  }
}

/* ----------------------------------------------------------- shading helpers */

export function flatten(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

/* --------------------------------------------------------------------- arches */

export interface Opening {
  cx: number;
  y0: number; // sill height (ignored when open)
  halfW: number;
  spring: number; // height where the arch begins
  rise: number; // arch rise above spring
  open?: boolean; // open to the floor (iwan / doorway)
}

/**
 * Pointed (two-centred) arch from left springing point to right springing point.
 * Returns 2*seg+1 points.
 */
export function archPoints(cx: number, halfW: number, spring: number, rise: number, seg = 16): THREE.Vector2[] {
  const R = (halfW * halfW + rise * rise) / (2 * halfW);
  const cLx = cx - halfW + R;
  const aEnd = Math.atan2(rise, cx - cLx);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI + (aEnd - Math.PI) * (i / seg);
    pts.push(new THREE.Vector2(cLx + R * Math.cos(a), spring + R * Math.sin(a)));
  }
  for (let i = seg - 1; i >= 0; i--) pts.push(new THREE.Vector2(2 * cx - pts[i].x, pts[i].y));
  return pts;
}

export function openingPolyline(op: Opening, grow = 0, seg = 16): THREE.Vector2[] {
  const yb = op.open ? 0 : op.y0 - grow;
  const hw = op.halfW + grow;
  const arch = archPoints(op.cx, hw, op.spring, op.rise + grow * 0.9, seg);
  return [new THREE.Vector2(op.cx - hw, yb), ...arch, new THREE.Vector2(op.cx + hw, yb)];
}

/**
 * Extruded facade panel (width x height) with arched openings cut through it.
 * Front face lies on z=0; the panel extends back to z=-depth. x centred, y from 0.
 */
export function panelWithOpenings(width: number, height: number, ops: Opening[], depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  const open = ops.find((o) => o.open);
  if (open) for (const p of openingPolyline(open)) shape.lineTo(p.x, p.y);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, height);
  shape.lineTo(-hw, height);
  shape.closePath();
  for (const op of ops) {
    if (op.open) continue;
    shape.holes.push(new THREE.Path(openingPolyline(op)));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth);
  return g;
}

/** Flat polygon filling an opening (dark interiors / jali screens). UV = metric xy. */
export function openingFill(op: Opening, grow = 0): THREE.BufferGeometry {
  return new THREE.ShapeGeometry(new THREE.Shape(openingPolyline(op, grow)));
}

/** Polygon between an arch and the rectangular frame that surrounds it (spandrels). */
export function spandrelGeometry(op: Opening, margin: number, topY: number): THREE.BufferGeometry {
  const L = op.cx - op.halfW - margin;
  const Rr = op.cx + op.halfW + margin;
  const arch = archPoints(op.cx, op.halfW, op.spring, op.rise, 14);
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(L, op.spring),
    new THREE.Vector2(L, topY),
    new THREE.Vector2(Rr, topY),
    new THREE.Vector2(Rr, op.spring),
    new THREE.Vector2(op.cx + op.halfW, op.spring),
  ];
  for (let i = arch.length - 1; i >= 0; i--) pts.push(arch[i]);
  pts.push(new THREE.Vector2(op.cx - op.halfW, op.spring));
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}

/** Thin ribbon (inlay line) following a polyline in the XY plane, facing +z. */
export function ribbon(points: THREE.Vector2[], width: number, closed = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const count = closed ? points.length : points.length - 1;
  const hw = width / 2;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = new THREE.Vector2().subVectors(b, a);
    const len = d.length();
    if (len < 1e-5) continue;
    d.divideScalar(len);
    const nx = -d.y * hw;
    const ny = d.x * hw;
    const ax = a.x - d.x * hw;
    const ay = a.y - d.y * hw;
    const bx = b.x + d.x * hw;
    const by = b.y + d.y * hw;
    const quad = [
      [ax - nx, ay - ny],
      [bx - nx, by - ny],
      [bx + nx, by + ny],
      [ax - nx, ay - ny],
      [bx + nx, by + ny],
      [ax + nx, ay + ny],
    ];
    for (const q of quad) {
      pos.push(q[0], q[1], 0);
      nrm.push(0, 0, 1);
      uvs.push(0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

/** Outline of an opening grown by `grow` (for inlay frames). */
export function openingOutline(op: Opening, grow: number): THREE.Vector2[] {
  const pts = openingPolyline(op, grow);
  if (op.open) pts[0].y = 0.2, (pts[pts.length - 1].y = 0.2);
  return pts;
}

/** Rectangular quad in XY with UVs mapped for a calligraphy strip. */
export function stripQuad(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  vertical: boolean,
  texAspect: number
): THREE.BufferGeometry {
  const w = x1 - x0;
  const h = y1 - y0;
  const g = new THREE.PlaneGeometry(w, h);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const bandW = vertical ? w : h; // thickness of the band
  const len = vertical ? h : w;
  const reps = len / (bandW * texAspect);
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (vertical) uv.setXY(i, v * reps, 1 - u); // text runs along y
    else uv.setXY(i, u * reps, v);
  }
  return g;
}

/* ------------------------------------------------------------------ polygons */

/** Regular n-gon ring/prism (vertices at x=r*sin(a), z=r*cos(a) like CylinderGeometry). y from 0..height */
export function ringPolygon(sides: number, rOuter: number, rInner: number, height: number): THREE.BufferGeometry {
  const poly = (r: number) => {
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      pts.push(new THREE.Vector2(r * Math.sin(a), -r * Math.cos(a)));
    }
    return pts;
  };
  const shape = new THREE.Shape(poly(rOuter));
  if (rInner > 0) shape.holes.push(new THREE.Path(poly(rInner)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Octagon-with-chamfers outline used by the mausoleum: apothem a, chamfer leg c, offset o. */
export function chamferedSquare(half: number, chamfer: number, o: number): THREE.Vector2[] {
  const h = half + o;
  const k = half - chamfer + o * (Math.SQRT2 - 1);
  return [
    new THREE.Vector2(-k, h),
    new THREE.Vector2(k, h),
    new THREE.Vector2(h, k),
    new THREE.Vector2(h, -k),
    new THREE.Vector2(k, -h),
    new THREE.Vector2(-k, -h),
    new THREE.Vector2(-h, -k),
    new THREE.Vector2(-h, k),
  ];
}

/** Extrude a footprint given in world x,z into a prism standing on y=0 with the given height. */
export function prismFromFootprint(pts: { x: number; z: number }[], height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/* -------------------------------------------------------------- onion dome */

/**
 * Normalised onion-dome profile (radius 1 = widest point): narrow neck, flaring shoulder,
 * bulbous belly, then an ogee taper into a pointed crown. Piecewise cubic Béziers with
 * G1 continuity at the joins.
 */
export function onionProfile(R: number, H: number, perSegment = 22): THREE.Vector2[] {
  const P = (r: number, y: number) => new THREE.Vector2(r, y);
  const segs = [
    new THREE.CubicBezierCurve(P(0.72, 0), P(0.78, 0.066), P(1.035, 0.124), P(1.0, 0.33)),
    new THREE.CubicBezierCurve(P(1.0, 0.33), P(0.965, 0.537), P(0.44, 0.66), P(0.21, 0.847)),
    new THREE.CubicBezierCurve(P(0.21, 0.847), P(0.13, 0.909), P(0.105, 0.95), P(0.075, 1.0)),
  ];
  const pts: THREE.Vector2[] = [];
  segs.forEach((c, i) => {
    const p = c.getPoints(perSegment);
    if (i > 0) p.shift();
    pts.push(...p);
  });
  const out = pts.map((p) => new THREE.Vector2(p.x * R, p.y * H));
  out.push(new THREE.Vector2(0.01, H + 0.01 * H));
  return out;
}

export function domeGeometry(R: number, H: number, radial = 64, tile = 8): THREE.BufferGeometry {
  // fewer profile samples for small domes keeps hundreds of tiny cupolas cheap
  const prof = onionProfile(R, H, radial >= 48 ? 22 : radial >= 28 ? 12 : 6);
  const g = new THREE.LatheGeometry(prof, radial);
  let len = 0;
  for (let i = 1; i < prof.length; i++) len += prof[i].distanceTo(prof[i - 1]);
  const uScale = Math.max(1, Math.round((2 * Math.PI * R) / tile));
  const vScale = len / tile;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  return g;
}

/* ------------------------------------------------------------------- lotus */

/**
 * Ring of lotus petals. Each petal is a pointed, slightly ridged leaf, leaning from
 * radius rBase (at y=0) to rTop (at the petal tip, y=height).
 */
export function lotusGeometry(
  rBase: number,
  rTop: number,
  height: number,
  count: number,
  ridge = 0.25,
  tile = 8
): THREE.BufferGeometry {
  const nA = 8;
  const nT = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const half = Math.PI / count;
  for (let i = 0; i < count; i++) {
    const center = (i / count) * Math.PI * 2;
    const base = pos.length / 3;
    for (let ja = 0; ja <= nA; ja++) {
      const a = (ja / nA) * 2 - 1;
      const yTop = height * (1 - 0.62 * Math.pow(Math.abs(a), 1.6));
      for (let jt = 0; jt <= nT; jt++) {
        const t = jt / nT;
        const y = t * yTop;
        const rr = rBase + (rTop - rBase) * (y / height) + ridge * (1 - Math.abs(a)) * Math.sin(Math.PI * Math.min(1, t * 0.95)) * (height * 0.28);
        const ang = center + a * half;
        pos.push(rr * Math.sin(ang), y, rr * Math.cos(ang));
        uv.push((rr * Math.sin(ang)) / tile, (rr * Math.cos(ang) + y) / tile);
      }
    }
    for (let ja = 0; ja < nA; ja++) {
      for (let jt = 0; jt < nT; jt++) {
        const v00 = base + ja * (nT + 1) + jt;
        const v10 = base + (ja + 1) * (nT + 1) + jt;
        const v11 = v10 + 1;
        const v01 = v00 + 1;
        idx.push(v00, v10, v11, v00, v11, v01);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ finial */

/**
 * Gilded finial: lotus-bud vase, three graduated spheres, crescent moon with the horns
 * pointing skyward and the spire passing between them. Local y=0 at the base; height ≈ 8*s.
 */
export function finialGeometries(s: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const low = s < 0.2; // tiny finials need far fewer facets
  const prof: [number, number][] = [
    [0.01, 0],
    [0.9, 0],
    [0.96, 0.12],
    [0.72, 0.3],
    [0.7, 0.46],
    [1.05, 0.82],
    [1.32, 1.25],
    [1.32, 1.7],
    [1.05, 2.1],
    [0.62, 2.4],
    [0.5, 2.62],
  ];
  out.push(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s)), low ? 8 : 24));
  for (const [y, r] of [
    [3.05, 0.62],
    [3.9, 0.48],
    [4.6, 0.36],
  ]) {
    const sp = new THREE.SphereGeometry(r * s, low ? 7 : 16, low ? 5 : 10);
    sp.translate(0, y * s, 0);
    out.push(sp);
  }
  const pole = new THREE.CylinderGeometry(0.13 * s, 0.17 * s, 7.6 * s, low ? 4 : 8);
  pole.translate(0, 3.8 * s, 0);
  out.push(pole);
  const arc = 5.4;
  const crescent = new THREE.TorusGeometry(0.95 * s, 0.13 * s, low ? 4 : 8, low ? 10 : 28, arc);
  crescent.rotateZ(-Math.PI / 2 - arc / 2);
  crescent.translate(0, 6.0 * s, 0);
  out.push(crescent);
  const tip = new THREE.SphereGeometry(0.17 * s, low ? 5 : 10, low ? 4 : 8);
  tip.translate(0, 7.7 * s, 0);
  out.push(tip);
  return out;
}
