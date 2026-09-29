/**
 * Procedural texture library.
 *
 * Every texture used by the experience is generated at load time on a canvas so the
 * project stays a single self-contained bundle (no missing assets, no CORS issues).
 * All "natural" textures are tileable (periodic noise) so they can repeat over large areas.
 */
import * as THREE from 'three';

/* ----------------------------------------------------------------------------
 * Deterministic random + tileable value noise
 * -------------------------------------------------------------------------- */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1103515245)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fractal noise. x,y are in [0,1) tile space. */
export function fbm(x: number, y: number, period: number, octaves: number, seed: number): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * p, y * p, p, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function toTexture(
  source: HTMLCanvasElement,
  opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = opts.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function imageToCanvasTexture(
  data: Uint8ClampedArray,
  size: number,
  opts: { srgb?: boolean } = {}
): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, opts);
}

/** Convert a tileable height field into a tangent-space normal map. */
function heightToNormal(h: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size;
    const yp = ((y + 1) % size) * size;
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = h[yc + xp] - h[yc + xm];
      const dy = h[yp + x] - h[ym + x];
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (yc + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Makrana marble (colour + normal + packed AO/roughness)
 * One tile covers 8 m x 8 m and contains 4x4 slabs with faint joints.
 * -------------------------------------------------------------------------- */

export interface PBRSet {
  map: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}

export function makeMarbleSet(size = 1024): PBRSet {
  const N = size;
  const col = new Uint8ClampedArray(N * N * 4);
  const orm = new Uint8ClampedArray(N * N * 4);
  const hgt = new Float32Array(N * N);
  const slabs = 4;
  const slabPx = N / slabs;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const sx = Math.floor(u * slabs);
      const sy = Math.floor(v * slabs);
      const tone = (hash(sx, sy, 99) - 0.5) * 0.04;

      const cloud = fbm(u, v, 3, 5, 11);
      const cloud2 = fbm(u, v, 7, 4, 23);
      const warp = fbm(u, v, 2, 3, 5);
      const vv = fbm(u + warp * 0.14, v + warp * 0.09, 5, 4, 31);
      let vein = 1 - Math.min(1, Math.abs(vv - 0.5) / 0.026);
      vein *= vein;
      vein *= smooth(0.46, 0.72, fbm(u, v, 2, 3, 7));
      const grain = hash(x, y, 3) - 0.5;

      // slab joints
      const px = x % slabPx;
      const py = y % slabPx;
      const edge = Math.min(px, slabPx - px, py, slabPx - py);
      const joint = edge < 1.4 ? 1 - edge / 1.4 : 0;

      const shade = (cloud - 0.5) * 16 + (cloud2 - 0.5) * 7 + tone * 255 * 0.6 + grain * 2.2;
      let r = 243 + shade;
      let g = 239 + shade * 0.98;
      let b = 228 + shade * 0.9 - (0.5 - cloud) * 10;
      const vm = vein * 0.42;
      r += (188 - r) * vm;
      g += (180 - g) * vm;
      b += (170 - b) * vm;
      const j = 1 - joint * 0.09;
      r *= j;
      g *= j;
      b *= j;

      const i = (y * N + x) * 4;
      col[i] = r;
      col[i + 1] = g;
      col[i + 2] = b;
      col[i + 3] = 255;

      orm[i] = 255 * (1 - joint * 0.55 - vein * 0.05 - Math.max(0, 0.5 - cloud) * 0.05);
      orm[i + 1] = 255 * (0.27 + 0.1 * cloud2 + 0.05 * grain - vein * 0.04 + joint * 0.15);
      orm[i + 2] = 0;
      orm[i + 3] = 255;

      hgt[y * N + x] = cloud * 0.5 + cloud2 * 0.15 + grain * 0.06 - joint * 1.2 - vein * 0.12;
    }
  }
  const nrm = heightToNormal(hgt, N, 2.2);
  return {
    map: imageToCanvasTexture(col, N, { srgb: true }),
    normal: imageToCanvasTexture(nrm, N, { srgb: false }),
    orm: imageToCanvasTexture(orm, N, { srgb: false }),
  };
}

/* ----------------------------------------------------------------------------
 * Agra red sandstone: coursed blocks, 8 m tile
 * -------------------------------------------------------------------------- */

export function makeSandstoneSet(size = 512): { map: THREE.Texture; normal: THREE.Texture } {
  const N = size;
  const col = new Uint8ClampedArray(N * N * 4);
  const hgt = new Float32Array(N * N);
  const rows = 8;
  const rowPx = N / rows;
  for (let y = 0; y < N; y++) {
    const row = Math.floor(y / rowPx);
    const bx0 = (row % 2) * 0.5;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const blockU = u * 4 + bx0;
      const block = Math.floor(blockU);
      const fx = blockU - block;
      const fy = (y % rowPx) / rowPx;
      const mortar = Math.min(fx, 1 - fx) * 2 < 0.035 || Math.min(fy, 1 - fy) * 2 < 0.06 ? 1 : 0;
      const bt = hash(((block % 4) + 4) % 4, row, 41);
      const n1 = fbm(u, v, 6, 5, 7);
      const n2 = hash(x, y, 9) - 0.5;
      const streak = fbm(u * 1.0, v, 4, 3, 19);
      let r = 150 + bt * 30 + (n1 - 0.5) * 50 + n2 * 14;
      let g = 66 + bt * 14 + (n1 - 0.5) * 26 + n2 * 8 + (streak - 0.5) * 8;
      let b = 48 + bt * 10 + (n1 - 0.5) * 18 + n2 * 6;
      if (mortar) {
        r = r * 0.62 + 40;
        g = g * 0.62 + 36;
        b = b * 0.62 + 30;
      }
      const i = (y * N + x) * 4;
      col[i] = r;
      col[i + 1] = g;
      col[i + 2] = b;
      col[i + 3] = 255;
      hgt[y * N + x] = n1 * 0.5 + n2 * 0.1 - mortar * 0.7;
    }
  }
  return {
    map: imageToCanvasTexture(col, N, { srgb: true }),
    normal: imageToCanvasTexture(heightToNormal(hgt, N, 2.4), N, { srgb: false }),
  };
}

/* ----------------------------------------------------------------------------
 * Grass, water ripples
 * -------------------------------------------------------------------------- */

export function makeGrassSet(size = 512): { map: THREE.Texture; normal: THREE.Texture } {
  const N = size;
  const col = new Uint8ClampedArray(N * N * 4);
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const n1 = fbm(u, v, 4, 5, 3);
      const n2 = fbm(u, v, 24, 2, 8);
      const blade = hash(x, y, 5) - 0.5;
      const r = 62 + (n1 - 0.5) * 38 + blade * 26 + (n2 - 0.5) * 14;
      const g = 104 + (n1 - 0.5) * 52 + blade * 34 + (n2 - 0.5) * 18;
      const b = 44 + (n1 - 0.5) * 24 + blade * 16;
      const i = (y * N + x) * 4;
      col[i] = r;
      col[i + 1] = g;
      col[i + 2] = b;
      col[i + 3] = 255;
      hgt[y * N + x] = n2 * 0.6 + blade * 0.5;
    }
  }
  return {
    map: imageToCanvasTexture(col, N, { srgb: true }),
    normal: imageToCanvasTexture(heightToNormal(hgt, N, 1.4), N, { srgb: false }),
  };
}

/** Tileable ripple normal map (xy slope packed in rg). Used by the water shader & river. */
export function makeWaterNormal(size = 512): THREE.Texture {
  const N = size;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      const warp = fbm(u, v, 3, 3, 71);
      hgt[y * N + x] =
        fbm(u + warp * 0.2, v - warp * 0.2, 6, 5, 13) +
        0.25 * Math.sin((u * 7 + v * 3 + warp) * Math.PI * 2) +
        0.2 * Math.sin((u * -4 + v * 9) * Math.PI * 2);
    }
  }
  return imageToCanvasTexture(heightToNormal(hgt, N, 4.5), N, { srgb: false });
}

/* ----------------------------------------------------------------------------
 * Flower bed (patchwork of flower colours, symmetrical-looking blocks)
 * -------------------------------------------------------------------------- */

export function makeFlowerBed(size = 512): THREE.Texture {
  const { canvas, ctx } = makeCanvas(size, size);
  const N = size;
  const r = rng(404);
  ctx.fillStyle = '#2f5a2a';
  ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {
    const x = r() * N;
    const y = r() * N;
    ctx.fillStyle = `rgba(${30 + r() * 40},${70 + r() * 50},${28 + r() * 20},0.8)`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + r() * 5, 0, 7);
    ctx.fill();
  }
  const palette = ['#e9a21b', '#d9588c', '#c63b3b', '#efece2', '#8d52b4'];
  for (let i = 0; i < 2200; i++) {
    const x = r() * N;
    const y = r() * N;
    const cls = Math.floor(fbm(x / N, y / N, 3, 2, 55) * 5.6 - 0.3);
    ctx.fillStyle = palette[Math.max(0, Math.min(4, cls))];
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -8 || py < -8 || px > N + 8 || py > N + 8) continue;
        ctx.beginPath();
        ctx.arc(px, py, 2.2 + r() * 2.4, 0, 7);
        ctx.fill();
      }
    }
  }
  return toTexture(canvas);
}

/* ----------------------------------------------------------------------------
 * Calligraphy strip (black Thuluth-style inlay on transparent background)
 * Deterministic rhythm of tall alif/lam verticals, bowls, teeth, loops, dots.
 * -------------------------------------------------------------------------- */

export function makeCalligraphy(): THREE.Texture {
  const W = 2048;
  const H = 160;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b0a0a';
  const r = rng(1632); // 1632: year construction began

  const base = 112;
  type P = [number, number];
  const bez = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  /** Pen stroke along a cubic bezier with tapering width. */
  const pen = (p0: P, p1: P, p2: P, p3: P, w0: number, w1: number, wMid = 0) => {
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = bez(p0, p1, p2, p3, t);
      const w = w0 + (w1 - w0) * t + wMid * Math.sin(Math.PI * t);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, w / 2), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const dot = (cx: number, cy: number, s: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.6);
    ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
    ctx.restore();
  };

  // frame hairlines
  ctx.fillRect(0, 10, W, 3);
  ctx.fillRect(0, H - 13, W, 3);

  let x = 30;
  let sinceAlif = 0;
  while (x < W - 90) {
    const t = r();
    if (sinceAlif > 70 || t < 0.28) {
      // alif
      const h = 84 + r() * 6;
      pen([x, base + 6], [x + 1, base - h * 0.4], [x + 3, base - h * 0.8], [x + 4, base - h], 12, 5);
      x += 24;
      // lam with sweeping hook
      pen([x, base - h - 2 + r() * 4], [x + 1, base - 60], [x + 2, base - 30], [x + 3, base - 14], 12, 8);
      pen([x + 3, base - 14], [x + 5, base + 10], [x - 22, base + 12], [x - 46, base - 8], 9, 4, 4);
      x += 38;
      sinceAlif = 0;
    } else if (t < 0.5) {
      // bowl (ba/ta/nun) with dots
      const w = 54 + r() * 20;
      pen([x + w, base - 8], [x + w * 0.8, base + 16], [x + w * 0.2, base + 16], [x, base - 6], 7, 11, 3);
      const dots = 1 + Math.floor(r() * 3);
      for (let d = 0; d < dots; d++) dot(x + w * 0.5 + (d - (dots - 1) / 2) * 14, d === 0 && dots === 1 ? base + 30 : base - 30, 4);
      x += w + 10;
      sinceAlif += w;
    } else if (t < 0.72) {
      // teeth (seen)
      for (let k = 0; k < 3; k++) {
        pen([x + k * 16 + 14, base - 2], [x + k * 16 + 12, base - 26], [x + k * 16 + 4, base - 26], [x + k * 16, base - 2], 6, 6);
      }
      pen([x + 52, base - 2], [x + 44, base + 14], [x + 10, base + 16], [x - 6, base], 6, 8);
      x += 66;
      sinceAlif += 66;
    } else if (t < 0.86) {
      // loop (ha/meem) with tail
      ctx.beginPath();
      ctx.ellipse(x + 16, base - 14, 15, 13, 0, 0, Math.PI * 2);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#0b0a0a';
      ctx.stroke();
      pen([x + 16, base - 1], [x + 20, base + 22], [x + 6, base + 30], [x - 12, base + 20], 8, 4);
      x += 52;
      sinceAlif += 52;
    } else {
      // kashida (elongated connector)
      const L = 60 + r() * 70;
      pen([x, base], [x + L * 0.3, base + 4], [x + L * 0.7, base - 4], [x + L, base], 5, 9, 2);
      x += L;
      sinceAlif += L;
    }
    // small diacritics
    if (r() < 0.4) {
      const dx = x - 20 - r() * 40;
      pen([dx, 24 + r() * 8], [dx + 4, 22], [dx + 8, 20], [dx + 12, 16], 3, 3);
    }
    x += 6;
  }
  return toTexture(canvas, { srgb: true });
}

/* ----------------------------------------------------------------------------
 * Pietra-dura floral inlay (ivory ground, 2x2 symmetric motif, tileable)
 * -------------------------------------------------------------------------- */

export function makeFloral(): THREE.Texture {
  const N = 512;
  const { canvas, ctx } = makeCanvas(N, N);
  ctx.fillStyle = '#ece6d8';
  ctx.fillRect(0, 0, N, N);
  // faint marble variation
  const r = rng(12);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(150,140,120,${0.015 + r() * 0.02})`;
    ctx.beginPath();
    ctx.arc(r() * N, r() * N, 6 + r() * 20, 0, 7);
    ctx.fill();
  }
  const leaf = (x: number, y: number, ang: number, len: number, wid: number, fill: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(25,45,35,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(len * 0.1, 0);
    ctx.lineTo(len * 0.85, 0);
    ctx.stroke();
    ctx.restore();
  };
  const flower = (x: number, y: number, rad: number, petals: number, c1: string, c2: string) => {
    for (let i = 0; i < petals; i++) {
      leaf(x, y, (i / petals) * Math.PI * 2, rad, rad * 0.32, c1);
    }
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.32, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#ece6d8';
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.14, 0, 7);
    ctx.fill();
  };
  const motif = (cx: number, cy: number) => {
    // vine stems towards the 4 corners
    ctx.strokeStyle = '#3d5f4a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(cx + sx * 40, cy + sy * 10, cx + sx * 70, cy + sy * 70, cx + sx * 128, cy + sy * 128);
      ctx.stroke();
      leaf(cx + sx * 66, cy + sy * 48, Math.atan2(sy * -0.6, sx * 1), 34, 11, '#4a7058');
      leaf(cx + sx * 48, cy + sy * 66, Math.atan2(sy * 1, sx * -0.6), 34, 11, '#4a7058');
    }
    // axis leaves
    for (let i = 0; i < 4; i++) {
      leaf(cx, cy, (i * Math.PI) / 2, 78, 15, '#58805f');
    }
    flower(cx, cy, 44, 8, '#25252a', '#a5463a');
  };
  for (const cx of [128, 384]) for (const cy of [128, 384]) motif(cx, cy);
  // small buds on cell corners (shared across tiles)
  for (const cx of [0, 256, 512]) {
    for (const cy of [0, 256, 512]) flower(cx, cy, 20, 6, '#a5463a', '#25252a');
  }
  return toTexture(canvas, { srgb: true });
}

/* ----------------------------------------------------------------------------
 * Jali (pierced lattice screen): dark openings, marble lattice
 * -------------------------------------------------------------------------- */

export function makeJali(): THREE.Texture {
  const N = 256;
  const { canvas, ctx } = makeCanvas(N, N);
  ctx.fillStyle = '#17120e';
  ctx.fillRect(0, 0, N, N);
  ctx.strokeStyle = '#e4ddcc';
  ctx.lineWidth = 10;
  const s = N / 4;
  for (let i = -4; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s + N, N);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * s, N);
    ctx.lineTo(i * s + N, 0);
    ctx.stroke();
  }
  // lattice rosettes
  ctx.fillStyle = '#e4ddcc';
  for (let ix = 0; ix < 4; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      ctx.beginPath();
      ctx.arc(ix * s + s / 2, iy * s + s / 2, 7, 0, 7);
      ctx.fill();
    }
  }
  return toTexture(canvas, { srgb: true });
}

/** Black & white marble checker for the plinth surface (1 tile = 2x2 cells). */
export function makeChecker(): THREE.Texture {
  const N = 256;
  const { canvas, ctx } = makeCanvas(N, N);
  ctx.fillStyle = '#eae5d8';
  ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = '#2b2a2a';
  ctx.fillRect(0, 0, N / 2, N / 2);
  ctx.fillRect(N / 2, N / 2, N / 2, N / 2);
  // fine marble speckle
  const r = rng(8);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},0.03)`;
    ctx.fillRect(r() * N, r() * N, 3 + r() * 6, 3 + r() * 6);
  }
  // inlay lines
  ctx.strokeStyle = 'rgba(120,115,105,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, N - 2, N - 2);
  ctx.strokeRect(N / 2, 0, 0.1, N);
  ctx.strokeRect(0, N / 2, N, 0.1);
  return toTexture(canvas, { srgb: true });
}

/* ----------------------------------------------------------------------------
 * Soft shadow / AO decals
 * -------------------------------------------------------------------------- */

export function makeBlobShadow(): THREE.Texture {
  const N = 128;
  const { canvas, ctx } = makeCanvas(N, N);
  const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  return toTexture(canvas, { repeat: false, aniso: 1 });
}

/** Rectangular ambient-occlusion halo (dark at the centre rectangle, soft falloff outward). */
export function makeRectAO(innerFrac: number): THREE.Texture {
  const N = 256;
  const { canvas, ctx } = makeCanvas(N, N);
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = Math.max(0, Math.abs(x / N - 0.5) * 2 - innerFrac);
      const dy = Math.max(0, Math.abs(y / N - 0.5) * 2 - innerFrac);
      const d = Math.hypot(dx, dy) / (1 - innerFrac);
      const a = Math.pow(1 - Math.min(1, d), 2.2) * 0.55;
      const i = (y * N + x) * 4;
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { repeat: false, aniso: 1 });
}

/** Foliage luminance variation (multiplied with a green tint). */
export function makeFoliage(): THREE.Texture {
  const N = 256;
  const col = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = fbm(x / N, y / N, 8, 4, 91);
      const s = hash(x, y, 2);
      const v = 150 + (n - 0.5) * 150 + (s - 0.5) * 70;
      const i = (y * N + x) * 4;
      col[i] = v;
      col[i + 1] = v;
      col[i + 2] = v;
      col[i + 3] = 255;
    }
  }
  return imageToCanvasTexture(col, N, { srgb: true });
}
