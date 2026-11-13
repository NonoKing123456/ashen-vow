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
source-calibrated sword motion, an equipped roll adaptation, gameplay, environment, sound and UI.
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

## Knight sword and roll motion — Quaternius Standard libraries

`knight-motion-v15.glb` is an animation-only derivative of these specific
Standard downloads, each supplied with a CC0 1.0 Universal dedication in its
original `License.txt`. The copied dedication is retained in
`licenses/Quaternius-Standard-CC0.txt`.

- Universal Animation Library Standard: https://quaternius.itch.io/universal-animation-library
- Universal Animation Library 2 Standard: https://quaternius.itch.io/universal-animation-library-2
- Author pack pages: https://quaternius.com/packs/universalanimationlibrary.html and https://quaternius.com/packs/universalanimationlibrary2.html
- UAL1 archive SHA256: `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`
- UAL2 archive SHA256: `4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68`

These credits concern those exact Standard archives, not all products or later
licence editions sold by Quaternius. The original archives/mannequins and full
libraries are not redistributed here.

The project retargets selected full-length clips from the original 65-joint
rigs to the existing 22-joint knight without changing its bone lengths. It
calibrates T/A rest poses and the opposite palm transverse axes. Source root
trajectories remain as animation metadata; collision-aware navigation consumes
their scaled displacement. `Armed_Roll` preserves the original Roll trunk, hip,
leg and root channels while adapting both arms for the physical sword and
shield. This v15 library is retained as the reproducible seed. The converter
is in `tools/retarget-knight.py`.

`knight-motion-v16.glb` retains those 19 clips and adds project-authored
derivatives of the Roll: an early knee tuck, lower shoulder roll, protected
head, timed rear roll and lateral turning rolls. The lateral derivatives turn
the equipped forward pose while the feet are free, then restore the original
facing before support; they are not independent side-roll motion capture.
The derivation is in `tools/derive-knight-rolls.py`.

`knight-footwork-v16.glb` contains project-authored left/right step-together
and backward foot trajectories, solved against the existing fixed-length leg
chains and the common sword/shield carry. They are authored animation rather
than motion capture. `tools/bake-armed-footwork.cjs` builds these three clips.
Native travel, sole contact timing and recovery support are retained in
animation metadata for the shared runtime and development review page.
