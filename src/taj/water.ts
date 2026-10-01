/**
 * Planar reflective water.
 *
 * Based on the classic three.js mirror technique (oblique near-plane clipping), but with:
 *  - a HalfFloat, optionally multisampled reflection target (no clipping / banding of HDR highlights)
 *  - physically-motivated Schlick Fresnel (F0 = 0.02) so the pool is transparent when looked into
 *    and mirror-like at grazing angles
 *  - three layers of tileable ripple normals that fade with distance to avoid shimmer
 *  - sun glints and fog support
 */
import * as THREE from 'three';

export interface WaterOptions {
  normalMap: THREE.Texture;
  width: number;
  height: number;
  samples: number;
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  deepColor: THREE.Color;
}

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 mirrorCoord;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    mirrorCoord = textureMatrix * wp;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D mirrorSampler;
  uniform sampler2D normalSampler;
  uniform float time;
  uniform float distortionScale;
  uniform float rippleStrength;
  uniform float alphaBase;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 eye;
  uniform vec3 deepColor;
  uniform vec3 reflTint;
  varying vec4 mirrorCoord;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  vec2 slope(vec2 p) {
    vec2 a = texture2D(normalSampler, p * 0.045 + vec2(time * 0.010, time * 0.006)).xy * 2.0 - 1.0;
    vec2 b = texture2D(normalSampler, p * 0.110 + vec2(-time * 0.008, time * 0.012)).xy * 2.0 - 1.0;
    vec2 c = texture2D(normalSampler, p * 0.290 + vec2(time * 0.021, -time * 0.017)).xy * 2.0 - 1.0;
    return a + b * 0.6 + c * 0.35;
  }

  void main() {
    vec3 toEye = eye - vWorld;
    float dist = length(toEye);
    vec3 V = toEye / dist;

    float fade = mix(1.0, 0.28, smoothstep(30.0, 260.0, dist));
    vec2 s = slope(vWorld.xz) * rippleStrength * fade;
    vec3 N = normalize(vec3(s.x, 1.0, s.y));

    float cosT = max(dot(V, N), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

    vec2 distortion = s * 0.33 * distortionScale / (1.0 + dist * 0.05);
    vec3 refl = texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion).rgb * reflTint;

    vec3 R = reflect(-sunDirection, N);
    float rv = max(dot(R, V), 0.0);
    float spec = pow(rv, 700.0) * 14.0 + pow(rv, 70.0) * 0.25;

    vec3 body = deepColor * (0.45 + 0.55 * cosT);
    vec3 col = mix(body, refl, F) + sunColor * spec * (0.3 + F);
    float alpha = mix(alphaBase, 1.0, F);
    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class ReflectiveWater extends THREE.Mesh {
  readonly renderTarget: THREE.WebGLRenderTarget;
  private shader: THREE.ShaderMaterial;

  constructor(geometry: THREE.BufferGeometry, opts: WaterOptions) {
    super(geometry);

    const renderTarget = new THREE.WebGLRenderTarget(opts.width, opts.height, {
      type: THREE.HalfFloatType,
      samples: opts.samples,
      generateMipmaps: false,
    });
    this.renderTarget = renderTarget;

    const textureMatrix = new THREE.Matrix4();
    const shader = new THREE.ShaderMaterial({
      name: 'ReflectiveWater',
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        {
          mirrorSampler: { value: renderTarget.texture },
          normalSampler: { value: opts.normalMap },
          textureMatrix: { value: textureMatrix },
          time: { value: 0 },
          distortionScale: { value: 1.0 },
          rippleStrength: { value: 0.1 },
          alphaBase: { value: 0.84 },
          sunColor: { value: opts.sunColor },
          sunDirection: { value: opts.sunDirection },
          eye: { value: new THREE.Vector3() },
          deepColor: { value: opts.deepColor },
          reflTint: { value: new THREE.Color(0.93, 0.97, 0.95) },
        },
      ]),
      vertexShader,
      fragmentShader,
      transparent: true,
      fog: true,
    });
    this.shader = shader;
    this.material = shader;

    // --- mirror camera state (allocated once)
    const mirrorPlane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const mirrorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const mirrorCamera = new THREE.PerspectiveCamera();
    const self = this;

    this.onBeforeRender = (renderer, scene, camera) => {
      mirrorWorldPosition.setFromMatrixPosition(self.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(self.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(mirrorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return; // viewed from below

      view.reflect(normal).negate();
      view.add(mirrorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(mirrorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(mirrorWorldPosition);

      mirrorCamera.position.copy(view);
      mirrorCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      mirrorCamera.lookAt(target);
      mirrorCamera.far = (camera as THREE.PerspectiveCamera).far;
      mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy((camera as THREE.PerspectiveCamera).projectionMatrix);

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(mirrorCamera.projectionMatrix);
      textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

      // oblique near-plane clipping (Lengyel)
      mirrorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorldPosition);
      mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
      clipPlane.set(mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant);
      const pm = mirrorCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      pm.elements[2] = clipPlane.x;
      pm.elements[6] = clipPlane.y;
      pm.elements[10] = clipPlane.z + 1.0 - 0.003;
      pm.elements[14] = clipPlane.w;

      shader.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);

      const currentRT = renderer.getRenderTarget();
      const xr = renderer.xr.enabled;
      const shadowAuto = renderer.shadowMap.autoUpdate;
      self.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, mirrorCamera);
      self.visible = true;
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setRenderTarget(currentRT);
    };
  }

  setSize(w: number, h: number) {
    this.renderTarget.setSize(w, h);
  }

  update(time: number, sunDir: THREE.Vector3, sunColor: THREE.Color, deepColor: THREE.Color) {
    const u = this.shader.uniforms;
    u.time.value = time;
    (u.sunDirection.value as THREE.Vector3).copy(sunDir);
    (u.sunColor.value as THREE.Color).copy(sunColor);
    (u.deepColor.value as THREE.Color).copy(deepColor);
  }

  dispose() {
    this.renderTarget.dispose();
    this.shader.dispose();
  }
}
