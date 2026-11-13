# Ashen Vow development

Maintain one coherent, playable action demo. Character fundamentals, equipment,
collision and presentation must meet the same standard before adding polish.

## Ownership of transforms

- `navigation.js` owns collision-aware horizontal movement, including crowd
  separation. Drive animation from actual displacement, not requested velocity.
- `locomotion.js` owns source-calibrated phase and landing events. Read GLB
  interleaved attributes through accessors, never packed-array assumptions.
- `motion.js` blends the source pose before applying constraints.
- `rig-constraints.js` owns shared anatomical holds and body/equipment/ground
  contacts. Solve the palm contact, not the wrist origin. Keep action recovery
  connected to the same carry stance used by locomotion.
- `characters.js` owns physical geometry, attachment conventions and skin
  probes. Shields require a solid back and a grip; material flags alone do not
  supply missing geometry.

## Required release acceptance

Every release includes a production character baseline and real-level smoke
check, including releases centered on lighting, scenery or UI. Character or
collision changes require the complete matrix below.

1. Run the relevant asset, animation, equipment, navigation and contact checks,
   then `npm test` before every release.
2. Use `/review.html` with the production GLB under neutral lighting. Review
   front, back and side views; watch a full movement cycle and inspect action
   anticipation, contact and recovery. Include idle, walk, run, backward and
   lateral motion, guard, strikes, roll and recovery.
3. Inspect the wall and corner cases and then the real night level. Check both
   appearance and control handoff. Keep discoveries, chapel, gate, boss and bell
   reachable with the production body radius.
4. Check opaque equipment backs, actual grasp, feet, cloth and equipment against
   terrain and the weighted body. Never hide equipment to cover an intersection.
   Rule fixtures are not visual acceptance;
   passing test counts are not evidence of animation quality.
5. Save representative screenshots and report observed limits honestly. Do not
   claim universal performance or the absence of all possible intersections.

The review page is a development tool. Keep its controls out of the game menus.
Deploy the same verified source snapshot and preserve the existing public URL.
