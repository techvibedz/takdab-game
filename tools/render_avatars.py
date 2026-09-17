"""Blender MCP: render all four exported game assets seated on the game's chair."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'C:/Users/asus/Documents/ChatGPT/takdab_game')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for i in range(1,5):
    previous=set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'puplic/models/avatar{i}.glb'))
    rig=next(o for o in bpy.context.selected_objects if o.type=='ARMATURE')
    rig.location=((i-2.5)*1.15,-.16,.48-.405*1.9)
    rig.scale=(1.9,)*3
    for obj in bpy.context.selected_objects:
        for modifier in obj.modifiers:
            if modifier.type=='ARMATURE': modifier.use_deform_preserve_volume=True
    for track in rig.animation_data.nla_tracks: track.mute=True
    action=next(a for a in set(bpy.data.actions)-previous if a.name.split('.')[0]=='HoldCards')
    rig.animation_data.action=action
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'puplic/models/chair.glb'))
    for obj in bpy.context.selected_objects:
        if obj.parent is None:
            obj.location.x=(i-2.5)*1.15;obj.scale=(1.15,)*3
scene=bpy.context.scene
scene.frame_set(20)
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.24,.24,.24)
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object
mat=bpy.data.materials.new('Studio floor');mat.diffuse_color=(.035,.065,.06,1)
floor.data.materials.append(mat)
for location,power,size in [((1,-3,5),750,5),((-4,0,3),450,4)]:
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,.7))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2,-6,2.6))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=5.4
scene.camera=camera
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'artifacts/avatars-ready.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'artifacts/avatars-seated-review.blend'))
bpy.ops.render.render(write_still=True)
