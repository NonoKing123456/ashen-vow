# Knight motion rebuild

`retarget-knight.py` creates the motion-only `assets/knight-motion-v15.glb`.
It does not change the running character, controller or contact solver.

## Inputs and command

Use Blender 4.4 and Node 20 or newer. Put these unmodified official Standard
downloads in `.asset-work/quaternius-originals/`:

- `Universal Animation Library[Standard].zip`
- `Universal Animation Library 2[Standard].zip`

Their exact ZIP and source GLB hashes are pinned in
`tools/retarget-source-manifest.json`. The tool validates those hashes and
extracts only the required Standard/RM GLBs and their original CC0 License.txt
at fixed local destinations. Source ZIPs are not repository assets.

From the project root, run:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --python tools/retarget-knight.py -- --fps 60
```

The required tracked inputs are `tools/retarget-knight.py`,
`tools/export-equipment-binding.cjs`, `tools/retarget-source-manifest.json`,
`characters.js`, `vendor/three.min.js`, `vendor/GLTFLoader.js` and
`assets/knight-v11.glb`. No prebuilt motion GLB, ignored equipment snapshot or
ignored helper script is required. The exporter disables animation and loads
the character with `motionUrl:null`, so the build has no output-to-input cycle.

The exporter reads actual production closed-hand skin weights, mesh triangles,
equipment geometry and palm attachment transforms. Its automatically generated
`EQUIPMENT_BINDING.json` stays under `.asset-work/retarget/`. An explicit
`--equipment path` can reuse an immutable snapshot for investigation; the
default always regenerates it from the tracked production character.

`--inspect` writes rest-frame calibration without baking an asset. The converter
also writes rest mapping, source/target trajectories, summary, phase hints and
sampled equipment audit under `.asset-work/retarget/`. Phase hints describe
motion extrema; they are not validated gameplay contact windows.

## Conversion contract

- All 22 target node names and their original rest TRS remain exact. The GLB
  contains no mesh, skin, image or texture. Every clip covers all 22 rotations
  and pelvis translation.
- World head-to-tail directions and semantic rest frames calibrate the source
  T-pose to the target A-pose. Hand calibration uses the actual target mesh:
  source index/thumb +Z corresponds to target index/thumb -Z. Foot-to-toe
  horizontal direction confirms forward +Z. Tracks are not merely renamed.
- Bone offsets and lengths stay fixed. Scale is the source-to-target leg-chain
  ratio. Source hips vertical motion and its local horizontal sway remain.
- Only source **root-node** world XZ, measured from the reference rest root,
  is removed from the pelvis. This also removes nonzero initial root offsets
  in split RM clips. The complete root curve relative to clip start remains
  in `animation.extras.root_motion.samples` as `[time, x, y, z]` in target
  meters, alongside native duration, displacement and horizontal path length.
  The controller must consume that travel through navigation.
- Original clip names and full native durations remain. `Sword_Dash` is a
  charging motion with the blade trailing; its name does not prove a forward
  stab. C, combos and heavy combo remain independent review resources.
- `Armed_Roll` is a separate 1.4666667-second variant. The original `Roll`
  remains available. Only six upper-arm/forearm/hand rotation channels are
  adapted with geometry-calibrated two-bone IK and offline curve smoothing.
  All 17 other channels, the complete root-motion metadata and the first/last
  arm poses are identical to `Roll`. There is no body-height lift, hidden gear,
  additional rigid-body somersault or runtime standing-carry layer in this bake.

## Frozen offline result

`tools/retarget-output-manifest.json` records the frozen output, input/tool
hashes, 19 clip durations and limited offline checks. On Windows with Blender
4.4, an isolated rebuild containing only the tracked inputs above and the two
original ZIPs produced a byte-identical 836,680-byte asset:

`4fc1dacf6dfbb67417002d18fa44d3aad72377de3518a80cbb0383835737d001`

The armed-roll audit sampled 90 poses using the production 37,141-vertex
weighted body and actual rigid gear. It found zero tested blade-steel/body
and shield-surface/body triangle crossings; minima above raw Y=0 were 0.15443 m
for all sword vertices and 0.00980 m for all shield vertices. Intended hilt/grip
and shield strap contacts were excluded from body crossing checks. Nearest
surface-normal "inside" probes are unreliable on layered/open armour and do
not constitute a solid-volume proof. These samples do not guarantee every
intermediate pose or terrain contact.

Six-stage side and three-quarter previews show narrower elbows, the shield
outside the left shoulder/knee and a diagonal trailing sword. The full source
dive, shoulder rotation, leg turnover and squat recovery remain. The middle
still has an obvious supine leg-raised phase; the large sword and round shield
prevent a true two-arm knee embrace. The raw source cape intersects the body
and floor. The shield has a thin raw ground margin. Native endpoint poses
still require the production carry/recovery blend. Those are observed limits,
not a release acceptance claim. Runtime full-speed, contact, cloth and real-level
acceptance belong to the production review required by AGENTS.md.

## Body-authored knight shoulder roll candidate (v16)

Build the separate candidate from the tracked v15 seed and current production
geometry, without needing the original ZIPs again:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --python tools/retarget-knight.py -- --knight-roll --audit
```

This writes `assets/knight-motion-v16.glb`: the original 19 clips plus the new
`Knight_Roll`, duration 1.4 seconds. It does not overwrite v15 or modify runtime.
`--output` can redirect it; a fresh default production geometry export rebuilt
the same 879,164-byte output without an ignored equipment snapshot or helper.

This variant deliberately changes the body before adapting the arms. Its
retimed preparation, early bilateral knee tuck, lower launch arc, transient
left-shoulder bank and cervical tuck replace the straight airborne dive. It
does not claim the 17-channel preservation contract of `Armed_Roll`. Spine
local rotations still come from the source; their world trajectory changes
through the edited pelvis and phase mapping. Bone lengths remain fixed.

The root curve has a 3.3m forward endpoint and a measured horizontal path
length of 3.340783924m. Starting at .80s, it compensates the source left support
foot centroid in XZ. The tested native curve holds that centroid to 0mm X
and 7.43mm Z range through the remainder. A controller that rescales by
`lunge / horizontal_path_m` must use the native path length to preserve that
calibration; treating path length as forward displacement changes the result.

`tools/knight-roll-v16-manifest.json` records the source, output, limited tests
and observed limits. At 60Hz/85 samples, tested sword/body and shield/body
triangle crossings were zero; all sword vertices stayed above raw Y=.1803m
and shield vertices above .1016m. The head-weighted helmet region stayed above .1627m. The old
14 straight-knee/horizontal-trunk frames became zero under the stated joint
criterion (horizontal trunk |Y|<.55; both leg-segment dots>.85). Eight sampled boot-versus-torso checks found no triangle crossing.

Raw body support still reaches Y=-.0730m at seat/foot contact, requiring the
normal weighted-body ground stage. The unchanged raw cape still needs runtime
cloth contact. No body contact lift or equipment hiding is baked. The six-stage
side/quarter poses are only an offline preflight; full speed, carry handoff,
wall/corner fitting and real-level control must be reviewed in production.

Append the three directional derivatives after that build:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' --background --python tools/derive-knight-rolls.py -- --output assets/knight-motion-v16.glb --audit
```

The resulting library contains 23 clips. The original 19 animation data and
`Knight_Roll` channels remain unchanged; the forward extras gain a measured
free-foot window. `Knight_Roll_Back` reverses the accepted pose sequence with
.18s preparation, a direct .65–.80s tucked-pose-to-crouch connection, and .60s
crouch-to-carry recovery. The eight 60Hz connecting poses retain folded legs
instead of replaying the forward launch in reverse. The existing physical palm
solver adjusts equipped arms only within this connection; .80s onward is
unchanged. Its root samples remain identical to the earlier rear derivative.
`Knight_Roll_Left` and `Knight_Roll_Right` are lateral turning shoulder-roll
derivatives, not independent barrel-roll captures. They retain every equipped
child-bone local curve and only turn the pelvis in world Y during the measured
.1833–.6000s free-foot window. The turn returns to zero before feet recover
support; no standing pivot unwind is required. Peak source Y speed is about
648 degrees/s and remains subject to full-speed production review.

Directional roots use native production meters and compensate the actual
left boot/toe-dominant centroid from .80s onward. The final rear endpoint is
approximately (-.0011, 0, -3.3087)m, including its measured recovery adjustment;
lateral endpoints are (+/-3.3, 0, 0)m. All four clips are 1.4s long. Free-turn
windows are absolute native seconds: front/left/right [.1833,.6000], rear
[.3667,.6667]. Both weighted boot minima exceed 8cm above the ordinary
body-grounding plane through these intervals, with two 60Hz samples removed
from each end. This measures release from foot support, not obstacle clearance.

The generator writes its detailed all-frame geometry and foot measurements to
`.asset-work/roll-v16/TURNING_CANDIDATE.json`. Run both build commands from the
tracked v15 seed for a clean deterministic rebuild; repeated derivation into an
already derived input leaves unused previous buffers and is unnecessary.
