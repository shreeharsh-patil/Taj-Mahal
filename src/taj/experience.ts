/**
 * TajExperience — orchestrates renderer, scene, environment, monument, garden, camera, post-processing,
 * resize handling and clean-up. The React layer only talks to this class.
 */
import * as THREE from 'three';
import { CameraRig, INTRO_START, ViewName } from './camera';
import { Environment, TimePreset } from './environment';
import { buildGarden, GardenResult } from './garden';
import { createMaterials, Materials } from './materials';
import { buildMonument } from './platform';
import { PostFX } from './post';

export interface ExperienceCallbacks {
  onProgress: (fraction: number, label: string) => void;
  onTourChange: (touring: boolean) => void;
}

const TOTAL_STEPS = 15;

const frame = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 60); // never stall in background tabs
  });

export class TajExperience {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private rig!: CameraRig;
  private env!: Environment;
  private post!: PostFX;
  private garden!: GardenResult;
  private materials!: Materials;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private steps = 0;
  readonly mobile: boolean;

  constructor(
    private container: HTMLElement,
    private cb: ExperienceCallbacks
  ) {
    this.mobile =
      window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
  }

  private async tick(label: string) {
    this.steps++;
    this.cb.onProgress(Math.min(0.98, this.steps / TOTAL_STEPS), label);
    await frame();
  }

  /** Build everything. Resolves when the first frame has been rendered. */
  async init() {
    await this.tick('Preparing the stage…');

    /* ---- renderer ---- */
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // MSAA is provided by the composer's multisampled target
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2));
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // static scene: re-rendered only when the sun moves
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.64;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    /* ---- camera & controls ---- */
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, w / h, 1, 7000);
    this.rig = new CameraRig(this.camera, renderer.domElement);
    this.rig.onTourChange = (t) => this.cb.onTourChange(t);

    /* ---- environment & lighting ---- */
    await this.tick('Painting the sky…');
    this.env = new Environment(this.scene, renderer, this.mobile);

    /* ---- materials ---- */
    this.materials = await createMaterials(this.mobile, (l) => this.tick(l));

    /* ---- monument ---- */
    await this.tick('Raising the plinth and minarets…');
    const monument = buildMonument(this.materials);
    this.scene.add(monument.group);
    await this.tick('Crowning the dome…');

    /* ---- garden, pool, vegetation ---- */
    const pr = renderer.getPixelRatio();
    this.garden = await buildGarden(this.materials, {
      waterNormal: this.materials.waterNormal,
      waterSize: this.waterSize(w, h, pr),
      samples: this.mobile ? 0 : 4,
      sunDirection: this.env.sunDir,
      sunColor: this.env.sunColor,
      deepColor: this.env.waterDeep,
      mobile: this.mobile,
      tick: (l) => this.tick(l),
    });
    this.scene.add(this.garden.group);

    /* ---- post-processing ---- */
    await this.tick('Compiling shaders…');
    this.post = new PostFX(renderer, this.scene, this.camera, this.mobile);
    try {
      await renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* compileAsync is an optimisation only */
    }

    // anisotropy for large tiling textures
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && !Array.isArray(m)) {
        for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) if (t) t.anisotropy = Math.min(8, maxAniso);
      }
    });

    this.rig.setPose(this.rig.fit(INTRO_START));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    // warm-up frames so the first visible frame is fully shaded
    this.update(0.016);
    this.post.render(0);
    await this.tick('Almost there…');
    this.update(0.016);
    this.post.render(0);

    this.clock.start();
    renderer.setAnimationLoop(() => this.loop());
    this.cb.onProgress(1, 'Ready');
  }

  private waterSize(w: number, h: number, pr: number) {
    const k = this.mobile ? 0.5 : 0.8;
    const cap = this.mobile ? 768 : 2048;
    return {
      w: Math.max(256, Math.min(cap, Math.floor(w * pr * k))),
      h: Math.max(256, Math.min(cap, Math.floor(h * pr * k))),
    };
  }

  /** Start the cinematic intro (call once the loading screen is fading out). */
  begin() {
    this.rig.playIntro();
  }

  /* ------------------------------------------------------------------ loop */

  private loop() {
    if (this.disposed) return;
    const dt = Math.min(0.1, this.clock.getDelta());
    this.update(dt);
    this.post.render(this.elapsed);
  }

  private update(dt: number) {
    this.elapsed += dt;
    this.rig.update(dt);
    this.env.update(dt, this.camera);
    this.garden.update(this.elapsed);
    this.garden.water.update(this.elapsed, this.env.sunDir, this.env.sunColor, this.env.waterDeep);
  }

  /* ---------------------------------------------------------------- resize */

  private resize() {
    if (this.disposed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h);
    const s = this.waterSize(w, h, this.renderer.getPixelRatio());
    this.garden.water.setSize(s.w, s.h);
  }

  /* ------------------------------------------------------------- public API */

  goTo(view: ViewName) {
    this.rig.goTo(view);
  }
  reset() {
    this.rig.reset();
  }
  startTour() {
    this.rig.startTour();
  }
  stopTour() {
    this.rig.cancel();
  }
  isTouring() {
    return this.rig.touring;
  }
  setTime(p: TimePreset) {
    this.env.setPreset(p);
  }
  getTime(): TimePreset {
    return this.env.getPreset();
  }
  setDrift(on: boolean) {
    this.env.setDrift(on);
  }

  /* --------------------------------------------------------------- cleanup */

  dispose() {
    this.disposed = true;
    this.renderer?.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.rig?.dispose();
    this.post?.dispose();
    this.env?.dispose();
    this.garden?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
