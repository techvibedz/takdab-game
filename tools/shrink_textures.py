"""Blender MCP: re-export static models with right-sized JPEG textures (4096 was ~3 MB per prop on phones)."""
import bpy
from pathlib import Path
MODELS = Path('C:/takdab/puplic/models')
SIZES = {'card': 512, 'chair': 1024, 'table': 2048, **{f'avatar{i}-preview': 2048 for i in range(1, 5)}}
report = {}
for name, size in SIZES.items():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    for im in list(bpy.data.images): bpy.data.images.remove(im)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    path = MODELS / f'{name}.glb'
    before = path.stat().st_size
    bpy.ops.import_scene.gltf(filepath=str(path))
    for im in bpy.data.images:
        if im.size[0] > size: im.scale(size, size)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True,
        export_image_format='JPEG', export_jpeg_quality=86, export_animations=False)
    report[name] = (before // 1024, path.stat().st_size // 1024)
print(report)
