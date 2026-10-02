/**
 * Camera rig: OrbitControls with damping + limits, scripted intro, smooth preset
 * transitions and the multi-shot Cinematic Tour. Any user input interrupts a scripted move.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

export type ViewName = 'front' | 'aerial' | 'close' | 'garden';

const P = (px: number, py: number, pz: number, tx: number, ty: number, tz: number): Pose => ({
  pos: new THREE.Vector3(px, py, pz),
  target: new THREE.Vector3(tx, ty, tz),
});

/** Hero composition: centred on the central axis, low over the pool, Taj framed with its minarets. */
export const POSES: Record<ViewName, Pose> = {
  front: P(0, 15, 212, 0, 31, 0),
  aerial: P(-105, 150, 250, 0, 18, 0),
  close: P(27, 14, 96, 0, 31, 0),
  garden: P(-11, 2.8, 150, 0, 27, 0),
};
export const INTRO_START = P(0, 58, 345, 0, 42, 0);

/* ------------------------------------------------------------------ easing */

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
const linear = (t: number) => t;

interface Shot {
  dur: number;
  ease: (t: number) => number;
  sample: (k: number, pos: THREE.Vector3, tgt: THREE.Vector3) => void;
}
type ShotFactory = (start: Pose) => Shot;

function flyShot(to: Pose, dur: number, ease = easeInOutCubic, lift = 0): ShotFactory {
  return (start) => {
    const a = start.pos.clone();
    const at = start.target.clone();
    const b = to.pos.clone();
    const bt = to.target.clone();
    return {
      dur,
      ease,
      sample: (k, pos, tgt) => {
        pos.lerpVectors(a, b, k);
        pos.y += Math.sin(Math.PI * k) * lift;
        tgt.lerpVectors(at, bt, k);
      },
    };
  };
}

function holdShot(dur: number, drift = 1.5): ShotFactory {
  return (start) => ({
    dur,
    ease: linear,
    sample: (k, pos, tgt) => {
      pos.copy(start.pos);
      pos.x += Math.sin(k * Math.PI) * drift;
      tgt.copy(start.target);
    },
  });
}

function orbitShot(center: THREE.Vector3, radius: number, a0: number, a1: number, y0: number, y1: number, tgtY: number, dur: number): ShotFactory {
  return () => ({
    dur,
    ease: easeInOutSine,
    sample: (k, pos, tgt) => {
      const a = a0 + (a1 - a0) * k;
      pos.set(center.x + Math.sin(a) * radius, y0 + (y1 - y0) * k + Math.sin(k * Math.PI * 2) * 3, center.z + Math.cos(a) * radius);
      tgt.set(center.x, tgtY, center.z);
    },
  });
}

/* --------------------------------------------------------------------- rig */

export class CameraRig {
  readonly controls: OrbitControls;
  private queue: ShotFactory[] = [];
  private shot: Shot | null = null;
  private t = 0;
  private _touring = false;
  private _playing = false;
  private onEnd: (() => void) | null = null;
  private tmpPos = new THREE.Vector3();
  private tmpTgt = new THREE.Vector3();
  // Captured on window (before OrbitControls sees the event) so the very first touch both
  // interrupts a scripted move and starts a drag.
  private readonly interrupt = (e: Event) => {
    if (e.target === this.dom) this.cancel();
  };

  onTourChange: ((touring: boolean) => void) | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private dom: HTMLElement
  ) {
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.rotateSpeed = 0.5;
    c.zoomSpeed = 0.8;
    c.panSpeed = 0.6;
    c.minDistance = 6;
    c.maxDistance = 720;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI * 0.56; // allows near-ground views, never underground (also clamped below)
    c.screenSpacePanning = false;
    this.controls = c;

    window.addEventListener('pointerdown', this.interrupt, true);
    window.addEventListener('wheel', this.interrupt, { capture: true, passive: true });
    window.addEventListener('touchstart', this.interrupt, { capture: true, passive: true });
  }

  get touring() {
    return this._touring;
  }
  get playing() {
    return this._playing;
  }

  /** Narrow (portrait) screens need to dolly back to keep the minarets in frame. */
  fit(p: Pose): Pose {
    const aspect = this.camera.aspect;
    const k = Math.min(1.9, Math.max(1, 0.8 / aspect));
    if (k === 1) return { pos: p.pos.clone(), target: p.target.clone() };
    const pos = p.target.clone().add(p.pos.clone().sub(p.target).multiplyScalar(k));
    pos.y = Math.max(pos.y, p.pos.y);
    return { pos, target: p.target.clone() };
  }

  currentPose(): Pose {
    return { pos: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  setPose(p: Pose) {
    this.camera.position.copy(p.pos);
    this.controls.target.copy(p.target);
    this.controls.update();
  }

  /** Cinematic opening: begin far back, glide forward above the pool to the hero view. */
  playIntro(onDone?: () => void) {
    this.setPose(this.fit(INTRO_START));
    this.run([flyShot(this.fit(POSES.front), 10.5, easeInOutSine, 3)], onDone, false);
  }

  goTo(name: ViewName, dur = 2.8) {
    this.cancelSilently();
    this.run([flyShot(this.fit(POSES[name]), dur, easeInOutCubic, name === 'aerial' ? 10 : 0)], undefined, false);
  }

  /** Reset: back to the hero composition. */
  reset() {
    this.goTo('front', 2.4);
  }

  /** Cinematic tour: front → approach → dome orbit → minaret → aerial → front. */
  startTour() {
    this.cancelSilently();
    const front = this.fit(POSES.front);
    const dome = new THREE.Vector3(0, 0, 0);
    const mc = new THREE.Vector3(41.8, 0, 41.8);
    const k = Math.max(1, Math.min(1.5, 0.8 / this.camera.aspect));
    const shots: ShotFactory[] = [
      flyShot(front, 3.2, easeInOutCubic),
      holdShot(2.4, 1.2),
      flyShot(this.fit(P(0, 17, 118, 0, 34, 0)), 8.5, easeInOutSine),
      flyShot(this.fit(P(0, 56, 104 * k, 0, 44, 0)), 4.5, easeInOutCubic),
      orbitShot(dome, 104 * k, 0, Math.PI * 2, 56, 66, 44, 26),
      flyShot(P(74.43, 20, 71.32, 41.8, 29, 41.8), 6, easeInOutCubic, 4),
      orbitShot(mc, 44, 0.8354, -0.35, 20, 33, 29, 10),
      flyShot(this.fit(POSES.aerial), 8.5, easeInOutCubic, 6),
      flyShot(front, 8, easeInOutQuint, 2),
    ];
    this.run(shots, () => this.setTouring(false), true);
  }

  cancel() {
    if (!this._playing) return;
    this.cancelSilently();
  }

  private cancelSilently() {
    const was = this._touring;
    this.queue = [];
    this.shot = null;
    this._playing = false;
    this.onEnd = null;
    this.controls.enabled = true;
    if (was) this.setTouring(false);
  }

  private setTouring(v: boolean) {
    if (this._touring === v) return;
    this._touring = v;
    this.onTourChange?.(v);
  }

  private run(shots: ShotFactory[], onDone: (() => void) | undefined, touring: boolean) {
    this.queue = shots.slice();
    this.onEnd = onDone ?? null;
    this._playing = true;
    this.controls.enabled = false;
    this.setTouring(touring);
    this.next();
  }

  private next() {
    const f = this.queue.shift();
    if (!f) {
      this._playing = false;
      this.shot = null;
      this.controls.enabled = true;
      const cb = this.onEnd;
      this.onEnd = null;
      cb?.();
      return;
    }
    // the orbit shot around the minaret starts where the previous shot ended
    this.shot = f(this.currentPose());
    this.t = 0;
  }

  update(dt: number) {
    if (this.shot) {
      this.t += dt;
      const k = Math.min(1, this.t / this.shot.dur);
      this.shot.sample(this.shot.ease(k), this.tmpPos, this.tmpTgt);
      this.camera.position.copy(this.tmpPos);
      this.controls.target.copy(this.tmpTgt);
      if (k >= 1) this.next();
    }
    this.controls.update();

    // --- limits: never underground, keep the focus point inside the site
    const t = this.controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -260, 260);
    t.z = THREE.MathUtils.clamp(t.z, -260, 380);
    t.y = THREE.MathUtils.clamp(t.y, 2, 120);
    const cam = this.camera.position;
    if (cam.y < 1.8) cam.y = 1.8;
  }

  dispose() {
    window.removeEventListener('pointerdown', this.interrupt, true);
    window.removeEventListener('wheel', this.interrupt, true);
    window.removeEventListener('touchstart', this.interrupt, true);
    this.controls.dispose();
  }
}
