"""Derive reviewable rear and lateral rolls from the accepted Knight_Roll.

Run in Blender after retarget-knight.py --knight-roll. Footwork stays separate.
The input library, including Knight_Roll channels, remains byte-for-byte intact;
only its forward-roll extras are augmented. No runtime files are changed.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('knight_retarget', ROOT / 'tools/retarget-knight.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def derive(input_path, output_path, evidence_path, equipment_path, audit=False):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    target, source = r.GLB(ROOT / 'assets/knight-v11.glb'), r.GLB(input_path)
    adapter = r.ArmedRoll(target, equipment_path)
    clip, duration = source.animation('Knight_Roll'), 1.4
    times = [i / 60 for i in range(84)] + [duration]
    writer = r.Writer([], [])
    writer.doc, writer.binary = copy.deepcopy(source.doc), bytearray(source.bin)
    names = ['Knight_Roll_Back', 'Knight_Roll_Left', 'Knight_Roll_Right']
    writer.doc['animations'] = [a for a in writer.doc['animations'] if a['name'] not in names]
    regions = []
    for body in adapter.bodies:
        regions.extend(body['names'][int(indices[int(r.np.argmax(weights))])]
                       for indices, weights in zip(body['indices'], body['weights']))
    masks = {s: r.np.asarray([n in {f'foot_{s}', f'toe_{s}'} for n in regions]) for s in ['L', 'R']}
    head_mask = r.np.asarray([n == 'head' for n in regions])
    shoulder_mask = r.np.asarray([n in {'clavicle_L', 'clavicle_R', 'chest'} for n in regions])

    def pose(t):
        local, _ = source.evaluate(clip, t)
        values = [[p.copy(), q.copy(), s.copy()] for p, q, s in target.rest]
        for n in r.MAPPING:
            values[target.by_name[n]] = [v.copy() for v in local[source.by_name[n]]]
        return values

    def measure(t, values):
        cloud = r.np.asarray(adapter.skin(r.world_from_trs(target, values))[0])
        return {'time': t, 'weighted_min_y_m': adapter.scale * (float(cloud[:, 1].min()) - adapter.floor),
                'helmet_min_y_m': adapter.scale * (float(cloud[head_mask, 1].min()) - adapter.floor),
                'shoulder_chest_min_y_m': adapter.scale * (float(cloud[shoulder_mask, 1].min()) - adapter.floor),
                'feet': {s: {'min_y_m': adapter.scale * (float(cloud[m, 1].min()) - adapter.floor),
                             'x': adapter.scale * float(cloud[m, 0].mean()),
                             'z': adapter.scale * float(cloud[m, 2].mean())} for s, m in masks.items()}}

    def free_window(metrics):
        runs, run = [], []
        for i, m in enumerate(metrics):
            # After ordinary negative-body-min grounding, not an authored lift.
            free = min(m['feet'][s]['min_y_m'] for s in ['L', 'R']) - min(0., m['weighted_min_y_m']) > .08
            if free and m['time'] < .8:
                run.append(i)
            elif run:
                runs.append(run)
                run = []
        if run:
            runs.append(run)
        best = max(runs, key=len) if runs else []
        return [times[best[2]], times[best[-3]]] if len(best) >= 7 else None

    def root_at(t):
        samples = clip['extras']['root_motion']['samples']
        i = 0
        while i < len(samples) - 2 and samples[i + 1][0] < t:
            i += 1
        a, b = samples[i:i + 2]
        u = max(0., min(1., (t - a[0]) / (b[0] - a[0])))
        return r.Vector([a[k] + (b[k] - a[k]) * u for k in [1, 2, 3]])

    originals = [pose(t) for t in times]
    forward_metrics = [measure(t, v) for t, v in zip(times, originals)]
    window = free_window(forward_metrics)
    if window is None:
        raise ValueError('Accepted forward roll has no measured free-foot interval for lateral turning')
    forward = next(a for a in writer.doc['animations'] if a['name'] == 'Knight_Roll')
    forward['extras']['root_motion'].update({'free_turn_window': window, 'support_foot': 'L',
        'free_turn_measurement': 'Both weighted boot minima after normal negative-body-min grounding exceed 8cm; longest interval inset 2 frames at each end'})
    evidence = {'input': str(input_path), 'input_sha256': source.sha256,
                'raw_ground_reference_y': 0, 'runtime_ground_correction_applied': False,
                'forward_channels_preserved': forward['channels'] == clip['channels'] and forward['samplers'] == clip['samplers'],
                'Knight_Roll': {'root_motion': {k: v for k, v in forward['extras']['root_motion'].items() if k != 'samples'},
                                'body_metrics': forward_metrics}}
    first, last = originals[0], originals[-1]
    # Reversing through the forward launch recreates a straight airborne dive.
    # Retain the compact .65s rear pose, then connect directly to its unchanged
    # .80s crouch. Root motion and the later carry recovery remain untouched.
    back_tuck = pose(r.curve_value(.65, [(0., duration), (.18, .84), (.8, 0.)]))
    pref = last[target.by_name['pelvis']][0]
    for name in names:
        frames, metrics = [], []
        sign = 1 if name.endswith('Left') else -1
        for t in times:
            if name.endswith('Back'):
                st = r.curve_value(t, [(0., duration), (.18, .84), (.8, 0.)])
                values = pose(st)
                if .65 < t < .8:
                    u = r.smoothstep((t - .65) / .15)
                    values = [[a[0].lerp(b[0], u), a[1].slerp(b[1], u).normalized(), a[2].lerp(b[2], u)]
                              for a, b in zip(back_tuck, first)]
                    # Interpolated local arm angles can sweep rigid gear through
                    # the folded legs. Reuse the existing physical palm solver
                    # only inside this connection, with unchanged end poses.
                    arm_weight = r.smoothstep((t - .65) / .02) * (1 - r.smoothstep((t - .77) / .03))
                    values, _ = adapter.adapt(values, t, duration, arm_weight)
                elif t > .8:
                    u = r.smoothstep((t - .8) / .6)
                    values = [[a[0].lerp(b[0], u), a[1].slerp(b[1], u).normalized(), a[2].lerp(b[2], u)]
                              for a, b in zip(first, last)]
                yaw = 0.
            else:
                values = pose(t)
                u = max(0., min(1., (t - window[0]) / (window[1] - window[0])))
                yaw = sign * math.pi / 2 * (r.smoothstep(u * 2) if u <= .5 else r.smoothstep((1 - u) * 2))
                turn = r.Quaternion((0, 1, 0), yaw)
                pi = target.by_name['pelvis']
                world = r.world_from_trs(target, values)
                parent_q = world[target.parent[pi]].to_quaternion().normalized()
                values[pi][1] = (parent_q.inverted() @ turn @ world[pi].to_quaternion().normalized()).normalized()
                values[pi][0] = pref + turn @ (values[pi][0] - pref)
            frames.append((t, values, yaw))
            metrics.append(measure(t, values))
        support = .8
        f0, fend = metrics[48]['feet']['L'], metrics[-1]['feet']['L']
        roots = []
        if name.endswith('Back'):
            landing = root_at(0) - root_at(duration)
            for t, m in zip(times, metrics):
                v = (root_at(r.curve_value(t, [(0., duration), (.18, .84), (.8, 0.)])) - root_at(duration)
                     if t < support else landing + r.Vector((f0['x'] - m['feet']['L']['x'], 0, f0['z'] - m['feet']['L']['z'])))
                roots.append([t, *v])
        else:
            direction = r.Quaternion((0, 1, 0), sign * math.pi / 2)
            finish = direction @ r.Vector((0, 0, 3.3))
            landing = finish + r.Vector((fend['x'] - f0['x'], 0, fend['z'] - f0['z']))
            seed_landing = direction @ root_at(support)
            for t, m in zip(times, metrics):
                v = (direction @ root_at(t) + (landing - seed_landing) * r.smoothstep(t / support)
                     if t < support else finish + r.Vector((fend['x'] - m['feet']['L']['x'], 0, fend['z'] - m['feet']['L']['z'])))
                roots.append([t, *v])
        root_meta = {'duration': duration, 'samples': roots, 'displacement': roots[-1][1:],
                     'horizontal_path_m': sum(math.hypot(b[1] - a[1], b[3] - a[3]) for a, b in zip(roots, roots[1:])),
                     'units': 'production-world meters; native trajectory, no path normalization',
                     'recovery_support_start': support, 'free_turn_window': free_window(metrics), 'support_foot': 'L',
                     'free_turn_measurement': 'Both weighted boot minima after normal negative-body-min grounding exceed 8cm; longest interval inset 2 frames at each end',
                     'recovery_method': 'measured left foot/toe dominant centroid held in native XZ; no authored Y lift'}
        ti = writer.add([[t] for t in times], 'SCALAR', True)
        samplers, channels = [], []
        for n in r.MAPPING:
            rows = []
            for _, v, _ in frames:
                q = r.quat_values(v[target.by_name[n]][1])
                if rows and sum(a * b for a, b in zip(q, rows[-1])) < 0:
                    q = [-x for x in q]
                rows.append(q)
            samplers.append({'input': ti, 'output': writer.add(rows, 'VEC4'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': source.by_name[n], 'path': 'rotation'}})
        samplers.append({'input': ti, 'output': writer.add([list(v[target.by_name['pelvis']][0]) for _, v, _ in frames], 'VEC3', True), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': source.by_name['pelvis'], 'path': 'translation'}})
        adaptation = {'source': 'accepted Knight_Roll complete equipped pose', 'equipment_hidden': False,
                      'whole_body_contact_lift_applied': False, 'visual_acceptance': 'pending full production pipeline',
                      'mode': 'time reverse with .18s preparation; .65-.80s direct tuck-to-crouch; .80s onward unchanged crouch-to-carry' if name.endswith('Back') else 'lateral turning shoulder-roll derivative; pelvis world Y only during measured free-foot interval; all child local curves unchanged'}
        writer.doc['animations'].append({'name': name, 'samplers': samplers, 'channels': channels,
                                          'extras': {'native_duration': duration, 'source_animation': 'Knight_Roll',
                                                     'root_motion': root_meta, 'adaptation': adaptation}})
        evidence[name] = {'root_motion': {k: v for k, v in root_meta.items() if k != 'samples'},
                          'body_metrics': metrics, 'equipment_frames': [],
                          'authored_yaw_samples': [[t, yaw] for t, _, yaw in frames]}
        writer.save(output_path)
        print(name, 'pose/root ready', 'free window', root_meta['free_turn_window'], flush=True)
        if audit:
            evidence[name]['equipment_frames'] = [adapter.audit(v, t) for t, v, _ in frames]
            print(name, {g: {'min_y_m': min(f[g]['min_y_m'] for f in evidence[name]['equipment_frames']),
                             'crossing_frames': sum(f[g]['body_triangle_crossings'] > 0 for f in evidence[name]['equipment_frames'])}
                         for g in ['sword', 'shield']}, flush=True)
        evidence_path.write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    evidence.update({'output': str(output_path), 'output_sha256': hashlib.sha256(output_path.read_bytes()).hexdigest(),
                     'clip_count': len(writer.doc['animations'])})
    evidence_path.write_text(json.dumps(evidence, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'assets/knight-motion-v16.glb')
    parser.add_argument('--output', type=Path, default=ROOT / '.asset-work/roll-v16/turning-candidate.glb')
    parser.add_argument('--evidence', type=Path, default=ROOT / '.asset-work/roll-v16/TURNING_CANDIDATE.json')
    parser.add_argument('--equipment', type=Path, default=ROOT / '.asset-work/retarget/EQUIPMENT_BINDING.json')
    parser.add_argument('--audit', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    derive(args.input.resolve(), args.output.resolve(), args.evidence.resolve(), args.equipment.resolve(), args.audit)
