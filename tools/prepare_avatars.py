"""Run through Blender MCP. Originals stay in the project root."""
import bpy, math, json, shutil, heapq
import numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(r'C:/Users/asus/Documents/ChatGPT/takdab_game')
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
backup = OUT / 'original-game-models'
backup.mkdir(exist_ok=True)

def point(x, y, z=0):
    return Vector((x, -z, y))

def build(number):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions): bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / f'avatar{number}.glb'))
    mesh = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
    mesh.name = f'Avatar{number}_Body'
    mesh.parent = None
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # GLB splits vertices at UV seams; weld positions before heat weighting.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.00001)
    bpy.ops.object.mode_set(mode='OBJECT')
    data = bpy.data.armatures.new(f'Avatar{number}_Skeleton')
    rig = bpy.data.objects.new(f'Avatar{number}_Rig', data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    wrist_x,wrist_y,wrist_z,elbow_x,elbow_y = {
        1:(.186,.493,.035,.172,.63), 2:(.166,.49,-.006,.15,.625),
        3:(.199,.47,0,.182,.615), 4:(.181,.49,.014,.163,.625),
    }[number]
    specs = [('Hips',point(0,.48),point(0,.58),None),
             ('Spine',point(0,.58),point(0,.755),'Hips'),
             ('Neck',point(0,.755),point(0,.81),'Spine'),
             ('Head',point(0,.81),point(0,.97),'Neck')]
    finger_names=['Thumb','Index','Middle','Ring','Little']
    finger_bones={}
    for side,s in [('L',-1),('R',1)]:
        specs += [(f'UpperArm_{side}',point(s*.125,.75),point(s*elbow_x,elbow_y), 'Spine'),
                  (f'Forearm_{side}',point(s*elbow_x,elbow_y),point(s*wrist_x,wrist_y,wrist_z),f'UpperArm_{side}'),
                  (f'Hand_{side}',point(s*wrist_x,wrist_y,wrist_z),point(s*(wrist_x+.007),wrist_y-.047,wrist_z),f'Forearm_{side}'),
                  (f'Thigh_{side}',point(s*.072,.48),point(s*.073,.265), 'Hips'),
                  (f'Shin_{side}',point(s*.073,.265),point(s*.078,.065), f'Thigh_{side}'),
                  (f'Foot_{side}',point(s*.078,.065),point(s*.078,.03,.085),f'Shin_{side}')]
        finger_bones[side]=[]
        for finger,depth,length in [('Thumb',.022,.075),('Index',.026,.105),('Middle',.007,.112),('Ring',-.010,.105),('Little',-.025,.091)]:
            if finger=='Thumb':
                points=[point(s*(wrist_x+dx),wrist_y-dy,wrist_z+depth) for dx,dy in [(-.010,.020),(-.026,.039),(-.036,.058),(-.038,.075)]]
            else:
                points=[point(s*(wrist_x+dx),wrist_y-dy,wrist_z+depth) for dx,dy in [(.012,.046),(.010,length*.68),(-.003,length*.87),(-.018,length)]]
            for j in range(3):
                name=f'{finger}{j+1}_{side}'
                parent=f'Hand_{side}' if j==0 else f'{finger}{j}_{side}'
                specs.append((name,points[j],points[j+1],parent));finger_bones[side].append(name)
    for name,head,tail,parent in specs:
        bone=data.edit_bones.new(name);bone.head=head;bone.tail=tail
        if any(k in name for k in ['Arm','Forearm','Hand']+finger_names): bone.align_roll(Vector((0,1,0)))
        if parent: bone.parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True);rig.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    def smooth(a,b,x):
        t=max(0,min(1,(x-a)/(b-a)))
        return t*t*(3-2*t)
    def distance(v,a,b):
        d=b-a
        return (v-(a+d*max(0,min(1,(v-a).dot(d)/d.length_squared)))).length
    segments={name:(a,b) for name,a,b,_ in specs}
    names=[name for name,_,_,_ in specs]
    weights_array=np.zeros((len(mesh.data.vertices),len(names)),dtype=np.float64)
    rigid_head=[]
    # Sample the original texture: a height-only beard mask also grabbed the shirt collar.
    image=next(n.image for n in mesh.active_material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    pixels=np.array(image.pixels[:]).reshape(image.size[1],image.size[0],4)
    colors=np.zeros((len(mesh.data.vertices),3));samples=np.zeros(len(mesh.data.vertices))
    for loop in mesh.data.loops:
        uv=mesh.data.uv_layers.active.data[loop.index].uv
        colors[loop.vertex_index]+=pixels[int(uv.y*image.size[1])%image.size[1],int(uv.x*image.size[0])%image.size[0],:3]
        samples[loop.vertex_index]+=1
    colors/=np.maximum(samples[:,None],1)
    def is_collar(p,index):
        color=colors[index]
        return number==2 and color[0]>.30 and -p.y<.052 and .72<p.z<.835 and abs(p.x)<.12 and color[0]>color[1]*1.4 and color[0]>color[2]*1.4
    def is_face(p,index):
        if is_collar(p,index): return False
        x,back,height=p
        beard_floor={1:.78,2:.758,3:.735,4:.775}[number]
        return height>=.795 or (height>=beard_floor and -back>.041 and abs(x)<.085)
    # Surface distances keep fingers attached to hands instead of nearby trousers.
    adjacency=[[] for _ in mesh.data.vertices]
    for edge in mesh.data.edges:
        a,b=edge.vertices
        length=(mesh.data.vertices[a].co-mesh.data.vertices[b].co).length
        adjacency[a].append((b,length));adjacency[b].append((a,length))
    def surface_distances(predicate):
        distances=[math.inf]*len(mesh.data.vertices);queue=[]
        for vertex in mesh.data.vertices:
            if predicate(vertex.co):
                distances[vertex.index]=0;heapq.heappush(queue,(0,vertex.index))
        while queue:
            cost,index=heapq.heappop(queue)
            if cost>distances[index]: continue
            for neighbor,length in adjacency[index]:
                candidate=cost+length
                if candidate<distances[neighbor]:
                    distances[neighbor]=candidate;heapq.heappush(queue,(candidate,neighbor))
        return distances
    arm_dist=surface_distances(lambda p: abs(p.x)>.17 and .36<p.z<.72)
    body_dist=surface_distances(lambda p: abs(p.x)<.10 or p.z>.80 or p.z<.30)
    for vertex in mesh.data.vertices:
        x,_,height=vertex.co
        side='L' if x<0 else 'R'
        ad,bd=arm_dist[vertex.index],body_dist[vertex.index]
        if math.isinf(ad) and math.isinf(bd):
            arm=float(abs(x)>.14 and .35<height<.76)
        else: arm=smooth(-.025,.025,bd-ad)
        # Sleeves can be disconnected shells; they must follow the same shoulder as the skin beneath.
        shoulder=smooth(.09,.13,abs(x))*(1-smooth(.735,.795,height))
        arm=arm+(shoulder-arm)*smooth(.58,.65,height)
        leg=(1-smooth(.435,.51,height))*(1-arm)
        torso=1-arm-leg
        weights={}
        for fraction,group_names in [(arm,[f'UpperArm_{side}',f'Forearm_{side}',f'Hand_{side}']),
            (leg,[f'Thigh_{side}',f'Shin_{side}',f'Foot_{side}']),
            (torso,['Hips','Spine'])]:
            raw=[1/max(.012,distance(vertex.co,*segments[name]))**4 for name in group_names]
            for name,value in zip(group_names,raw): weights[name]=fraction*value/sum(raw)
        hand_name=f'Hand_{side}'
        finger_fraction=1-smooth(wrist_y-.055,wrist_y-.025,height)
        fingers=weights.get(hand_name,0)*finger_fraction
        weights[hand_name]-=fingers
        candidates=finger_bones[side]
        raw=[1/max(.004,distance(vertex.co,*segments[name]))**5 for name in candidates]
        for name,value in zip(candidates,raw): weights[name]=fingers*value/sum(raw)
        neck=smooth(.737,.783,height)*(1-smooth(.06,.105,abs(x)))
        if neck:
            weights={name:weight*(1-neck) for name,weight in weights.items()}
            weights['Neck']=neck
        if is_face(vertex.co,vertex.index): weights={'Head':1};rigid_head.append(vertex.index)
        for name,weight in weights.items(): weights_array[vertex.index,names.index(name)]=weight
    # Smooth across the surface, then lock facial features and clean/normalize to four influences.
    edges=np.array([tuple(e.vertices) for e in mesh.data.edges],dtype=int)
    degree=np.bincount(edges.flatten(),minlength=len(mesh.data.vertices))
    for _ in range(6):
        sums=np.zeros_like(weights_array)
        np.add.at(sums,edges[:,0],weights_array[edges[:,1]])
        np.add.at(sums,edges[:,1],weights_array[edges[:,0]])
        weights_array=.65*weights_array+.35*sums/np.maximum(degree[:,None],1)
        weights_array[rigid_head]=0;weights_array[rigid_head,names.index('Head')]=1
        weights_array/=np.maximum(weights_array.sum(axis=1,keepdims=True),1e-12)
    # Match weights across disconnected neck/torso surfaces, retaining rigid beard geometry.
    for vertex in mesh.data.vertices:
        x,back,height=vertex.co
        if is_collar(vertex.co,vertex.index):
            weights_array[vertex.index]=0
            weights_array[vertex.index,names.index('Spine')]=1
        elif vertex.index not in rigid_head and .72<height<.795 and abs(x)<.105:
            neck=smooth(.725,.795,height)*(1-smooth(.065,.105,abs(x)))
            color=colors[vertex.index]
            cloth=(color[0]>color[1]*1.7 and color[0]>color[2]*1.7) or min(color)>.55
            if cloth: neck*=smooth(.775,.805,height)
            weights_array[vertex.index]=0
            weights_array[vertex.index,names.index('Spine')]=1-neck
            weights_array[vertex.index,names.index('Neck')]=neck
    for index,row in enumerate(weights_array):
        strongest=np.argsort(row)[-4:]
        strongest=[j for j in strongest if row[j]>.0001]
        total=sum(row[j] for j in strongest)
        assert total>0
        for j in strongest: mesh.vertex_groups[names[j]].add([index],float(row[j]/total),'REPLACE')
    for v in mesh.data.vertices:
        assert len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5
    assert all(len(v.groups) for v in mesh.data.vertices), 'Unweighted vertices'
    next(m for m in mesh.modifiers if m.type=='ARMATURE').use_deform_preserve_volume=True
    # Seat the legs, then bake that pose as the exported rest position.
    for side in ['L','R']:
        rig.pose.bones[f'Thigh_{side}'].rotation_mode='XYZ'
        rig.pose.bones[f'Thigh_{side}'].rotation_euler.x=-math.radians(70)
        rig.pose.bones[f'Shin_{side}'].rotation_mode='XYZ'
        rig.pose.bones[f'Shin_{side}'].rotation_euler.x=math.radians(70)
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.modifier_apply(modifier=next(m.name for m in mesh.modifiers if m.type=='ARMATURE'))
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    modifier=mesh.modifiers.new('Avatar skin - preserve volume','ARMATURE');modifier.object=rig
    modifier.use_deform_preserve_volume=True
    mesh['rig_quality']={'normalized':True,'max_influences':4,'smooth_passes':6,'rigid_face_vertices':len(rigid_head),'preserve_volume':True}
    # Export self-contained seated actions. Runtime IK refines the reach to the actual table.
    for bone in rig.pose.bones: bone.rotation_mode='XYZ'
    from mathutils import Matrix
    def aim(name,target):
        bone=rig.pose.bones[name]
        current=bone.matrix.to_quaternion()
        direction=(target-bone.head).normalized()
        turn=(current @ Vector((0,1,0))).rotation_difference(direction)
        bone.matrix=Matrix.Translation(bone.head) @ (turn @ current).to_matrix().to_4x4()
        bpy.context.view_layer.update()
    def arm_pose(side,reach):
        s=-1 if side=='L' else 1
        # Elbow stays lower than the wrist and clear of the torso.
        aim(f'UpperArm_{side}',point(s*.16,.64,.09+reach*.5))
        aim(f'Forearm_{side}',point(s*.14,.73,.25+reach))
        lower=rig.pose.bones[f'Forearm_{side}']
        lower.rotation_euler=(lower.rotation_euler.to_quaternion() @ Quaternion((0,1,0),-1.1)).to_euler()
        bpy.context.view_layer.update()
        hand=rig.pose.bones[f'Hand_{side}']
        aim(f'Hand_{side}',hand.head+Vector((0,-1,0)))
    actions={
        'SeatedIdle':(121,0), 'HoldCards':(61,0), 'DealReceive':(31,.035),
        'PlayCards':(42,.18), 'Accuse':(61,.04), 'CollectCards':(46,.12),
        'React':(61,-.08), 'Celebrate':(91,-.03),
    }
    rig.animation_data_create()
    for name,(length,lean) in actions.items():
        action=bpy.data.actions.new(name);action.use_fake_user=True
        rig.animation_data.action=action
        for frame,amount in [(1,0),(round(length*.36),1),(round(length*.65),1),(length,0)]:
            for bone in rig.pose.bones: bone.rotation_euler=(0,0,0)
            rig.pose.bones['Spine'].rotation_euler.x=lean*amount+(.008 if name=='SeatedIdle' else 0)*math.sin(frame/length*math.tau)
            bpy.context.view_layer.update()
            arm_pose('L',.03*amount if name=='CollectCards' else 0)
            arm_pose('R',.055*amount if name=='PlayCards' else 0)
            if name=='Accuse':
                aim('UpperArm_L',point(-.14,.75,.2))
                aim('Forearm_L',point(-.14,.77,.42))
                aim('Hand_L',point(-.14,.78,.5))
            if name=='Celebrate':
                aim('UpperArm_L',point(-.18,.81,.06))
                aim('Forearm_L',point(-.2,.98,.12))
            for side in ['L','R']:
                for finger in finger_names:
                    grip=.20 if side=='R' else .08
                    if name=='PlayCards' and side=='L': grip=.22*(1-.7*amount)
                    if name=='Accuse' and side=='L': grip=.7 if finger not in ['Index','Thumb'] else -.1 if finger=='Index' else .2
                    if name=='Celebrate' and side=='L': grip=.7
                    for joint in range(1,4):
                        rig.pose.bones[f'{finger}{joint}_{side}'].rotation_euler.x=-grip*([.7,1,.65][joint-1])
            if name=='React': rig.pose.bones['Neck'].rotation_euler.z=.06*amount
            for bone in rig.pose.bones:
                if bone.name in ['Hips','Spine','Neck','Head'] or any(k in bone.name for k in ['Arm','Forearm','Hand']+finger_names):
                    bone.keyframe_insert(data_path='rotation_euler',frame=frame)
    for bone in rig.pose.bones:
        if bone.name=='Neck': limits=((-25,-55,-12),(25,55,12))
        elif bone.name=='Head': limits=((-5,-5,-5),(5,5,5))
        elif bone.name=='Spine': limits=((-15,-12,-10),(18,12,10))
        elif bone.name.startswith('UpperArm'): limits=((-145,-90,-110),(145,90,110))
        elif bone.name.startswith('Forearm'): limits=((-145,-90,-85),(5,90,85))
        elif bone.name.startswith('Hand'): limits=((-55,-35,-40),(55,35,40))
        elif any(bone.name.startswith(f) for f in finger_names): limits=((-90,-12,-12),(15,12,12))
        else: continue
        constraint=bone.constraints.new('LIMIT_ROTATION');constraint.name='Anatomical rotation limits'
        constraint.owner_space='LOCAL';constraint.use_transform_limit=True
        for axis,index in zip('xyz',range(3)):
            setattr(constraint,'use_limit_'+axis,True)
            setattr(constraint,'min_'+axis,math.radians(limits[0][index]))
            setattr(constraint,'max_'+axis,math.radians(limits[1][index]))
        bone.bone['rotation_limits_degrees']={'min':list(limits[0]),'max':list(limits[1])}
    rig.animation_data.action=bpy.data.actions['SeatedIdle']
    bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=121
    bpy.context.scene.render.fps=30
    # Rest geometry remains seated; no active action is baked into the bind pose.
    rig.animation_data.action=None
    for bone in rig.pose.bones: bone.rotation_euler=(0,0,0)
    bpy.context.scene.frame_set(1)
    dest=ROOT/'puplic/models'/f'avatar{number}.glb'
    if not (backup/dest.name).exists(): shutil.copy2(dest,backup/dest.name)
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',use_selection=True,
        export_animations=True,export_animation_mode='ACTIONS',export_yup=True,export_extras=True)
    rig.animation_data.action=bpy.data.actions['SeatedIdle']
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'avatar{number}-rigged.blend'))
    return {'avatar':number,'vertices':len(mesh.data.vertices),'bones':len(data.bones),
        'finger_bones':30,'rigid_face_vertices':len(rigid_head),'weight_sum_max_error':max(abs(sum(g.weight for g in v.groups)-1) for v in mesh.data.vertices),
        'max_influences':max(len(v.groups) for v in mesh.data.vertices),
        'rotation_limited_bones':sum(bool(b.constraints) for b in rig.pose.bones),
        'preserve_volume':modifier.use_deform_preserve_volume}

report=[build(i) for i in range(1,5)]
(OUT/'rig-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
