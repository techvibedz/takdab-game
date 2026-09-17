import fs from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Euler, Group, Vector3 } from 'three'
import { rigAvatar, poseArm, AVATAR_SCALE, avatarFits } from '../src/avatarRig.js'
import { handPoint, SEATS } from '../src/tableMotion.js'
globalThis.ProgressEvent=class {constructor(type,v){Object.assign(this,v)}}
const b=fs.readFileSync('puplic/models/avatar1.glb'),len=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+len))
delete j.images;delete j.textures;delete j.materials
for(const m of j.meshes)for(const p of m.primitives)delete p.material
j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+len).toString('base64')
const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(j),'')
const rig=rigAvatar(scene,avatarFits['/models/avatar1.glb'],false),g=new Group()
g.position.fromArray(SEATS[0].position);g.rotation.fromArray(SEATS[0].rotation);g.add(scene)
scene.scale.setScalar(AVATAR_SCALE);scene.position.set(0,.48-.405*AVATAR_SCALE,.30);g.updateMatrixWorld(true)
for(const [i,a] of rig.arms.entries()){
 const target=new Vector3(...handPoint(0,i===1)),p=poseArm(a,target,new Vector3(0,-1,0));
 console.log(i,'target',target.toArray(),'wrist',p.toArray(),'error',p.distanceTo(target),'upper',new Euler().setFromQuaternion(a.upperRest.clone().invert().multiply(a.upper.quaternion)).toArray(),'lower',new Euler().setFromQuaternion(a.lowerRest.clone().invert().multiply(a.lower.quaternion)).toArray())
}
