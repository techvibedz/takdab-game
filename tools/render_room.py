"""Blender MCP: preview room.glb from the game's first-person camera with table and chairs."""
import bpy, math
from mathutils import Vector, Euler
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
root='C:/takdab/puplic/models/'
bpy.ops.import_scene.gltf(filepath=root+'room.glb')
bpy.ops.import_scene.gltf(filepath=root+'table.glb')
for o in bpy.context.selected_objects:
    if o.parent is None: o.scale=(2.5,2.5,1.2)
# Seats: three (x, z, rotY) -> blender (x, -z), rotZ
for x,z,ry in [(-1.7,0,math.pi/2),(0,-1.7,0),(1.7,0,-math.pi/2)]:
    bpy.ops.import_scene.gltf(filepath=root+'chair.glb')
    for o in bpy.context.selected_objects:
        if o.parent is None: o.location=(x,-z,0); o.rotation_euler=(math.pi/2,0,ry) if o.rotation_mode=='XYZ' and abs(o.rotation_euler.x-math.pi/2)<.01 else (0,0,ry); o.scale=(1.15,)*3
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.world.color=(.02,.03,.04)
bpy.ops.object.light_add(type='POINT',location=(0,0,2.25)); L=bpy.context.object; L.data.energy=900; L.data.color=(1,.8,.55); L.data.shadow_soft_size=.3
bpy.ops.object.light_add(type='AREA',location=(0,0,3.0)); A=bpy.context.object; A.data.energy=400; A.data.size=6; A.data.color=(1,.92,.8)
bpy.ops.object.camera_add(location=(0.014,-1.46,1.38)); cam=bpy.context.object
cam.rotation_euler=Euler((math.pi/2-.22,0,0),'XYZ')
cam.data.sensor_fit='VERTICAL'; cam.data.angle=math.radians(75); scene.camera=cam
scene.render.resolution_x=1600; scene.render.resolution_y=800
scene.render.filepath='C:/takdab/artifacts/room-preview.png'
bpy.ops.render.render(write_still=True)
cam.rotation_euler=Euler((math.pi/2-.05,0,1.1),'XYZ'); scene.render.filepath='C:/takdab/artifacts/room-preview-left.png'
bpy.ops.render.render(write_still=True)
cam.rotation_euler=Euler((math.pi/2-.05,0,-1.1),'XYZ'); scene.render.filepath='C:/takdab/artifacts/room-preview-right.png'
bpy.ops.render.render(write_still=True)
print('ok')
