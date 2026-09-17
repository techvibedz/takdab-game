import bpy, math
from mathutils import Vector
from pathlib import Path
ROOT = Path(r'C:/Users/asus/Documents/ChatGPT/takdab_game')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for i in range(1,5):
    bpy.ops.import_scene.gltf(filepath=str(ROOT / f'avatar{i}.glb'))
    for obj in list(bpy.context.selected_objects):
        if obj.type == 'MESH':
            obj.name = f'Avatar{i}'
            obj.location.x += (i-2.5)*0.65
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.world.color=(0.4,0.4,0.4)
bpy.ops.object.light_add(type='AREA', location=(0,-3,4))
bpy.context.object.data.energy=450
bpy.context.object.data.shape='DISK'
bpy.context.object.data.size=5
bpy.ops.object.camera_add(location=(0,-4,1.1))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,0.5))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=2.8
scene.camera=cam
scene.render.resolution_x=1400;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'artifacts/source-front.png')
bpy.ops.render.render(write_still=True)
