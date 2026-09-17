import bpy, json, bmesh
from mathutils import Vector
from pathlib import Path
ROOT=Path(r'C:/Users/asus/Documents/ChatGPT/takdab_game')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
report=[]
for i in range(1,5):
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'avatar{i}.glb'))
    mesh=next(o for o in bpy.context.selected_objects if o.type=='MESH')
    mesh.parent=None
    mesh.location.x=(i-1)*.20-.19
    verts=[v.co for v in mesh.data.vertices if v.co.x>.12 and .35<v.co.z<.50]
    report.append({'avatar':i,'bounds':[[min(v[j] for v in verts),max(v[j] for v in verts)] for j in range(3)]})
    bm=bmesh.new();bm.from_mesh(mesh.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x<.13 or not .35<v.co.z<.49],context='VERTS')
    bm.to_mesh(mesh.data);bm.free()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.world.color=(.3,.3,.3)
bpy.ops.object.light_add(type='AREA',location=(.3,-1,1));bpy.context.object.data.energy=40;bpy.context.object.data.size=1
bpy.ops.object.camera_add(location=(.3,-2,.47))
cam=bpy.context.object;cam.rotation_euler=(Vector((.3,0,.445))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=.80;scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=420;scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'artifacts/source-hands.png')
bpy.ops.render.render(write_still=True)
print(json.dumps(report))
