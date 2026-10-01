/**
 * Atmosphere & lighting.
 *
 * - Preetham Sky shader (+ PMREM image-based lighting generated from the same sky)
 * - Sun directional light with a tight high-resolution shadow frustum around the monument
 * - Hemisphere fill light
 * - Procedural fbm clouds drifting slowly on a high plane
 * - Horizon haze cylinder (warm atmospheric perspective)
 * - A few distant birds
 * - Three time-of-day presets (golden morning, day, sunset) with smooth transitions and an optional slow drift
 */
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export type TimePreset = 'morning' | 'day' | 'sunset';

interface EnvState {
  elev: number; // degrees
  az: number; // degrees, 0 = +z (towards the viewer), 90 = +x
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fog: THREE.Color;
  fogDensity: number;
  exposure: number;
  envIntensity: number;
  cloudOpacity: number;
  cloudShade: THREE.Color;
  cloudLit: THREE.Color;
  haze: THREE.Color;
  hazeOpacity: number;
  deep: THREE.Color;
}

const C = (hex: string) => new THREE.Color(hex);

function presetState(p: TimePreset): EnvState {
  switch (p) {
    case 'day':
      return {
        elev: 40, az: 28, turbidity: 3, rayleigh: 1.3, mie: 0.004, mieG: 0.8,
        sunColor: C('#fff1de'), sunIntensity: 4.6,
        hemiSky: C('#c4d8f5'), hemiGround: C('#a0916f'), hemiIntensity: 1.1,
        fog: C('#d3dde8'), fogDensity: 0.00115, exposure: 0.56, envIntensity: 0.75,
        cloudOpacity: 0.85, cloudShade: C('#8a96aa'), cloudLit: C('#ffffff'),
        haze: C('#cfdbe8'), hazeOpacity: 0.55, deep: C('#0f2b27'),
      };
    case 'sunset':
      return {
        elev: 5.5, az: 64, turbidity: 6, rayleigh: 2.4, mie: 0.012, mieG: 0.9,
        sunColor: C('#ff8d4a'), sunIntensity: 3.6,
        hemiSky: C('#8f86b6'), hemiGround: C('#74523b'), hemiIntensity: 0.9,
        fog: C('#e0a07f'), fogDensity: 0.0016, exposure: 0.78, envIntensity: 0.8,
        cloudOpacity: 0.9, cloudShade: C('#7a5f78'), cloudLit: C('#ffb27a'),
        haze: C('#f0a67c'), hazeOpacity: 0.75, deep: C('#18262a'),
      };
    default: // morning — golden hour
      return {
        elev: 15, az: 38, turbidity: 4.5, rayleigh: 1.5, mie: 0.005, mieG: 0.82,
        sunColor: C('#ffd1a1'), sunIntensity: 4.3,
        hemiSky: C('#bdd0f0'), hemiGround: C('#8b7453'), hemiIntensity: 1.0,
        fog: C('#e9d9c6'), fogDensity: 0.00135, exposure: 0.64, envIntensity: 0.75,
        cloudOpacity: 0.85, cloudShade: C('#8c94ab'), cloudLit: C('#ffe2c0'),
        haze: C('#f1dcc3'), hazeOpacity: 0.65, deep: C('#10292a'),
      };
  }
}

function lerpState(out: EnvState, a: EnvState, b: EnvState, k: number) {
  const n = (x: number, y: number) => x + (y - x) * k;
  out.elev = n(a.elev, b.elev);
  out.az = n(a.az, b.az);
  out.turbidity = n(a.turbidity, b.turbidity);
  out.rayleigh = n(a.rayleigh, b.rayleigh);
  out.mie = n(a.mie, b.mie);
  out.mieG = n(a.mieG, b.mieG);
  out.sunIntensity = n(a.sunIntensity, b.sunIntensity);
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.exposure = n(a.exposure, b.exposure);
  out.envIntensity = n(a.envIntensity, b.envIntensity);
  out.cloudOpacity = n(a.cloudOpacity, b.cloudOpacity);
  out.hazeOpacity = n(a.hazeOpacity, b.hazeOpacity);
  for (const key of ['sunColor', 'hemiSky', 'hemiGround', 'fog', 'cloudShade', 'cloudLit', 'haze', 'deep'] as const) {
    out[key].copy(a[key]).lerp(b[key], k);
  }
}

const smooth01 = (t: number) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------ cloud shader */

const cloudVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const cloudFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uSun;
  uniform vec3 uShade;
  uniform vec3 uLit;
  varying vec3 vW;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
  void main() {
    vec2 p = vW.xz * 0.00052 + vec2(uTime * 0.0032, uTime * 0.0011);
    float n = fbm(p);
    float cover = smoothstep(0.52, 0.80, n);
    float n2 = fbm(p + uSun * 0.025);
    float lit = clamp(0.5 + (n - n2) * 5.0, 0.0, 1.0);
    float dist = length(vW.xz - cameraPosition.xz);
    float fade = 1.0 - smoothstep(1800.0, 3800.0, dist);
    vec3 col = mix(uShade, uLit, lit);
    gl_FragColor = vec4(col, cover * uOpacity * fade);
  }
`;

const hazeVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const hazeFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec2 uSun;
  varying vec3 vW;
  void main() {
    float h = vW.y;
    float a = pow(1.0 - smoothstep(-20.0, 1300.0, h), 1.7);
    vec2 d = normalize(vW.xz - cameraPosition.xz);
    float towardSun = pow(max(dot(d, normalize(uSun)), 0.0), 3.0);
    a *= uOpacity * (0.75 + 0.5 * towardSun);
    gl_FragColor = vec4(uColor * (1.0 + 0.25 * towardSun), clamp(a, 0.0, 1.0));
  }
`;

/* -------------------------------------------------------------------- birds */

interface Bird {
  group: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  cx: number;
  cz: number;
  radius: number;
  y: number;
  speed: number;
  phase: number;
  flap: number;
}

function makeBirds(): { group: THREE.Group; birds: Bird[] } {
  const group = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0.45, 0, 0, -0.35, 1.7, 0.05, -0.25], 3)
  );
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x23211f, side: THREE.DoubleSide });
  const birds: Bird[] = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const wingR = new THREE.Mesh(geo, mat);
    const wingL = new THREE.Mesh(geo, mat);
    wingL.scale.x = -1;
    g.add(wingR, wingL);
    g.scale.setScalar(1.6 + (i % 4) * 0.35);
    group.add(g);
    const flock = i % 3;
    birds.push({
      group: g,
      wingL,
      wingR,
      cx: (flock - 1) * 120 + Math.sin(i) * 20,
      cz: -140 - flock * 60,
      radius: 40 + (i % 5) * 14,
      y: 95 + (i % 6) * 14 + flock * 12,
      speed: 0.07 + (i % 4) * 0.012,
      phase: i * 0.9,
      flap: 5 + (i % 3),
    });
  }
  return { group, birds };
}

/* ------------------------------------------------------------- Environment */

export class Environment {
  readonly sky: Sky;
  readonly light: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  readonly sunColor = new THREE.Color();
  readonly waterDeep = new THREE.Color();

  private clouds: THREE.Mesh;
  private haze: THREE.Mesh;
  private birds: Bird[];
  private birdGroup: THREE.Group;
  private envScene = new THREE.Scene();
  private envSky: Sky;
  private envGround: THREE.Mesh;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 0;
  private envDirty = true;
  private shadowDirty = true;

  private cur: EnvState = presetState('morning');
  private from: EnvState = presetState('morning');
  private to: EnvState = presetState('morning');
  private tweenT = 1;
  private preset: TimePreset = 'morning';
  private drift = false;
  private driftPhase = 0;
  private time = 0;
  private lastSunKey = '';

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    mobile: boolean
  ) {
    // Sky dome (follows the camera). Box is scaled well inside the far plane.
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.light = new THREE.DirectionalLight(0xffffff, 4);
    this.light.castShadow = true;
    const sh = this.light.shadow;
    sh.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
    sh.camera.left = -125;
    sh.camera.right = 125;
    sh.camera.top = 125;
    sh.camera.bottom = -125;
    sh.camera.near = 10;
    sh.camera.far = 950;
    sh.camera.updateProjectionMatrix();
    sh.bias = -0.00025;
    sh.normalBias = 0.2;
    this.light.target.position.set(0, 25, 0);
    scene.add(this.light, this.light.target);

    this.hemi = new THREE.HemisphereLight(0xbcd0f0, 0x8b7453, 0.55);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xe9d9c6, 0.00135);

    // Clouds
    const cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.85 },
        uSun: { value: new THREE.Vector2(0, 1) },
        uShade: { value: new THREE.Color() },
        uLit: { value: new THREE.Color() },
      },
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1), cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 520;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -2;
    scene.add(this.clouds);

    // Horizon haze
    const hazeMat = new THREE.ShaderMaterial({
      vertexShader: hazeVert,
      fragmentShader: hazeFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0.6 },
        uSun: { value: new THREE.Vector2(0, 1) },
      },
    });
    this.haze = new THREE.Mesh(new THREE.CylinderGeometry(5200, 5200, 1500, 48, 1, true), hazeMat);
    this.haze.position.y = 400;
    this.haze.frustumCulled = false;
    this.haze.renderOrder = -1;
    scene.add(this.haze);

    // Birds
    const b = makeBirds();
    this.birdGroup = b.group;
    this.birds = b.birds;
    scene.add(this.birdGroup);

    // Environment-lighting scene (own sky + ground bounce disc)
    this.envSky = new Sky();
    this.envSky.scale.setScalar(900);
    this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(
      new THREE.CircleGeometry(700, 24),
      new THREE.MeshBasicMaterial({ color: 0x8b7453, side: THREE.DoubleSide })
    );
    this.envGround.rotation.x = -Math.PI / 2;
    this.envGround.position.y = -6;
    this.envScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.apply();
    this.refreshEnvironment();
  }

  getPreset() {
    return this.preset;
  }

  setPreset(p: TimePreset) {
    this.drift = false;
    this.preset = p;
    this.from = this.copyState(this.cur);
    this.to = presetState(p);
    this.tweenT = 0;
  }

  setDrift(on: boolean) {
    this.drift = on;
    if (on) {
      const idx = ['morning', 'day', 'sunset'].indexOf(this.preset);
      this.driftPhase = idx < 0 ? 0 : idx;
    }
  }

  isDrifting() {
    return this.drift;
  }

  private copyState(s: EnvState): EnvState {
    const c = presetState('morning');
    lerpState(c, s, s, 0);
    return c;
  }

  /** Per-frame update. */
  update(dt: number, camera: THREE.Camera) {
    this.time += dt;

    if (this.drift) {
      this.driftPhase = (this.driftPhase + dt / 28) % 3;
      const i = Math.floor(this.driftPhase);
      const k = smooth01(this.driftPhase - i);
      const names: TimePreset[] = ['morning', 'day', 'sunset'];
      lerpState(this.cur, presetState(names[i]), presetState(names[(i + 1) % 3]), k);
      this.preset = names[k > 0.5 ? (i + 1) % 3 : i];
      this.envDirty = true;
    } else if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / 3.2);
      lerpState(this.cur, this.from, this.to, smooth01(this.tweenT));
      this.envDirty = true;
    }

    this.apply();

    // follow camera so the sky never parallaxes
    this.sky.position.copy(camera.position);
    this.clouds.position.x = camera.position.x;
    this.clouds.position.z = camera.position.z;
    this.haze.position.x = camera.position.x;
    this.haze.position.z = camera.position.z;
    (this.clouds.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;

    // refresh IBL at a limited rate while the sky is changing
    this.envTimer += dt;
    if (this.envDirty && this.envTimer > 0.4) {
      this.refreshEnvironment();
    }

    // birds
    for (const b of this.birds) {
      const a = b.phase + this.time * b.speed;
      b.group.position.set(b.cx + Math.cos(a) * b.radius, b.y + Math.sin(a * 2.3) * 4, b.cz + Math.sin(a) * b.radius * 0.7);
      b.group.rotation.y = -a;
      b.group.rotation.z = Math.sin(a * 2.3) * 0.12;
      const f = Math.sin(this.time * b.flap + b.phase * 3) * 0.55;
      b.wingR.rotation.z = f;
      b.wingL.rotation.z = -f;
    }
  }

  /** Push the current state into lights, sky, fog, haze, clouds. */
  private apply() {
    const s = this.cur;
    const el = THREE.MathUtils.degToRad(s.elev);
    const az = THREE.MathUtils.degToRad(s.az);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    this.sunColor.copy(s.sunColor);
    this.waterDeep.copy(s.deep);

    const key = `${this.sunDir.x.toFixed(4)},${this.sunDir.y.toFixed(4)}`;
    if (key !== this.lastSunKey) {
      this.lastSunKey = key;
      this.shadowDirty = true;
    }

    const lt = this.light;
    lt.position.copy(lt.target.position).addScaledVector(this.sunDir, 450);
    lt.color.copy(s.sunColor);
    lt.intensity = s.sunIntensity;
    if (this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }

    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(s.fog);
    fog.density = s.fogDensity;

    this.renderer.toneMappingExposure = s.exposure;
    this.scene.environmentIntensity = s.envIntensity;

    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = s.turbidity;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = s.mieG;
      u.sunPosition.value.copy(this.sunDir);
    }
    (this.envGround.material as THREE.MeshBasicMaterial).color
      .copy(s.hemiGround)
      .multiplyScalar(0.35 + 0.12 * s.sunIntensity);

    const cu = (this.clouds.material as THREE.ShaderMaterial).uniforms;
    cu.uOpacity.value = s.cloudOpacity;
    cu.uShade.value.copy(s.cloudShade);
    cu.uLit.value.copy(s.cloudLit);
    cu.uSun.value.set(this.sunDir.x, this.sunDir.z);

    const hu = (this.haze.material as THREE.ShaderMaterial).uniforms;
    hu.uColor.value.copy(s.haze);
    hu.uOpacity.value = s.hazeOpacity;
    hu.uSun.value.set(this.sunDir.x, this.sunDir.z);
  }

  /** Rebuild the PMREM environment from the current sky. */
  refreshEnvironment() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 3000);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.envDirty = false;
    this.envTimer = 0;
  }

  dispose() {
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.envSky.geometry.dispose();
  }
}
