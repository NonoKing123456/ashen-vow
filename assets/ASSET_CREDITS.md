# Character asset provenance

## Knight by Patch / anymove

- Creator: Patch, made with anymove (AI-generated mesh and motion).
- Authoritative catalogue: https://patch.gg/create/toolbox/assets/anymove:knight
- Authoritative project: https://github.com/patch-gg/anymove
- Licence: CC0 1.0 Universal, explicitly stated in the catalogue record for this model. https://creativecommons.org/publicdomain/zero/1.0/
- Public rendered GLB resource: https://assets.patchusercontent.com/sha256/5b9423de432bd50be3e8dde47c969043af3b7d654bb045d4e7820015f8fb1ff3/knight.glb
- Retrieved file: 9,711,192 bytes; one coherent 59,281-triangle SkinnedMesh, 22 bones, UVs, base-color, normal and metallic-roughness textures.
- Original clips: Idle, Walk, Walk_Root, Run, Run_Root, Attack, Hit, Jump, Kick.

The base character mesh and its original animation are third-party assets. They
are not represented as an original sculpture by this project. This project adds
independent skeleton instances, variant materials, weapons, equipment sockets,
authored sword motion on the actual bones, gameplay, environment, sound and UI.
The original unarmed Attack clip is not used as a compressed sword attack.

The rejected AutoSprite Hooded Blade downloaded during evaluation is not used in
the game or redistributed with this release.

## Engine

Three.js r128 and its GLTFLoader: https://github.com/mrdoob/three.js/tree/r128
MIT licence retained in ../vendor/LICENSE.txt.

## Rain-night release: locally served optimized asset

`knight-v11.glb` is a 3,386,020-byte derivative of the CC0 Knight above.
All 59,281 triangles, 22 bones, skin weights and nine clips are retained.
Only its embedded JPEG images are resampled to at most 1024 pixels and
re-encoded at quality 91. No image is used as a substitute for a 3D mesh.

## Stone surfaces — Poly Haven, CC0

- Cobblestone Floor 08 — Rob Tuytel: https://polyhaven.com/a/cobblestone_floor_08
- Stone Brick Wall 001 — https://polyhaven.com/a/stone_brick_wall_001
- Licence: CC0 1.0 Universal. https://polyhaven.com/license
- API download records are retained in `surfaces/source.json`.
- Original 1K JPEG diffuse, OpenGL normal and roughness maps are locally
  redistributed, re-encoded for delivery at quality 86 (color/roughness) and
  90 (normal). Surface scale is projected in world units after mesh transforms.

Rain, ripples, wet-patch shapes, foliage geometry and sound design are authored
by this project. Puddle reflections are environment-map reflections; this
release does not implement screen-space or planar reflections.
