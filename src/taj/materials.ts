/**
 * PBR material library. Built once, shared by every building / garden mesh.
 */
import * as THREE from 'three';
import {
  makeCalligraphy,
  makeChecker,
  makeFlowerBed,
  makeFloral,
  makeGrassSet,
  makeJali,
  makeMarbleSet,
  makeSandstoneSet,
  makeWaterNormal,
} from './textures';

export interface Materials {
  marble: THREE.MeshPhysicalMaterial;
  sand: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  inlay: THREE.MeshStandardMaterial;
  decalCalli: THREE.MeshStandardMaterial;
  decalFloral: THREE.MeshStandardMaterial;
  decalChecker: THREE.MeshStandardMaterial;
  jali: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  paving: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  bed: THREE.MeshStandardMaterial;
  outerGround: THREE.MeshStandardMaterial;
  bank: THREE.MeshStandardMaterial;
  poolFloor: THREE.MeshStandardMaterial;
  river: THREE.MeshStandardMaterial;
  waterNormal: THREE.Texture;
  /** Keyed lookup for the geometry Builder. */
  byKey: Record<string, THREE.Material>;
}

function withRepeat(t: THREE.Texture, rx: number, ry = rx): THREE.Texture {
  const c = t.clone();
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

export async function createMaterials(
  mobile: boolean,
  tick: (label: string) => Promise<void>
): Promise<Materials> {
  await tick('Quarrying Makrana marble…');
  const marbleSet = makeMarbleSet(mobile ? 512 : 1024);
  await tick('Carving red sandstone…');
  const sandSet = makeSandstoneSet(mobile ? 256 : 512);
  await tick('Laying out the lawns…');
  const grassSet = makeGrassSet(mobile ? 256 : 512);
  await tick('Inlaying calligraphy & flowers…');
  const calli = makeCalligraphy();
  const floral = makeFloral();
  const jaliTex = makeJali();
  const checker = makeChecker();
  const bedTex = makeFlowerBed(mobile ? 256 : 512);
  const waterNormal = makeWaterNormal(mobile ? 256 : 512);

  // Warm Makrana marble: polished, subtle clearcoat, low roughness with natural variation.
  const marble = new THREE.MeshPhysicalMaterial({
    map: marbleSet.map,
    normalMap: marbleSet.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: marbleSet.orm,
    aoMap: marbleSet.orm,
    aoMapIntensity: 0.85,
    roughness: 1,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.42,
    envMapIntensity: 0.9,
  });

  const sand = new THREE.MeshStandardMaterial({
    map: sandSet.map,
    normalMap: sandSet.normal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.88,
  });
  // Builder box-UVs are in 8 m tiles -> repeat 1.

  const gold = new THREE.MeshStandardMaterial({
    color: 0xe0ac3c,
    metalness: 1,
    roughness: 0.26,
    envMapIntensity: 1.3,
  });
  const inlay = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.3, metalness: 0 });

  const poly = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const decalCalli = new THREE.MeshStandardMaterial({
    map: calli,
    transparent: true,
    depthWrite: false,
    roughness: 0.35,
    ...poly,
  });
  const floralTex = withRepeat(floral, 1 / 2.4);
  const decalFloral = new THREE.MeshStandardMaterial({ map: floralTex, roughness: 0.4, ...poly });
  const checkerTex = withRepeat(checker, 8 / 3.2);
  const decalChecker = new THREE.MeshStandardMaterial({
    map: checkerTex,
    roughness: 0.32,
    envMapIntensity: 0.6,
    ...poly,
  });
  const jali = new THREE.MeshStandardMaterial({ map: withRepeat(jaliTex, 1 / 1.5), roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x120e0b, roughness: 1 });

  // --- garden surfaces (UVs are metric, in metres)
  const paving = new THREE.MeshStandardMaterial({
    map: withRepeat(sandSet.map, 1 / 8),
    normalMap: withRepeat(sandSet.normal, 1 / 8),
    color: new THREE.Color(1.35, 1.12, 1.0),
    roughness: 0.85,
  });
  const grass = new THREE.MeshStandardMaterial({
    map: withRepeat(grassSet.map, 1 / 5),
    normalMap: withRepeat(grassSet.normal, 1 / 5),
    roughness: 0.95,
  });
  const bed = new THREE.MeshStandardMaterial({ map: withRepeat(bedTex, 1 / 3.2), roughness: 0.9 });
  const outerGround = new THREE.MeshStandardMaterial({
    map: withRepeat(grassSet.map, 1 / 36),
    color: new THREE.Color(1.25, 1.12, 0.78),
    roughness: 1,
  });
  const bank = new THREE.MeshStandardMaterial({ color: 0x6d5b45, roughness: 1 });
  const poolFloor = new THREE.MeshStandardMaterial({ color: 0x3f4e47, roughness: 0.6 });
  const riverNormal = withRepeat(waterNormal, 1 / 14, 1 / 14);
  const river = new THREE.MeshStandardMaterial({
    color: 0x4d6559,
    roughness: 0.1,
    metalness: 0,
    normalMap: riverNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.4,
  });

  const byKey: Record<string, THREE.Material> = {
    marble,
    sand,
    gold,
    inlay,
    decalCalli,
    decalFloral,
    decalChecker,
    jali,
    dark,
    paving,
    grass,
    bed,
  };
  return {
    marble,
    sand,
    gold,
    inlay,
    decalCalli,
    decalFloral,
    decalChecker,
    jali,
    dark,
    paving,
    grass,
    bed,
    outerGround,
    bank,
    poolFloor,
    river,
    waterNormal,
    byKey,
  };
}
