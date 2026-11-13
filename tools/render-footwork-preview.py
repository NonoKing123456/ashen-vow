"""Render geometry produced by bake-armed-footwork.cjs; never used at runtime."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.asset-work/footwork-v16'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
files=[WORK/name for name in args] if args else sorted(WORK.glob('Knight_*.glb'))
for file in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(file))
    mat=bpy.data.materials.new('Actual zero-height floor')
    mat.diffuse_color=(.25,.28,.31,1)
    bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,0))
    bpy.context.object.data.materials.append(mat)
    gold=bpy.data.materials.new('Root position guides')
    gold.diffuse_color=(.6,.45,.16,1)
    for i in range(6):
        bpy.ops.mesh.primitive_torus_add(major_radius=.45,minor_radius=.003,major_segments=48,minor_segments=4,location=((i-2.5)*2.5,0,.003))
        bpy.context.object.data.materials.append(gold)
    world=bpy.data.worlds.new('Neutral studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.23,.27,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world
    for location,power,size in [((0,-5,8),2600,10),((0,4,6),1800,9),((-7,-2,4),900,6)]:
        light=bpy.data.lights.new('Softbox','AREA');light.energy=power;light.shape='DISK';light.size=size
        item=bpy.data.objects.new('Softbox',light);scene.collection.objects.link(item);item.location=location
        item.rotation_euler=(Vector((0,0,1))-item.location).to_track_quat('-Z','Y').to_euler()
    camera=bpy.data.objects.new('Evidence camera',bpy.data.cameras.new('Evidence camera'));scene.collection.objects.link(camera)
    camera.location=(0,-13,4.0);camera.rotation_euler=(Vector((0,0,1.05))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=15.5;scene.camera=camera
    ink=bpy.data.materials.new('Labels');ink.diffuse_color=(.82,.84,.86,1)
    for i in range(6):
        text=bpy.data.curves.new('Pose label','FONT');text.body=f'{i*.2:.2f}s';text.align_x='CENTER';text.size=.14
        item=bpy.data.objects.new('Pose label',text);scene.collection.objects.link(item);item.location=((i-2.5)*2.5,-.20,2.35)
        item.rotation_euler=camera.rotation_euler;text.materials.append(ink)
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
    scene.render.resolution_x=2400;scene.render.resolution_y=740;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(file.with_suffix('.png'))
    bpy.ops.render.render(write_still=True)
    print('FOOTWORK_PREVIEW',scene.render.filepath,flush=True)
