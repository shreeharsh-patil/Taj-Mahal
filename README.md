# Taj Mahal — Interactive 3D Experience

A cinematic, fully procedural WebGL recreation of the Taj Mahal complex in Agra, built with **Three.js**
(React + Vite shell for the UI). No external model or texture files are needed — every mesh and
texture is generated at load time, so the result is a single self-contained `dist/index.html`.

## Run

```bash
npm install
npm run dev        # development server
npm run build      # produces dist/index.html (single file, works from any static host or file://)
npm run preview
```

## Controls

| Action | Input |
| --- | --- |
| Orbit / pan / zoom | mouse drag / right-drag / wheel, or touch drag / pinch |
| Views | **Front**, **Aerial**, **Close**, **Garden**, **Reset Camera** (keys `1`–`4`, `R`) |
| Cinematic Tour | button, or `T` (any drag / wheel / touch interrupts it) |
| Time of day | **Morning** (golden hour, default) · **Day** · **Sunset** · **Sun Drift** |
| Fullscreen | button, or `F` |

## Project layout

```
index.html              entry (title / meta)
src/main.tsx            React bootstrap
src/App.tsx             UI: loading screen, glass control bar, shortcuts
src/index.css           glass UI styles, full-screen canvas reset
src/taj/
  experience.ts         orchestrator: renderer, scene, loading progress, loop, resize, cleanup
  environment.ts        Sky shader, PMREM IBL, sun + shadows, presets, clouds, haze, birds
  camera.ts             OrbitControls rig, intro flythrough, view transitions, Cinematic Tour
  post.ts               MSAA HDR target → bloom → ACES Filmic output → grade/vignette/dither
  water.ts              planar reflective water (HalfFloat mirror target, Fresnel, ripples, glints)
  garden.ts             charbagh layout, pool + coping, lawns, flower beds, walls, trees, river
  platform.ts           sandstone terrace, marble plinth, stairs, mosque & jawab, AO decals
  mausoleum.ts          main tomb: chamfered body, pishtaq iwans, niches, drum, dome, chhatris
  minaret.ts            four leaning minarets with balconies and crowning kiosk
  parts.ts              reusable domes, lotus collars, finials, chhatris, guldastas
  geo.ts                geometry toolkit (arches, panels, ribbons, onion-dome lathe, lotus, finial, merge Builder)
  materials.ts          PBR material library
  textures.ts           procedural textures (marble PBR set, sandstone, grass, calligraphy, floral inlay, jali…)
```

## Architecture notes

* **Dimensions** follow the real monument (metres): 95 m plinth, 56 m chamfered mausoleum, 33.5 m pishtaq,
  ≈ 19 m wide / 20 m high onion dome, ≈ 41 m minarets, 300 m long garden axis.
* **Dome**: `LatheGeometry` from a G1-continuous cubic Bézier profile (neck → shoulder → belly → ogee crown),
  lotus-petal collar, gilded finial with the upward-pointing crescent.
* **Facades**: extruded pointed-arch panels with real recessed openings; black inlay ribbons, calligraphy frames,
  floral pietra-dura spandrels, jali windows and a two-tier iwan back wall.
* **Marble**: warm Makrana PBR set (colour, normal, packed AO/roughness) with slab joints, soft veining and a
  light clear-coat. UVs are projected in world space so there is no stretching.
* **Draw calls**: each building is merged per material; vegetation uses `InstancedMesh` with a vertex-shader
  wind sway; the shadow map renders only when the sun moves.
* **Performance**: mobile/coarse-pointer devices automatically get smaller textures, shadow maps, water
  reflection targets, lower MSAA and no bloom.
