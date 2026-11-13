"""Offline, deterministic glTF skeleton retargeter. Run with Blender 4.4 Python.

First inspect the measured rest frames:
  blender --background --python tools/retarget-knight.py -- --inspect

Rebuild all 19 clips, including Armed_Roll, from the two pinned official
Standard ZIPs placed in .asset-work/quaternius-originals:
  blender --background --python tools/retarget-knight.py -- --fps 60
The tool extracts only the required GLBs/License.txt at fixed local paths and
calls tools/export-equipment-binding.cjs to capture current production geometry.
Node >=20 is required for that geometry-only snapshot. No source ZIP is shipped.

This tool operates on glTF node/accessor data in the original Y-up frame. Blender
supplies mathutils; its importer/exporter does not rewrite the production rig.
No running game files are modified. Meshes, images and finger tracks are omitted
from the generated motion-only GLB.
"""
from __future__ import annotations

import argparse
import bisect
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import zipfile

from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.asset-work' / 'retarget'
SOURCES = {
    'UAL1': ROOT / '.asset-work/quaternius-originals/universal-animation-library/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb',
    'UAL2': ROOT / '.asset-work/quaternius-originals/universal-animation-library-2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb',
}
MAPPING = {
    'pelvis': 'pelvis', 'spine1': 'spine_01', 'spine2': 'spine_02',
    'chest': 'spine_03', 'neck': 'neck_01', 'head': 'Head',
    'clavicle_L': 'clavicle_l', 'upperarm_L': 'upperarm_l',
    'forearm_L': 'lowerarm_l', 'hand_L': 'hand_l',
    'clavicle_R': 'clavicle_r', 'upperarm_R': 'upperarm_r',
    'forearm_R': 'lowerarm_r', 'hand_R': 'hand_r',
    'thigh_L': 'thigh_l', 'shin_L': 'calf_l', 'foot_L': 'foot_l', 'toe_L': 'ball_l',
    'thigh_R': 'thigh_r', 'shin_R': 'calf_r', 'foot_R': 'foot_r', 'toe_R': 'ball_r',
}
CHILD = {
    'pelvis': 'spine1', 'spine1': 'spine2', 'spine2': 'chest',
    'chest': 'neck', 'neck': 'head',
    'clavicle_L': 'upperarm_L', 'upperarm_L': 'forearm_L', 'forearm_L': 'hand_L',
    'clavicle_R': 'upperarm_R', 'upperarm_R': 'forearm_R', 'forearm_R': 'hand_R',
    'thigh_L': 'shin_L', 'shin_L': 'foot_L', 'foot_L': 'toe_L',
    'thigh_R': 'shin_R', 'shin_R': 'foot_R', 'foot_R': 'toe_R',
}
CLIPS = {
    'UAL1': ['Sword_Idle', 'Sword_Attack', 'Roll', 'Hit_Chest', 'Hit_Head', 'Death01'],
    'UAL2': ['Idle_Shield_Loop', 'Idle_Shield_Break', 'Shield_OneShot', 'Sword_Block', 'Sword_Dash',
             'Sword_Regular_A', 'Sword_Regular_A_Rec', 'Sword_Regular_B',
             'Sword_Regular_B_Rec', 'Sword_Regular_C', 'Sword_Regular_Combo', 'Sword_Heavy_Combo'],
}


def ensure_sources():
    manifest = json.loads((ROOT / 'tools/retarget-source-manifest.json').read_text(encoding='utf-8'))
    source_directory = ROOT / manifest['source_directory']
    for label, pack in manifest['packs'].items():
        destination = SOURCES[label].parent
        required = [(destination / name, digest) for name, digest in pack['files'].items()]
        license_path = destination.parent / 'License.txt'
        if any(not path.exists() for path, _ in required) or not license_path.exists():
            archive = source_directory / pack['zip']
            if not archive.exists():
                raise FileNotFoundError(f'Place the original official Standard ZIP at {archive}')
            if hashlib.sha256(archive.read_bytes()).hexdigest() != pack['sha256']:
                raise ValueError(f'Source ZIP differs from the reviewed pinned pack: {archive.name}')
            with zipfile.ZipFile(archive) as contents:
                for path, _ in required:
                    members = [name for name in contents.namelist() if name.endswith('/Unreal-Godot/' + path.name)]
                    if len(members) != 1:
                        raise ValueError(f'Expected one original {path.name} in {archive.name}')
                    # Never extract user-supplied archive paths. Write only the
                    # predefined workspace targets, avoiding archive traversal.
                    if not path.resolve().is_relative_to(ROOT.resolve()):
                        raise ValueError('Unexpected source extraction destination')
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(contents.read(members[0]))
                members = [name for name in contents.namelist() if name.lower().endswith('/license.txt')]
                if len(members) != 1:
                    raise ValueError('The pinned source pack must contain its original license')
                license_path.write_bytes(contents.read(members[0]))
        for path, digest in required:
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError(f'Original source GLB hash mismatch: {path}')
    return manifest


def gltf_quat(values):
    x, y, z, w = values
    return Quaternion((w, x, y, z)).normalized()


def quat_values(q):
    q = q.normalized()
    return [q.x, q.y, q.z, q.w]


def trs(node):
    if 'matrix' in node:
        a = node['matrix']
        return Matrix([[a[c * 4 + r] for c in range(4)] for r in range(4)]).decompose()
    return (Vector(node.get('translation', [0, 0, 0])),
            gltf_quat(node.get('rotation', [0, 0, 0, 1])),
            Vector(node.get('scale', [1, 1, 1])))


class GLB:
    def __init__(self, path):
        self.path = Path(path)
        raw = self.path.read_bytes()
        if struct.unpack_from('<III', raw)[:2] != (0x46546C67, 2):
            raise ValueError(f'Not a glTF 2 GLB: {path}')
        self.sha256 = hashlib.sha256(raw).hexdigest()
        self.bin = b''
        offset = 12
        while offset < len(raw):
            length, kind = struct.unpack_from('<II', raw, offset)
            payload = raw[offset + 8:offset + 8 + length]
            if kind == 0x4E4F534A:
                self.doc = json.loads(payload)
            elif kind == 0x004E4942:
                self.bin = payload
            offset += length + 8
        self.nodes = self.doc['nodes']
        self.by_name = {node.get('name', f'node_{i}'): i for i, node in enumerate(self.nodes)}
        self.parent = {child: i for i, node in enumerate(self.nodes) for child in node.get('children', [])}
        self.rest = [trs(node) for node in self.nodes]
        self._accessor = {}

    def accessor(self, index):
        if index in self._accessor:
            return self._accessor[index]
        a = self.doc['accessors'][index]
        if 'sparse' in a:
            raise ValueError('Sparse accessors require an explicit decoder; refusing a packed assumption')
        view = self.doc['bufferViews'][a['bufferView']]
        fmt, width = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
                      5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}[a['componentType']]
        size = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        stride = view.get('byteStride', size * width)
        start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        values = [struct.unpack_from('<' + fmt * size, self.bin, start + i * stride)
                  for i in range(a['count'])]
        self._accessor[index] = values
        return values

    def evaluate(self, animation=None, time=0.0):
        values = [[p.copy(), q.copy(), s.copy()] for p, q, s in self.rest]
        if animation:
            for channel in animation['channels']:
                target = channel['target']
                if target['path'] not in ('translation', 'rotation', 'scale'):
                    continue
                sampler = animation['samplers'][channel['sampler']]
                times = self.accessor(sampler['input'])
                data = self.accessor(sampler['output'])
                interpolation = sampler.get('interpolation', 'LINEAR')
                if interpolation not in ('LINEAR', 'STEP'):
                    raise ValueError(f'Unsupported {interpolation} sampler; refusing silent resampling')
                keys = [v[0] for v in times]
                k = max(0, min(len(keys) - 2, bisect.bisect_right(keys, time) - 1))
                u = max(0., min(1., (time - keys[k]) / max(1e-12, keys[min(k + 1, len(keys) - 1)] - keys[k])))
                if interpolation == 'STEP':
                    u = 0.
                lo, hi = data[k], data[min(k + 1, len(data) - 1)]
                if target['path'] == 'rotation':
                    value = gltf_quat(lo).slerp(gltf_quat(hi), u).normalized()
                    slot = 1
                else:
                    value = Vector(lo).lerp(Vector(hi), u)
                    slot = 0 if target['path'] == 'translation' else 2
                values[target['node']][slot] = value
        world = [None] * len(self.nodes)

        def resolve(index):
            if world[index] is None:
                local = Matrix.LocRotScale(*values[index])
                world[index] = resolve(self.parent[index]) @ local if index in self.parent else local
            return world[index]
        for i in range(len(self.nodes)):
            resolve(i)
        return values, world

    def animation(self, name):
        return next(a for a in self.doc.get('animations', []) if a.get('name') == name)


def position(world, asset, name):
    return world[asset.by_name[name]].translation.copy()


def describe(asset):
    _, world = asset.evaluate()
    joints = asset.doc['skins'][0]['joints']
    result = []
    for i in joints:
        node = asset.nodes[i]
        matrix = world[i]
        name = node.get('name')
        result.append({
            'name': name, 'node': i,
            'parent': asset.nodes[asset.parent[i]].get('name') if i in asset.parent else None,
            'head_world': list(matrix.translation),
            'rest_matrix_world': [list(row) for row in matrix],
            'local_translation': list(asset.rest[i][0]),
            'local_rotation_xyzw': quat_values(asset.rest[i][1]),
            'local_scale': list(asset.rest[i][2]),
        })
    return result


def inspect(target, sources):
    WORK.mkdir(parents=True, exist_ok=True)
    _, tw = target.evaluate()
    report = {'status': 'rest inspection, not visual acceptance',
              'target': {'path': str(target.path), 'sha256': target.sha256, 'bones': describe(target)},
              'sources': {}, 'mapping': [], 'method': {
                  'coordinates': 'glTF original right-handed Y-up world; derive yaw from left/right hip landmarks; no Blender import/export axis rewrite',
                  'orientations': 'Semantic head-tail frames calibrated per joint, then target local rotations reconstructed through the actual target parent hierarchy; not renamed quaternion tracks',
                  'translations': 'Target bind joint offsets/limb lengths remain fixed; pelvis displacement is rescaled by mean hip-knee-ankle ratio; export XZ in-place and preserve Y',
                  'motion_metadata': 'Original hips/root trajectory, displacement, path length and hand/feet trajectories retained outside the in-place GLB',
              }}
    for label, source in sources.items():
        _, sw = source.evaluate()
        _, tpose = source.evaluate(source.animation('A_TPose'), 0.)
        report['sources'][label] = {'path': str(source.path), 'sha256': source.sha256,
                                    'bones': describe(source), 'tpose_world_heads': {
                                        name: list(position(tpose, source, name)) for name in MAPPING.values()}}
        if label != 'UAL1':
            continue
        lengths = []
        for target_name, source_name in MAPPING.items():
            child = CHILD.get(target_name)
            row = {'target': target_name, 'source': source_name,
                   'target_head_world': list(position(tw, target, target_name)),
                   'source_head_world': list(position(sw, source, source_name))}
            if child:
                target_delta = position(tw, target, child) - position(tw, target, target_name)
                source_delta = position(sw, source, MAPPING[child]) - position(sw, source, source_name)
                row.update(target_child=child, source_child=MAPPING[child], target_length=target_delta.length,
                           source_length=source_delta.length, target_direction=list(target_delta.normalized()),
                           source_direction=list(source_delta.normalized()))
                if target_name.startswith(('thigh_', 'shin_')):
                    lengths.append(target_delta.length / source_delta.length)
            report['mapping'].append(row)
        report['mean_segment_ratio'] = sum(lengths) / len(lengths)
        target_chain = sum(r['target_length'] for r in report['mapping'] if r['target'].startswith(('thigh_', 'shin_')))
        source_chain = sum(r['source_length'] for r in report['mapping'] if r['target'].startswith(('thigh_', 'shin_')))
        report['mean_leg_scale'] = target_chain / source_chain
    path = WORK / 'REST_MAPPING.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'rest_report': str(path), 'leg_scale': report['mean_leg_scale'],
                      'mapping': [{k: r[k] for k in ('target', 'source', 'target_length', 'source_length', 'target_direction', 'source_direction') if k in r}
                                  for r in report['mapping']]}, ensure_ascii=False, indent=2))
    return report


def frame(primary, secondary):
    """Right-handed semantic frame: +Y towards the child, +Z secondary hint."""
    y = primary.normalized()
    z = secondary - y * secondary.dot(y)
    if z.length < 1e-6:
        alternative = Vector((0, 1, 0)) if abs(y.y) < .8 else Vector((1, 0, 0))
        z = alternative - y * alternative.dot(y)
    z.normalize()
    x = y.cross(z).normalized()
    z = x.cross(y).normalized()
    return Matrix((x, y, z)).transposed().to_quaternion().normalized()


def angle_deg(a, b):
    # Double-precision normalization avoids mathutils float32 acos noise when
    # comparing two effectively identical unit directions.
    la = math.sqrt(sum(float(v) ** 2 for v in a))
    lb = math.sqrt(sum(float(v) ** 2 for v in b))
    return math.degrees(math.acos(max(-1., min(1., sum(float(x) * float(y) for x, y in zip(a, b)) / (la * lb)))))


def flat_forward(asset, world, names):
    v = sum((position(world, asset, toe) - position(world, asset, foot) for foot, toe in names), Vector())
    v.y = 0
    if v.length < 1e-6:
        raise ValueError('Foot-to-toe forward is degenerate')
    return v.normalized()


def calibration(target, source):
    _, tw = target.evaluate()
    _, sw = source.evaluate(source.animation('A_TPose'), 0.)
    tf = flat_forward(target, tw, [('foot_L', 'toe_L'), ('foot_R', 'toe_R')])
    sf = flat_forward(source, sw, [('foot_l', 'ball_l'), ('foot_r', 'ball_r')])
    yaw = math.atan2(sf.cross(tf).y, sf.dot(tf))
    alignment = Quaternion((0, 1, 0), yaw)
    target_left = position(tw, target, 'thigh_L') - position(tw, target, 'thigh_R')
    source_left = position(sw, source, 'thigh_l') - position(sw, source, 'thigh_r')
    if (alignment @ source_left).dot(target_left) <= 0:
        raise ValueError('Toe-derived forward conflicts with anatomical left/right; refusing a mirrored retarget')
    local_frames = {}
    corrections = {}
    frame_report = {}
    for tn, sn in MAPPING.items():
        ti, si = target.by_name[tn], source.by_name[sn]
        tq, sq = tw[ti].to_quaternion().normalized(), sw[si].to_quaternion().normalized()
        if tn.startswith('hand_'):
            side = sn[-1]
            primary = source.rest[source.by_name[f'middle_01_{side}']][0].normalized()
            across = (source.rest[source.by_name[f'index_01_{side}']][0]
                      - source.rest[source.by_name[f'pinky_01_{side}']][0])
            across -= primary * across.dot(primary)
            across.normalize()
            # Source knuckles establish its palm plane. The production knight
            # has no finger bones: measured original mesh shows distal +Y,
            # index/thumb on -Z, pinky on +Z and inward palm normal +X.
            # UAL has index/thumb +Z and inward palm -X: the two raw hand bone
            # frames differ by a half turn around the distal axis. This is a
            # semantic rest-frame calibration, independent of any weapon prop.
            fs = frame(primary, across.cross(primary))
            ft = frame(Vector((0, 1, 0)), Vector((1, 0, 0)))
            primary_target = Vector((0, 1, 0))
            primary_source = primary
        else:
            child = CHILD.get(tn)
            primary_target = ((tw[ti].inverted() @ position(tw, target, child)) if child else Vector((0, 1, 0)))
            if child:
                primary_source = sw[si].inverted() @ position(sw, source, MAPPING[child])
            elif tn.startswith('toe_'):
                primary_source = sw[si].inverted() @ position(sw, source, f'ball_leaf_{sn[-1]}')
            else:
                primary_source = Vector((0, 1, 0))
            secondary = Vector((0, 1, 0)) if tn.startswith(('foot_', 'toe_')) else tf
            source_secondary = Vector((0, 1, 0)) if tn.startswith(('foot_', 'toe_')) else sf
            ft = frame(primary_target, tq.inverted() @ secondary)
            fs = frame(primary_source, sq.inverted() @ source_secondary)
        corrections[tn] = (fs @ ft.inverted()).normalized()
        local_frames[tn] = {'source': fs, 'target': ft}
        frame_report[tn] = {'source': sn, 'source_primary_local': list(primary_source.normalized()),
                            'target_primary_local': list(primary_target.normalized()),
                            'source_semantic_frame_xyzw': quat_values(fs),
                            'target_semantic_frame_xyzw': quat_values(ft),
                            'local_axis_correction_xyzw': quat_values(corrections[tn])}
        if tn.startswith('hand_'):
            frame_report[tn]['anatomical_evidence'] = {
                'source_index_thumb_axis_local': [0, 0, 1], 'target_index_thumb_axis_local': [0, 0, -1],
                'source_palm_inward_axis_local': [-1, 0, 0], 'target_palm_inward_axis_local': [1, 0, 0],
                'target_mesh_audit': 'TARGET_HAND_AXIS_SOLID.png; orange marks +Z/pinky side',
            }
    target_leg = sum((position(tw, target, CHILD[n]) - position(tw, target, n)).length
                     for n in ['thigh_L', 'shin_L', 'thigh_R', 'shin_R']) / 2
    source_leg = sum((position(sw, source, MAPPING[CHILD[n]]) - position(sw, source, MAPPING[n])).length
                     for n in ['thigh_L', 'shin_L', 'thigh_R', 'shin_R']) / 2
    return {'alignment': alignment, 'scale': target_leg / source_leg,
            'corrections': corrections, 'source_reference_world': sw, 'target_rest_world': tw,
            'report': {'coordinate_space': 'original glTF right-handed Y-up',
                       'source_forward_from_feet': list(sf), 'target_forward_from_feet': list(tf),
                       'source_left_from_hips': list(source_left.normalized()),
                       'target_left_from_hips': list(target_left.normalized()),
                       'alignment_xyzw': quat_values(alignment), 'yaw_degrees': math.degrees(yaw),
                       'source_leg_chain_m': source_leg, 'target_leg_chain_m': target_leg,
                       'root_motion_scale': target_leg / source_leg, 'frames': frame_report}}


class Writer:
    def __init__(self, nodes, roots):
        self.binary = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Ashen Vow offline semantic-frame retargeter v1'},
                    'scene': 0, 'scenes': [{'name': 'Knight motion skeleton', 'nodes': roots}],
                    'nodes': nodes, 'animations': [], 'accessors': [], 'bufferViews': [], 'buffers': []}

    def add(self, rows, kind, bounds=False):
        width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[kind]
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        flat = [float(v) for row in rows for v in row]
        if not all(math.isfinite(v) for v in flat):
            raise ValueError('Refusing to write a non-finite animation value')
        self.binary.extend(struct.pack('<' + 'f' * len(flat), *flat))
        vi = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(flat) * 4})
        accessor = {'bufferView': vi, 'byteOffset': 0, 'componentType': 5126, 'count': len(rows), 'type': kind}
        if bounds:
            accessor.update(min=[min(row[i] for row in rows) for i in range(width)],
                            max=[max(row[i] for row in rows) for i in range(width)])
        ai = len(self.doc['accessors'])
        self.doc['accessors'].append(accessor)
        return ai

    def save(self, path):
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        text = json.dumps(self.doc, ensure_ascii=True, separators=(',', ':')).encode('utf-8')
        text += b' ' * ((-len(text)) % 4)
        binary = bytes(self.binary) + b'\0' * ((-len(self.binary)) % 4)
        blob = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(binary))
        blob += struct.pack('<II', len(text), 0x4E4F534A) + text
        blob += struct.pack('<II', len(binary), 0x004E4942) + binary
        Path(path).write_bytes(blob)


def skeleton_nodes(target):
    joints = set(target.doc['skins'][0]['joints'])
    original = sorted(joints)
    index = {old: new for new, old in enumerate(original)}
    nodes, roots = [], []
    for old in original:
        node = copy.deepcopy(target.nodes[old])
        node['children'] = [index[c] for c in node.get('children', []) if c in joints]
        if not node['children']:
            node.pop('children', None)
        if 'mesh' in node or 'skin' in node:
            raise ValueError('A target bone unexpectedly carries mesh data')
        nodes.append(node)
        if target.parent.get(old) not in joints:
            ancestor = target.parent.get(old)
            _, world = target.evaluate()
            if ancestor is not None and max(abs(world[ancestor][r][c] - (1 if r == c else 0))
                                            for r in range(4) for c in range(4)) > 1e-6:
                raise ValueError('Nonidentity target ancestor cannot be dropped')
            roots.append(index[old])
    return nodes, roots, index


def world_from_trs(target, values):
    world = [None] * len(target.nodes)
    def resolve(i):
        if world[i] is None:
            m = Matrix.LocRotScale(*values[i])
            world[i] = resolve(target.parent[i]) @ m if i in target.parent else m
        return world[i]
    for i in range(len(world)):
        resolve(i)
    return world


def smoothstep(value):
    value = max(0., min(1., value))
    return value * value * (3. - 2. * value)


def matrix_gltf(raw):
    return Matrix([[raw[c * 4 + r] for c in range(4)] for r in range(4)])


class ArmedRoll:
    """Offline six-joint adaptation; hips, torso, legs and timeline are protected."""
    ARM_BONES = {'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R'}

    def __init__(self, target, geometry_path):
        self.target = target
        self.geometry_path = geometry_path
        self.geometry = json.loads(geometry_path.read_text(encoding='utf-8'))
        self.geometry_sha256 = hashlib.sha256(geometry_path.read_bytes()).hexdigest()
        self.scale = float(self.geometry['model_scale'])
        self.raw_to_world = matrix_gltf(self.geometry['bodies'][0]['raw_to_world'])
        self.floor = (self.raw_to_world.inverted() @ Vector((0, 0, 0))).y
        self.gears = {}
        for key in ['sword', 'shield']:
            entry = self.geometry[key]
            self.gears[key] = {
                'offset': Vector(entry['hand_offset']),
                'rotation': gltf_quat(entry['hand_relative_rotation_xyzw']),
                'parts': [{'name': p['name'], 'points': np.asarray(p['points'], dtype=np.float64) / self.scale,
                           'triangles': np.asarray(p['triangles'], dtype=np.int32)} for p in entry['parts']],
            }
        self.bodies = []
        for body in self.geometry['bodies']:
            points = np.asarray(body['points'], dtype=np.float64)
            homogeneous = np.column_stack((points, np.ones(len(points))))
            bind = np.asarray(matrix_gltf(body['bind_matrix']), dtype=np.float64)
            self.bodies.append({'points': homogeneous @ bind.T,
                                'weights': np.asarray(body['skin_weights'], dtype=np.float64),
                                'indices': np.asarray(body['skin_indices'], dtype=np.int32),
                                'names': body['bone_names'], 'triangles': body['triangles'],
                                'inverse': np.asarray([matrix_gltf(m) for m in body['inverse_bind_matrices']], dtype=np.float64),
                                'unbind': np.linalg.inv(bind)})

    def adapt(self, values, t, duration):
        result = [[p.copy(), q.copy(), s.copy()] for p, q, s in values]
        weight = smoothstep(t / .24) * (1 - smoothstep((t - .96) / max(.05, duration - .96 - .08)))
        if weight < 1e-8:
            return result, weight
        world = world_from_trs(self.target, values)
        pos = lambda n: position(world, self.target, n)
        chest = pos('chest')
        # Shoulder landmarks move with the source scapular motion and caused
        # an unstable carry frame mid-turn. The actual pelvic joint frame is
        # a stable reference while the chest and legs retain their source curl.
        up = (pos('spine1') - pos('pelvis')).normalized()
        right = (pos('thigh_R') - pos('thigh_L')).normalized()
        right = (right - up * right.dot(up)).normalized()
        forward = up.cross(right).normalized()
        center = (chest + pos('pelvis')) * .5 + up * (.10 / self.scale)
        lateral = Vector((right.x, 0, right.z))
        if lateral.length < .2:
            lateral = Vector((-1, 0, 0))
        lateral.normalize()
        # Keep the blade outboard but trail it diagonally, rather than turning
        # the two equipped arms into a wide horizontal "boat" silhouette.
        blade = (lateral * .45 + Vector((0, 0, -1)) * .89).normalized()
        sword_y = -blade
        sword_x = (up - sword_y * up.dot(sword_y)).normalized()
        sword_z = sword_x.cross(sword_y).normalized()
        sword_rotation = Matrix((sword_x, sword_y, sword_z)).transposed().to_quaternion().normalized()
        shield_normal = (-lateral * .90 + Vector((0, 1, 0)) * .435).normalized()
        shield_rotation = frame(up, shield_normal)
        for side, sign, gear_name, outboard, minimum_height, prop_rotation in [
                ('R', 1, 'sword', .32, .26, sword_rotation),
                ('L', -1, 'shield', .33, .40, shield_rotation)]:
            gear = self.gears[gear_name]
            hand_q = (prop_rotation @ gear['rotation'].inverted()).normalized()
            grip = center + right * (sign * outboard / self.scale) - up * (.08 / self.scale) + forward * (.06 / self.scale)
            grip.y = max(grip.y, self.floor + minimum_height / self.scale)
            wrist = grip - hand_q @ gear['offset']
            upper_name, fore_name, hand_name = f'upperarm_{side}', f'forearm_{side}', f'hand_{side}'
            shoulder, old_elbow, old_wrist = pos(upper_name), pos(fore_name), pos(hand_name)
            a, b = (old_elbow - shoulder).length, (old_wrist - old_elbow).length
            along = wrist - shoulder
            distance = min(a + b - .004, max(abs(a - b) + .004, along.length))
            along.normalize()
            wrist = shoulder + along * distance
            pole = center + right * (sign * .16 / self.scale) - up * (.18 / self.scale) + forward * (.10 / self.scale)
            bend = pole - shoulder
            bend -= along * bend.dot(along)
            if bend.length < 1e-5:
                bend = old_elbow - shoulder
                bend -= along * bend.dot(along)
            bend.normalize()
            cosine = max(-1., min(1., (a * a + distance * distance - b * b) / (2 * a * distance)))
            elbow = shoulder + along * (a * cosine) + bend * (a * math.sqrt(max(0., 1 - cosine * cosine)))
            upper_q = ((old_elbow - shoulder).rotation_difference(elbow - shoulder)
                       @ world[self.target.by_name[upper_name]].to_quaternion().normalized()).normalized()
            # Choose forearm axial roll close to the original wrist-relative
            # pose, rather than forcing a 180-degree twist into the hand.
            preferred = (hand_q @ self.target.rest[self.target.by_name[hand_name]][1].inverted()).normalized()
            local_child = values[self.target.by_name[hand_name]][0].normalized()
            fore_q = ((preferred @ local_child).rotation_difference(wrist - elbow) @ preferred).normalized()
            parent = self.target.parent[self.target.by_name[upper_name]]
            parent_q = world[parent].to_quaternion().normalized()
            new_local = {upper_name: (parent_q.inverted() @ upper_q).normalized(),
                         fore_name: (upper_q.inverted() @ fore_q).normalized(),
                         hand_name: (fore_q.inverted() @ hand_q).normalized()}
            for name, q in new_local.items():
                index = self.target.by_name[name]
                result[index][1] = values[index][1].slerp(q, weight).normalized()
        for name in MAPPING:
            if name in self.ARM_BONES:
                continue
            index = self.target.by_name[name]
            if any(abs(a - b) > 1e-12 for old, new in zip(values[index], result[index]) for a, b in zip(old, new)):
                raise ValueError(f'Armed adaptation changed protected {name}')
        return result, weight

    def skin(self, world):
        vertices, triangles = [], []
        for body in self.bodies:
            matrices = np.asarray([world[self.target.by_name[n]] for n in body['names']], dtype=np.float64) @ body['inverse']
            result = np.zeros_like(body['points'])
            for k in range(4):
                transformed = np.einsum('nij,nj->ni', matrices[body['indices'][:, k]], body['points'])
                result += transformed * body['weights'][:, k, None]
            result = result @ body['unbind'].T
            offset = len(vertices)
            vertices.extend(map(tuple, result[:, :3]))
            triangles.extend(tuple(i + offset for i in face) for face in body['triangles'])
        return vertices, triangles

    def smooth_arms(self, frames):
        # Zero-phase offline smoothing reduces singular-looking wrist/forearm
        # counter-rotation without changing the authored body trajectory or
        # creating a runtime override. Retain exact native arm endpoints.
        for name in self.ARM_BONES:
            index = self.target.by_name[name]
            original = [values[index][1].copy() for _, values, _ in frames]
            for i in range(1, len(frames) - 1):
                accumulator = np.zeros((4, 4), dtype=np.float64)
                for j in range(max(0, i - 3), min(len(frames), i + 4)):
                    q = np.asarray(tuple(original[j]), dtype=np.float64)
                    q /= np.linalg.norm(q)
                    weight = math.exp(-.5 * ((i - j) / 1.25) ** 2)
                    accumulator += weight * np.outer(q, q)
                _, vectors = np.linalg.eigh(accumulator)
                q = Quaternion(tuple(vectors[:, -1])).normalized()
                if q.dot(original[i]) < 0:
                    q.negate()
                frames[i][1][index][1] = q

    @staticmethod
    def segment_triangle(a, b, triangle, epsilon=1e-8):
        # Double-sided Moller-Trumbore. Count a crossing away from endpoints;
        # intentional surface touches within tolerance are not penetration.
        p, q, r = (Vector(v) for v in triangle)
        direction, e1, e2 = Vector(b) - Vector(a), q - p, r - p
        h = direction.cross(e2)
        det = e1.dot(h)
        if abs(det) < epsilon:
            return False
        s = Vector(a) - p
        u = s.dot(h) / det
        if u < -epsilon or u > 1 + epsilon:
            return False
        cross = s.cross(e1)
        v = direction.dot(cross) / det
        if v < -epsilon or u + v > 1 + epsilon:
            return False
        at = e2.dot(cross) / det
        return epsilon < at < 1 - epsilon

    def audit(self, values, t, weight=0.):
        world = world_from_trs(self.target, values)
        body_points, body_faces = self.skin(world)
        body_bvh = BVHTree.FromPolygons(body_points, body_faces, all_triangles=True)
        body_np = np.asarray(body_points)
        report = {'time': t, 'adaptation_weight': weight,
                  'weighted_body_min_y_m': self.scale * (float(body_np[:, 1].min()) - self.floor)}
        for name, hand in [('sword', 'hand_R'), ('shield', 'hand_L')]:
            gear = self.gears[name]
            hand_matrix = world[self.target.by_name[hand]]
            hand_q = hand_matrix.to_quaternion().normalized()
            rotation = np.asarray((hand_q @ gear['rotation']).to_matrix(), dtype=np.float64)
            origin = np.asarray(hand_matrix.translation + hand_q @ gear['offset'], dtype=np.float64)
            minimum, intersections, suspect_inside, max_inside = math.inf, 0, 0, 0.
            intersecting_parts = []
            for part in gear['parts']:
                points = part['points'] @ rotation.T + origin
                minimum = min(minimum, float(points[:, 1].min()))
                audited = ('forged blade' in part['name'] if name == 'sword' else any(
                    text in part['name'] for text in ['closed timber core', 'convex steel face', 'bound metal edge', 'forged boss']))
                if not audited:
                    continue
                gear_faces = part['triangles']
                gear_bvh = BVHTree.FromPolygons(points.tolist(), gear_faces.tolist(), all_triangles=True)
                candidates = body_bvh.overlap(gear_bvh)
                part_crossings = 0
                for bi, gi in candidates:
                    bt = body_np[np.asarray(body_faces[bi])]
                    gt = points[gear_faces[gi]]
                    crossing = any(self.segment_triangle(gt[k], gt[(k + 1) % 3], bt) for k in range(3))
                    crossing = crossing or any(self.segment_triangle(bt[k], bt[(k + 1) % 3], gt) for k in range(3))
                    if crossing:
                        part_crossings += 1
                if part_crossings:
                    intersecting_parts.append({'part': part['name'], 'triangle_crossings': part_crossings})
                intersections += part_crossings
                # A separate signed-nearest diagnostic catches fully contained
                # rigid samples. Layered armor is not a closed solid, so this
                # count is explicitly only a suspect-inside diagnostic.
                for point in points:
                    hit, normal, _, distance = body_bvh.find_nearest(Vector(point))
                    if hit is not None and distance > .001 / self.scale and (Vector(point) - hit).dot(normal) < -.001 / self.scale:
                        suspect_inside += 1
                        max_inside = max(max_inside, distance * self.scale)
            report[name] = {'min_y_m': self.scale * (minimum - self.floor),
                            'body_triangle_crossings': intersections, 'suspect_inside_samples': suspect_inside,
                            'max_suspect_inside_distance_m': max_inside, 'intersecting_parts': intersecting_parts}
        return report


def phase_hints(clip, times):
    source = clip['source_trajectory']
    relative = [[h[i] - r[i] for i in range(3)] for h, r in zip(source['hand_r'], source['root'])]
    speeds = [math.sqrt(sum((b[k] - a[k]) ** 2 for k in range(3))) / max(1e-9, times[i + 1] - times[i])
              for i, (a, b) in enumerate(zip(relative, relative[1:]))]
    peak = max(speeds, default=0.)
    windows, start = [], None
    for i, speed in enumerate(speeds):
        above = speed >= peak * .6 and peak > .15
        if above and start is None:
            start = times[i]
        if start is not None and (not above or i == len(speeds) - 1):
            windows.append([start, times[i + 1] if above else times[i]])
            start = None
    return {'warning': 'Kinematic candidates only. Wrist speed is not a blade contact or damage window.',
            'right_wrist_peak_speed_source_mps': peak,
            'right_wrist_peak_time': (times[speeds.index(peak)] + times[speeds.index(peak) + 1]) / 2 if speeds else 0,
            'right_wrist_fast_motion_intervals': windows,
            'pelvis_height_source_m': [min(p[1] for p in source['pelvis']), max(p[1] for p in source['pelvis'])],
            'left_ankle_height_source_m': [min(p[1] for p in source['foot_l']), max(p[1] for p in source['foot_l'])],
            'right_ankle_height_source_m': [min(p[1] for p in source['foot_r']), max(p[1] for p in source['foot_r'])]}


def bake(target, sources, output, fps, equipment_path):
    nodes, roots, output_index = skeleton_nodes(target)
    writer = Writer(nodes, roots)
    target_parent_order = sorted(MAPPING, key=lambda n: ancestor_count(target, target.by_name[n]))
    armed_adapter = ArmedRoll(target, equipment_path)
    equipment_audit = {}
    metadata = {'status': 'numerically checked offline conversion; visual acceptance pending',
                'target': {'path': str(target.path.relative_to(ROOT)), 'sha256': target.sha256,
                           'joint_count': len(MAPPING)}, 'mapping': MAPPING, 'sample_rate': fps,
                'policy': {'source_pose': 'complete source world skeleton, semantic head-tail and palm frames',
                           'limb_translation': 'original target bind offsets, no per-frame limb stretching',
                           'pelvis': 'source world pelvis including vertical trajectory, scaled to target leg chain',
                           'root_motion': 'RM variant world horizontal root translation removed from pelvis only; trajectory retained',
                           'visual_acceptance': 'not performed by this converter'}, 'libraries': {}, 'clips': []}
    for label, standard in sources.items():
        cal = calibration(target, standard)
        rm_path = standard.path.with_name(standard.path.stem + '_RM.glb')
        source = GLB(rm_path) if rm_path.exists() else standard
        metadata['libraries'][label] = {'standard_path': str(standard.path.relative_to(ROOT)),
                                        'standard_sha256': standard.sha256,
                                        'baked_path': str(source.path.relative_to(ROOT)), 'baked_sha256': source.sha256,
                                        'calibration': cal['report']}
        align, scale = cal['alignment'], cal['scale']
        target_ref = position(cal['target_rest_world'], target, 'pelvis')
        source_ref = position(cal['source_reference_world'], standard, 'pelvis')
        source_ref_root = position(cal['source_reference_world'], standard, 'root')
        for name in CLIPS[label] + (['Armed_Roll'] if label == 'UAL1' else []):
            source_name = 'Roll' if name == 'Armed_Roll' else name
            clip = source.animation(source_name)
            duration = max(standard.accessor(s['input'])[-1][0] for s in standard.animation(source_name)['samplers'])
            source_duration = max(source.accessor(s['input'])[-1][0] for s in clip['samplers'])
            if abs(duration - source_duration) > 1e-5:
                raise ValueError(f'RM duration differs for {name}')
            count = max(1, math.ceil(duration * fps))
            times = [i / fps for i in range(count) if i / fps < duration - 1e-8] + [duration]
            quats = {n: [] for n in MAPPING}
            translations = []
            trajectories = {n: [] for n in ['root', 'pelvis', 'hand_r', 'hand_l', 'foot_l', 'foot_r', 'ball_l', 'ball_r']}
            target_traces = {n: [] for n in ['pelvis', 'hand_R', 'hand_L', 'foot_L', 'foot_R', 'toe_L', 'toe_R']}
            _, first_world = source.evaluate(clip, 0.)
            root_first = position(first_world, source, 'root')
            segment_error = 0.
            length_error = 0.
            quaternion_norm_error = 0.
            audit_frames = []
            armed_frames = []
            for t in times:
                _, sw = source.evaluate(clip, t)
                # Some UAL2 split actions retain the previous action's absolute
                # root offset in frame zero. In-place motion must remove that
                # prefix too, while exported gameplay travel starts at zero.
                root_offset = align @ (position(sw, source, 'root') - source_ref_root) * scale
                pelvis_world = target_ref + (align @ (position(sw, source, 'pelvis') - source_ref)) * scale
                pelvis_world.x -= root_offset.x
                pelvis_world.z -= root_offset.z
                values = [[p.copy(), q.copy(), s.copy()] for p, q, s in target.rest]
                desired_world = {}
                for tn in target_parent_order:
                    sn, ti = MAPPING[tn], target.by_name[tn]
                    desired = (align @ sw[source.by_name[sn]].to_quaternion().normalized() @ cal['corrections'][tn]).normalized()
                    parent = target.parent.get(ti)
                    parent_name = target.nodes[parent].get('name') if parent is not None else None
                    parent_q = desired_world[parent_name] if parent_name in desired_world else (
                        cal['target_rest_world'][parent].to_quaternion().normalized() if parent is not None else Quaternion())
                    local = (parent_q.inverted() @ desired).normalized()
                    values[ti][1] = local
                    desired_world[tn] = desired
                    row = quat_values(local)
                    if quats[tn] and sum(a * b for a, b in zip(quats[tn][-1], row)) < 0:
                        row = [-v for v in row]
                    quaternion_norm_error = max(quaternion_norm_error, abs(math.sqrt(sum(v * v for v in row)) - 1))
                pelvis_i = target.by_name['pelvis']
                pelvis_parent = target.parent.get(pelvis_i)
                values[pelvis_i][0] = (cal['target_rest_world'][pelvis_parent].inverted() @ pelvis_world
                                       if pelvis_parent is not None else pelvis_world)
                adaptation_weight = 0.
                if name == 'Armed_Roll':
                    values, adaptation_weight = armed_adapter.adapt(values, t, duration)
                for tn in MAPPING:
                    row = quat_values(values[target.by_name[tn]][1])
                    if quats[tn] and sum(a * b for a, b in zip(quats[tn][-1], row)) < 0:
                        row = [-v for v in row]
                    quats[tn].append(row)
                translations.append(list(values[pelvis_i][0]))
                tw = world_from_trs(target, values)
                for tn, child in CHILD.items():
                    td = position(tw, target, child) - position(tw, target, tn)
                    sd = align @ (position(sw, source, MAPPING[child]) - position(sw, source, MAPPING[tn]))
                    if name != 'Armed_Roll' or tn not in ArmedRoll.ARM_BONES:
                        segment_error = max(segment_error, angle_deg(td, sd))
                    bind_length = (position(cal['target_rest_world'], target, child)
                                   - position(cal['target_rest_world'], target, tn)).length
                    length_error = max(length_error, abs(td.length - bind_length))
                for n in trajectories:
                    trajectories[n].append(list(position(sw, source, n)))
                for n in target_traces:
                    target_traces[n].append(list(position(tw, target, n)))
                if name == 'Armed_Roll':
                    armed_frames.append((t, values, adaptation_weight))
                elif name == 'Roll':
                    audit_frames.append(armed_adapter.audit(values, t, adaptation_weight))
            if armed_frames:
                armed_adapter.smooth_arms(armed_frames)
                quats = {n: [] for n in MAPPING}
                target_traces = {n: [] for n in target_traces}
                for t, values, adaptation_weight in armed_frames:
                    for tn in MAPPING:
                        row = quat_values(values[target.by_name[tn]][1])
                        if quats[tn] and sum(a * b for a, b in zip(quats[tn][-1], row)) < 0:
                            row = [-v for v in row]
                        quats[tn].append(row)
                    tw = world_from_trs(target, values)
                    for n in target_traces:
                        target_traces[n].append(list(position(tw, target, n)))
                    audit_frames.append(armed_adapter.audit(values, t, adaptation_weight))
            ti = writer.add([[t] for t in times], 'SCALAR', bounds=True)
            samplers, channels = [], []
            for tn in MAPPING:
                samplers.append({'input': ti, 'output': writer.add(quats[tn], 'VEC4'), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': output_index[target.by_name[tn]], 'path': 'rotation'}})
            samplers.append({'input': ti, 'output': writer.add(translations, 'VEC3', bounds=True), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': output_index[target.by_name['pelvis']], 'path': 'translation'}})
            scaled_root = [list(align @ (Vector(p) - root_first) * scale) for p in trajectories['root']]
            horizontal_path = sum(math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(scaled_root, scaled_root[1:]))
            root_motion = {'duration': duration, 'displacement': scaled_root[-1],
                           'horizontal_path_m': horizontal_path, 'mean_horizontal_speed_mps': horizontal_path / duration,
                           'original_clip_root_origin_source_m': list(root_first),
                           'in_place_reference_root_origin_source_m': list(source_ref_root),
                           'samples': [[t, *p] for t, p in zip(times, scaled_root)],
                           'units': 'target meters in original glTF Y-up space'}
            clip_meta = {'name': name, 'library': label, 'original_name': source_name, 'native_duration': duration,
                         'sample_count': len(times), 'channels': len(channels), 'root_motion': root_motion,
                         'source_trajectory': trajectories, 'target_trajectory': target_traces,
                         'validation': {'max_head_tail_direction_error_degrees': segment_error,
                                        'max_fixed_joint_length_error_m': length_error,
                                        'max_quaternion_norm_error': quaternion_norm_error,
                                        'all_values_finite': True}}
            clip_meta['phase_hints'] = phase_hints(clip_meta, times)
            adaptation = None
            if name == 'Armed_Roll':
                adaptation = {'source_clip': 'Roll', 'offline_baked': True, 'changed_bones': sorted(ArmedRoll.ARM_BONES),
                              'protected_hips_torso_head_legs': 'source channels preserved exactly',
                              'body_root_y_lift_applied': False, 'equipment_hidden': False,
                              'equipment_binding_sha256': armed_adapter.geometry_sha256,
                              'characters_snapshot_sha256': armed_adapter.geometry['characters_sha256'],
                              'method': 'pelvic-frame compact rib-side grips; diagonal trailing blade; external shoulder shield; analytic two-bone IK; zero-phase offline arm smoothing; native recovery',
                              'visual_acceptance': 'pending equipped mesh review'}
                clip_meta['adaptation'] = adaptation
            if audit_frames:
                equipment_audit[name] = {'status': 'actual weighted body and rigid equipped triangle diagnostics, not universal collision proof',
                                         'source_body_vertices': sum(len(b['points']) for b in armed_adapter.bodies),
                                         'frames': audit_frames}
                clip_meta['equipment_validation'] = {
                    gear: {'minimum_y_m': min(f[gear]['min_y_m'] for f in audit_frames),
                           'frames_with_body_triangle_crossings': sum(f[gear]['body_triangle_crossings'] > 0 for f in audit_frames),
                           'max_body_triangle_crossings': max(f[gear]['body_triangle_crossings'] for f in audit_frames),
                           'frames_with_suspect_inside_samples': sum(f[gear]['suspect_inside_samples'] > 0 for f in audit_frames)}
                    for gear in ['sword', 'shield']}
            if segment_error > .25 or length_error > 1e-4:
                raise ValueError(f'{name}: failed geometric calibration {clip_meta["validation"]}')
            metadata['clips'].append(clip_meta)
            extras = {'source_library': label, 'source_animation': source_name,
                      'native_duration': duration, 'root_motion': root_motion}
            if adaptation:
                extras['adaptation'] = adaptation
            writer.doc['animations'].append({'name': name, 'samplers': samplers, 'channels': channels, 'extras': extras})
            print(json.dumps({'clip': name, 'duration': duration, 'frames': len(times),
                              'root_displacement': scaled_root[-1], 'validation': clip_meta['validation']}))
    writer.doc['extras'] = {'retarget': {'target_sha256': target.sha256, 'mapping': MAPPING,
                                        'sample_rate': fps, 'visual_acceptance': 'pending'}}
    writer.save(output)
    metadata['output'] = {'path': str(output.relative_to(ROOT)), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                          'bytes': output.stat().st_size, 'bones': len(nodes), 'animations': len(metadata['clips'])}
    (WORK / 'RETARGET_METADATA.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = copy.deepcopy(metadata)
    for clip in summary['clips']:
        clip.pop('source_trajectory', None)
        clip.pop('target_trajectory', None)
        clip['root_motion'].pop('samples', None)
    (WORK / 'RETARGET_SUMMARY.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    (WORK / 'PHASE_HINTS.json').write_text(json.dumps({c['name']: c['phase_hints'] for c in metadata['clips']},
                                                   ensure_ascii=False, indent=2), encoding='utf-8')
    (WORK / 'ARMED_ROLL_GEOMETRY_AUDIT.json').write_text(json.dumps(equipment_audit, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': metadata['output'], 'summary': str(WORK / 'RETARGET_SUMMARY.json')}, ensure_ascii=False))


def ancestor_count(asset, index):
    depth = 0
    while index in asset.parent:
        depth += 1
        index = asset.parent[index]
    return depth


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--fps', type=int, default=60)
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/knight-motion-v15.glb')
    parser.add_argument('--equipment', type=Path, default=None,
                        help='Optional explicit immutable geometry snapshot; default captures current production mesh automatically')
    options = parser.parse_args(args)
    ensure_sources()
    target = GLB(ROOT / 'assets/knight-v11.glb')
    sources = {key: GLB(path) for key, path in SOURCES.items()}
    if options.inspect:
        inspect(target, sources)
    else:
        if options.fps < 24 or options.fps > 120:
            parser.error('Use a bake rate between 24 and 120 Hz')
        WORK.mkdir(parents=True, exist_ok=True)
        equipment = options.equipment.resolve() if options.equipment else WORK / 'EQUIPMENT_BINDING.json'
        if options.equipment is None:
            subprocess.run(['node', str(ROOT / 'tools/export-equipment-binding.cjs')], cwd=ROOT, check=True)
        if not equipment.exists():
            parser.error('The explicit equipment snapshot does not exist')
        bake(target, sources, options.output.resolve(), options.fps, equipment)


if __name__ == '__main__':
    main()
