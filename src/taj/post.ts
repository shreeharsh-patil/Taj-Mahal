/**
 * Post-processing chain:
 *   RenderPass (MSAA, HalfFloat HDR)  →  subtle UnrealBloom (HDR highlights only)
 *   →  OutputPass (ACES Filmic tone mapping + sRGB)  →  colour grade / vignette / dither
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.3 },
    uTint: { value: new THREE.Vector3(1.01, 1.0, 0.975) },
    uSat: { value: 1.06 },
    uContrast: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform vec3 uTint;
    uniform float uSat;
    uniform float uContrast;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= uTint;
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.9)));
      c *= mix(1.0 - uVignette, 1.0, v);
      // dithering removes banding in the smooth sky gradient
      c += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    mobile: boolean
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: mobile ? 2 : 4,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(renderer.getPixelRatio());

    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.5, 1.7);
    this.bloom.enabled = !mobile; // keep mobile light
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(time: number) {
    this.grade.uniforms.uTime.value = time;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
