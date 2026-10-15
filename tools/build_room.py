"""Run through Blender MCP (python tools/blender_mcp.py tools/build_room.py).
Builds the premium café around the card table and exports puplic/models/room.glb.
Blender Z-up; floor at z=0 (the game places it at y=-0.5). The local player faces +Y (the far wall).
The table's key light is a runtime SpotLight under the pendant; this file only builds geometry and glow."""
import bpy, bmesh, math
import numpy as np
from pathlib import Path

ROOT = Path('C:/takdab')
rng = np.random.default_rng(7)
HALF, HEIGHT = 4.6, 3.3

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions):
    for item in list(block): block.remove(item)

# ---------- procedural textures (small, tileable, embedded in the GLB) ----------
def image(name, rgb):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=2)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    img.pack()
    return img

def srgb(hex_color):
    c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return np.array([x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c])

def herringbone(size=512):
    # Dark smoked-oak herringbone: alternating 45° boards with per-board tone.
    y, x = np.mgrid[0:size, 0:size] / size * 4
    col = np.floor(x * 2)
    u = np.where(col % 2 == 0, x + y, x - y)
    board = np.floor(u * 3) + col * 17
    tone = .7 + .3 * np.sin(board * 12.9898) ** 2
    grain = .92 + .08 * np.sin(u * 160 + np.sin(board) * 3)
    seam = ((u * 3) % 1 < .04) | ((x * 2) % 1 < .012)
    out = srgb('#5a3826')[None, None] * (tone * grain)[..., None]
    out[seam] = srgb('#1e130c')
    return out

def walnut_panels(size=256):
    # Vertical walnut wainscot panels with a recessed border.
    y, x = np.mgrid[0:size, 0:size] / size
    fx = (x * 2) % 1
    border = (fx < .08) | (fx > .92) | (y < .08) | (y > .92)
    grain = .85 + .15 * np.sin((y * 70 + np.sin(x * 25) * 2)) ** 2
    out = srgb('#3b2416')[None, None] * grain[..., None]
    out[border] = srgb('#24160d')
    return out

def plaster(size=128):
    n = np.kron(rng.random((size // 8, size // 8)), np.ones((8, 8)))
    return srgb('#26302b')[None, None] * (.9 + .1 * n)[..., None]

def rug(size=512):
    y, x = np.mgrid[0:size, 0:size] / size - .5
    d = np.maximum(abs(x), abs(y))
    out = np.tile(srgb('#3a1418'), (size, size, 1))
    out[d > .42] = srgb('#14181c'); out[(d > .445) & (d < .46)] = srgb('#b8893e')
    lattice = (abs((abs(x) + abs(y)) * 10 % 1 - .5) < .05) & (d < .4)
    out[lattice] = srgb('#5c2228')
    out[abs(x) + abs(y) < .12] = srgb('#b8893e'); out[abs(x) + abs(y) < .09] = srgb('#3a1418')
    return out * (.9 + .1 * rng.random((size, size, 1)))

# ---------- materials ----------
def material(name, color='#ffffff', rough=.7, metal=0., tex=None, emit=None, strength=0.):
    m = bpy.data.materials.new(name)
    if hasattr(m, 'use_nodes'): m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*srgb(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if tex is not None:
        node = m.node_tree.nodes.new('ShaderNodeTexImage'); node.image = tex
        m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
        if emit == 'texture':
            m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = strength
    if emit and emit != 'texture':
        bsdf.inputs['Emission Color'].default_value = (*srgb(emit), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m

logo = bpy.data.images.load(str(ROOT / 'tools/assets/team-mashoura.jpg')); logo.pack()
M = {
    'floor': material('Floor_Herringbone', rough=.45, tex=image('herringbone', herringbone())),
    'panel': material('Walnut_Panels', rough=.5, tex=image('walnut_panels', walnut_panels())),
    'plaster': material('Plaster_Charcoal', rough=.95, tex=image('plaster', plaster())),
    'ceiling': material('Ceiling_Dark', '#121110', .95),
    'rug': material('Rug_Oxblood', rough=.95, tex=image('rug_pattern', rug())),
    'wood': material('Wood_Walnut', '#2a190f', .45),
    'brass': material('Brass', '#c9933f', .3, .9),
    'black_metal': material('Black_Metal', '#141414', .4, .8),
    'chrome': material('Chrome', '#d8d8d8', .15, 1.),
    'marble': material('Marble_Top', '#d9d4cc', .2),
    'leather': material('Leather_Cognac', '#5c2e16', .55),
    'glow': material('Warm_Glow', '#ffd59a', .5, emit='#ffbe6a', strength=5),
    'soft_glow': material('Pendant_Diffuser', '#7a5a36', .6, emit='#ffb866', strength=1.6),
    'strip': material('Shelf_Light', '#ffcf8a', .5, emit='#ffb45c', strength=4),
    'logo': material('Team_Mashouda', rough=.6, tex=logo, emit='texture', strength=.35),
    'frame': material('Frame_Gold', '#b88a3c', .35, .8),
    'bottle_green': material('Bottle_Green', '#1e4d2b', .1),
    'bottle_amber': material('Bottle_Amber', '#7a3d0c', .1),
    'ceramic': material('Cup_White', '#efe9df', .3),
    'leaf': material('Leaf', '#2c5a32', .7),
    'pot': material('Pot_Black', '#1b1b1b', .6),
}

parts = []
def add(obj, mat, smooth=False):
    obj.data.materials.clear(); obj.data.materials.append(M[mat]); parts.append(obj)
    for poly in obj.data.polygons: poly.use_smooth = smooth
    return obj

def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = 2
    return add(o, mat)

def cyl(name, r, depth, loc, mat, verts=20, rot=(0, 0, 0), r2=None, smooth=False):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return add(o, mat, smooth)

def plane(name, size, loc, rot, mat, uv=(1, 1)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (size[0], size[1], 1)
    bpy.ops.object.transform_apply(scale=True)
    for loop in o.data.uv_layers.active.data: loop.uv = (loop.uv[0] * uv[0], loop.uv[1] * uv[1])
    return add(o, mat)

# ---------- shell ----------
W = HALF * 2
PANEL_H = 1.3
plane('Floor', (W, W), (0, 0, 0), (0, 0, 0), 'floor', (2, 2))
plane('Ceiling', (W, W), (0, 0, HEIGHT), (math.pi, 0, 0), 'ceiling')
walls = [((0, HALF), (math.pi / 2, 0, math.pi)), ((0, -HALF), (math.pi / 2, 0, 0)),
         ((HALF, 0), (math.pi / 2, 0, math.pi / 2)), ((-HALF, 0), (math.pi / 2, 0, -math.pi / 2))]
for i, ((x, y), rot) in enumerate(walls):
    n = (-x / HALF * .003, -y / HALF * .003)
    plane(f'Wall_{i}', (W, HEIGHT - PANEL_H), (x, y, PANEL_H + (HEIGHT - PANEL_H) / 2), rot, 'plaster', (5, 2))
    plane(f'Wainscot_{i}', (W, PANEL_H), (x + n[0], y + n[1], PANEL_H / 2), rot, 'panel', (W / .9, 1))
    along = (W, .05, .05) if y else (.05, W, .05)
    box(f'Rail_{i}', (along[0], along[1], .04), (x * .994, y * .994, PANEL_H + .02), 'brass')
    box(f'Cornice_{i}', (along[0], along[1], .14), (x * .99, y * .99, HEIGHT - .07), 'wood')
# Dark coffered ceiling
for k in range(-3, 4):
    box(f'BeamX_{k}', (.16, W, .16), (k * 1.3, 0, HEIGHT - .08), 'wood')
    box(f'BeamY_{k}', (W, .16, .16), (0, k * 1.3, HEIGHT - .08), 'wood')
plane('Rug', (5.4, 5.4), (0, 0, .004), (0, 0, 0), 'rug')

# ---------- far wall: Team Mashouda in a gold frame, lit by a brass picture light ----------
FY = HALF - .02
# Left of the opposite seat so no player or badge ever covers it; the wall behind that player stays clean.
LX = -1.75
box('Logo_Frame', (1.62, .07, 1.62), (LX, FY - .02, 2.08), 'frame', bevel=.015)
box('Logo_Mat', (1.46, .02, 1.46), (LX, FY - .06, 2.08), 'wood')
plane('Team_Mashouda_Logo', (1.32, 1.32), (LX, FY - .075, 2.08), (math.pi / 2, 0, 0), 'logo')  # front face toward the room; (…, math.pi) showed the mirrored back
cyl('Picture_Light_Arm', .015, .26, (LX, FY - .13, 3.0), 'brass', 8, rot=(math.pi / 2, 0, 0))
cyl('Picture_Light', .04, .8, (LX, FY - .26, 3.0), 'brass', 12, rot=(0, math.pi / 2, 0), smooth=True)
box('Picture_Light_Glow', (.74, .02, .02), (LX, FY - .27, 2.965), 'glow')

def shelf_niche(cx):
    # Backlit open shelving with bottles and coffee jars either side of the logo.
    box('Niche_Back', (1.3, .04, 1.7), (cx, FY - .02, 2.05), 'wood')
    for z in (1.4, 1.95, 2.5):
        box('Niche_Shelf', (1.3, .28, .04), (cx, FY - .16, z), 'wood')
        box('Niche_Strip', (1.24, .02, .015), (cx, FY - .29, z - .03), 'strip')
        for k in range(5):
            bx = cx - .5 + k * .25
            mat = 'bottle_green' if (k + int(z * 3)) % 3 == 0 else 'bottle_amber' if k % 2 else 'ceramic'
            h = .32 if mat != 'ceramic' else .16
            cyl('Niche_Bottle', .045 if mat != 'ceramic' else .07, h, (bx, FY - .15, z + .02 + h / 2), mat, 12, smooth=True)
            if mat != 'ceramic': cyl('Niche_Neck', .015, .1, (bx, FY - .15, z + h + .07), mat, 8)
    for side in (-1, 1): box('Niche_Side', (.05, .3, 1.7), (cx + side * .65, FY - .15, 2.05), 'wood')
shelf_niche(1.9)

# ---------- right wall: coffee bar with espresso machine and pendant trio ----------
bx = HALF - .55
box('Bar_Body', (.7, 3.4, 1.05), (bx, -.4, .525), 'wood', bevel=.02)
box('Bar_Kick', (.72, 3.42, .08), (bx, -.4, .04), 'brass')
box('Bar_Top', (.82, 3.5, .05), (bx - .04, -.4, 1.075), 'marble', bevel=.01)
box('Espresso_Body', (.45, .55, .38), (bx + .05, -1.2, 1.29), 'chrome', bevel=.02)
box('Espresso_Top', (.47, .57, .04), (bx + .05, -1.2, 1.5), 'black_metal')
for k in (-1, 1):
    cyl('Espresso_Group', .045, .08, (bx - .2, -1.2 + k * .14, 1.2), 'chrome', 12)
    cyl('Espresso_Cup', .04, .06, (bx - .2, -1.2 + k * .14, 1.13), 'ceramic', 12, smooth=True)
cyl('Grinder', .08, .3, (bx + .05, -.65, 1.25), 'black_metal', 14)
cyl('Grinder_Hopper', .1, .18, (bx + .05, -.65, 1.49), 'bottle_amber', 14, r2=.06)
for k in range(5):
    cyl('Bar_Cup', .045, .07, (bx - .1, .1 + k * .17, 1.135), 'ceramic', 12, smooth=True)
for k in range(3):
    y = -1.5 + k * 1.1
    cyl('Bar_Pendant_Cord', .006, 1.0, (bx - .1, y, HEIGHT - .5), 'black_metal', 6)
    cyl('Bar_Pendant_Shade', .14, .22, (bx - .1, y, 2.7), 'black_metal', 16, r2=.03, smooth=True)
    cyl('Bar_Pendant_Bulb', .05, .05, (bx - .1, y, 2.58), 'glow', 10)
# Back-bar shelf above the counter
box('BackBar_Shelf', (.25, 3.0, .04), (HALF - .14, -.4, 2.0), 'wood')
box('BackBar_Strip', (.02, 2.9, .015), (HALF - .27, -.4, 1.97), 'strip')
for k in range(9):
    mat = ['bottle_amber', 'bottle_green', 'ceramic'][k % 3]
    cyl('BackBar_Bottle', .045, .3, (HALF - .14, -1.7 + k * .33, 2.17), mat, 12, smooth=True)
# Bar stools
for k in range(3):
    y = -1.4 + k * 1.0
    cyl('Stool_Seat', .2, .06, (bx - .65, y, .78), 'leather', 18, smooth=True)
    cyl('Stool_Post', .03, .75, (bx - .65, y, .4), 'black_metal', 8)
    cyl('Stool_Base', .18, .03, (bx - .65, y, .015), 'black_metal', 16)
    bpy.ops.mesh.primitive_torus_add(major_radius=.15, minor_radius=.012, location=(bx - .65, y, .32))
    add(bpy.context.object, 'brass', True)

# ---------- left wall: tufted leather banquette, café tables, brass sconces ----------
lx = -HALF + .4
box('Banquette_Base', (.75, 4.6, .4), (lx, 0, .2), 'wood', bevel=.02)
box('Banquette_Seat', (.72, 4.56, .16), (lx + .02, 0, .48), 'leather', bevel=.05)
for k in range(6):
    box('Banquette_Tuft', (.16, .72, .62), (-HALF + .1, -1.9 + k * .76, .86), 'leather', bevel=.07)
for y in (-1.2, 1.2):
    cyl('Cafe_Table_Top', .32, .04, (lx + .75, y, .72), 'marble', 24)
    cyl('Cafe_Table_Post', .03, .7, (lx + .75, y, .36), 'black_metal', 8)
    cyl('Cafe_Table_Base', .2, .03, (lx + .75, y, .015), 'black_metal', 16)
    cyl('Cafe_Cup', .045, .07, (lx + .7, y + .08, .775), 'ceramic', 12, smooth=True)
for y in (-1.6, 0, 1.6):
    box('Sconce_Plate', (.03, .1, .2), (-HALF + .015, y, 2.0), 'brass')
    cyl('Sconce_Shade', .08, .16, (-HALF + .12, y, 2.08), 'black_metal', 14, r2=.05, smooth=True)
    cyl('Sconce_Bulb', .04, .04, (-HALF + .12, y, 1.99), 'glow', 10)

# ---------- plants in the corners ----------
def plant(x, y):
    cyl('Plant_Pot', .24, .55, (x, y, .275), 'pot', 18, r2=.2)
    for k in range(10):
        a = k / 10 * math.tau
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.25, location=(x + math.cos(a) * .17, y + math.sin(a) * .17, .8 + (k % 3) * .25))
        leaf = bpy.context.object; leaf.name = 'Plant_Leaf'; leaf.scale = (1.5, .4, .22)
        leaf.rotation_euler = (0, -.5 - (k % 3) * .2, a)
        add(leaf, 'leaf', True)
plant(HALF - .4, HALF - .4); plant(-HALF + .4, HALF - .4); plant(-.75, HALF - .4)

# ---------- back wall (behind the local player): door ----------
dy = -HALF + .05
box('Door', (1.1, .08, 2.3), (1.7, dy, 1.15), 'wood', bevel=.01)
box('Door_Glass', (.6, .09, 1.2), (1.7, dy, 1.5), 'strip')
cyl('Door_Handle', .015, .5, (2.1, dy + .08, 1.1), 'brass', 8)

# ---------- the table's pendant: wide dome, brass rim, glowing diffuser ----------
cyl('Pendant_Rod', .015, 1.15, (0, 0, HEIGHT - .575), 'black_metal', 8)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.6, location=(0, 0, 2.15))
dome = bpy.context.object; dome.name = 'Pendant_Dome'; dome.scale = (1, 1, .45)
bm = bmesh.new(); bm.from_mesh(dome.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS'); bm.to_mesh(dome.data); bm.free()
solid = dome.modifiers.new('shell', 'SOLIDIFY'); solid.thickness = .03
add(dome, 'black_metal', True)
bpy.ops.mesh.primitive_torus_add(major_radius=.6, minor_radius=.02, major_segments=40, location=(0, 0, 2.15))
add(bpy.context.object, 'brass', True)
cyl('Pendant_Diffuser', .38, .02, (0, 0, 2.2), 'soft_glow', 32)  # recessed and dimmer: a seated eye line no longer sees a white disc

# ---------- bake modifiers, merge to one mesh (one draw call per material), export ----------
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
room = bpy.context.object; room.name = 'Room'
dest = ROOT / 'puplic/models/room.glb'
bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True, export_apply=True,
    export_yup=True, export_image_format='JPEG', export_jpeg_quality=84, export_animations=False)
print('room', len(room.data.polygons), 'faces', len(room.data.materials), 'materials', dest.stat().st_size // 1024, 'KB')
