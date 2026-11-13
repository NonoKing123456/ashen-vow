# 灰烬誓约 · 雨夜誓约 / THE LAST BELL

A compact, original third-person action level: arrival court, two sentinels,
optional chapel checkpoint, opening gate and two-phase Warden. Browser-local
save and settings; no account or backend is required.

## Standalone project

This repository contains only Ashen Vow. It has its own source, assets, tests
and deployment; it does not use the V System Visualizer repository.

Run `npm start` and open http://127.0.0.1:8080. Run `npm test` for the 42 checks.
There are no package dependencies to install. For GitHub Pages, publish the
`main` branch root directory. All resource paths are relative.

## Rain-night release (v11)

- Locally served CC0 photographic stone surfaces: color, normal and roughness
  with world-scale UV projection. Wet surfaces, world-space rain, impact
  ripples, ivy silhouettes and sheltered chapel ambience.
- Posture now accumulates from heavy strikes and timed guards. A break produces
  a golden vulnerability cue. Approach within 1.9 meters and press F to thrust
  for 100 damage. The thrust still needs real blade contact and only hits its
  chosen target. The second sentinel alternates cuts with a delayed thrust.
- Camera collision uses scene obstacle bounds instead of traversing all scenery
  triangles. Adaptive resolution slowly adjusts between 72% and 100%, with high
  and low settings retained. No universal frame-rate claim is made.
- Character transfer reduced from 9.71 MB to 3.39 MB by resampling embedded
  textures; mesh, skin weights, skeleton and all clips are preserved. All runtime
  assets are now served from the same deployment. No CDN is required to play.

## Actual character art

CC0 Knight by Patch/anymove: a coherent 59,281-triangle weighted mesh, 22 bones,
UVs and PBR maps. This is a licensed base asset, not an original sculpture.
Idle, Walk, Run and Hit use source animation; weapon strikes and the new
execution thrust are authored on its weighted bones. The original unarmed
Attack clip is not repurposed as a sword swing. Full provenance is in
`assets/ASSET_CREDITS.md`.

## Controls

WASD move; Shift sprint; drag orbit; wheel zoom. J / left click three-cut chain;
K heavy; Space directional roll; Q lock; L / right click guard (first 0.16 s is
a timed guard); E heal; F checkpoint / gate / exposed-target execution.
Escape pauses; R retries after defeat. Touch controls are available.

## Validation

Serve this directory over HTTP. Run:

```
node --test feel.test.cjs play.test.cjs camera.test.cjs asset.test.cjs
```

42 tests cover swept-blade and height collision, attack/guard/roll timing,
camera obstacle bounds, guarded posture breaks, contextual execution, healing
interruptions, checkpoint persistence, a control-only complete level through
both boss phases, and actual production-GLB animation/blade contacts.

Asset tests decode the real GLB mesh, bones and clips with the production
GLTFLoader; only image decoding is stubbed in Node. Controller tests explicitly
use a small articulated sword fixture. Browser QA checks the actual render,
keyboard controls and native gameplay; it never modifies game HP or positions.

## Files

`game.js`: controller and level flow. `feel.js`: hit/timing/camera rules.
`characters.js` and `motion.js`: actual mesh and bones. `level.js`, `surfaces.js`
and `weather.js`: environment. `render.js`, `audio.js`, `ui.js`: presentation.

First load transfers about 5.2 MB of model and surface images plus scripts.
WebGL hardware acceleration is recommended. World architecture remains
procedurally authored; it is not a scanned environment or a commercial game.
