import { Matrix4, MeshDepthMaterial, MeshDistanceMaterial, Quaternion, RGBADepthPacking, Vector3 } from 'three'

// glTF stores linear skinning. Use dual quaternions for the visible mesh, shadows and CPU picking.
// The avatar rig uses rigid joints and a uniform character scale.
const quaternionGLSL = `
vec4 dqMultiply(vec4 a, vec4 b) {
  return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz), a.w*b.w-dot(a.xyz,b.xyz));
}
vec4 dqRotation(mat4 bone) {
  mat3 m=mat3(bone)/length(bone[0].xyz);
  float t=m[0][0]+m[1][1]+m[2][2];
  vec4 q;
  if(t>0.0) { float s=sqrt(t+1.0)*2.0; q=vec4((m[1][2]-m[2][1])/s,(m[2][0]-m[0][2])/s,(m[0][1]-m[1][0])/s,s*.25); }
  else if(m[0][0]>m[1][1] && m[0][0]>m[2][2]) { float s=sqrt(1.0+m[0][0]-m[1][1]-m[2][2])*2.0; q=vec4(s*.25,(m[1][0]+m[0][1])/s,(m[2][0]+m[0][2])/s,(m[1][2]-m[2][1])/s); }
  else if(m[1][1]>m[2][2]) { float s=sqrt(1.0+m[1][1]-m[0][0]-m[2][2])*2.0; q=vec4((m[1][0]+m[0][1])/s,s*.25,(m[2][1]+m[1][2])/s,(m[2][0]-m[0][2])/s); }
  else { float s=sqrt(1.0+m[2][2]-m[0][0]-m[1][1])*2.0; q=vec4((m[2][0]+m[0][2])/s,(m[2][1]+m[1][2])/s,s*.25,(m[0][1]-m[1][0])/s); }
  return normalize(q);
}
vec3 dqRotate(vec4 q, vec3 p) { return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p); }
`

const blendGLSL = `
#ifdef USE_SKINNING
vec4 dq0=dqRotation(boneMatX), dq1=dqRotation(boneMatY), dq2=dqRotation(boneMatZ), dq3=dqRotation(boneMatW);
dq1*=dot(dq0,dq1)<0.0?-1.0:1.0;
dq2*=dot(dq0,dq2)<0.0?-1.0:1.0;
dq3*=dot(dq0,dq3)<0.0?-1.0:1.0;
vec4 dqReal=skinWeight.x*dq0+skinWeight.y*dq1+skinWeight.z*dq2+skinWeight.w*dq3;
vec4 dqDual=.5*(skinWeight.x*dqMultiply(vec4(boneMatX[3].xyz,0.0),dq0)
 +skinWeight.y*dqMultiply(vec4(boneMatY[3].xyz,0.0),dq1)
 +skinWeight.z*dqMultiply(vec4(boneMatZ[3].xyz,0.0),dq2)
 +skinWeight.w*dqMultiply(vec4(boneMatW[3].xyz,0.0),dq3));
float dqLength=max(length(dqReal),.000001);
dqReal/=dqLength;dqDual/=dqLength;
dqDual-=dqReal*dot(dqReal,dqDual);
float dqScale=length(boneMatX[0].xyz);
vec3 dqTranslation=2.0*(dqReal.w*dqDual.xyz-dqDual.w*dqReal.xyz+cross(dqReal.xyz,dqDual.xyz));
#endif
`

export function volumeMaterial(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n' + quaternionGLSL)
      .replace('#include <skinbase_vertex>', '#include <skinbase_vertex>\n' + blendGLSL)
      .replace('#include <skinning_vertex>', `
        #ifdef USE_SKINNING
        vec3 dqVertex=(bindMatrix*vec4(transformed,1.0)).xyz;
        transformed=(bindMatrixInverse*vec4(dqRotate(dqReal,dqVertex*dqScale)+dqTranslation,1.0)).xyz;
        #endif`)
      .replace('#include <skinnormal_vertex>', `
        #ifdef USE_SKINNING
        objectNormal=mat3(bindMatrixInverse)*dqRotate(dqReal,mat3(bindMatrix)*objectNormal);
        #ifdef USE_TANGENT
        objectTangent=mat3(bindMatrixInverse)*dqRotate(dqReal,mat3(bindMatrix)*objectTangent);
        #endif
        #endif`)
  }
  material.customProgramCacheKey = () => 'avatar-dual-quaternion-v1'
  return material
}

const matrix = new Matrix4(), translation = new Vector3(), scale = new Vector3()
const q = new Quaternion(), dual = new Quaternion(), realSum = new Quaternion(), dualSum = new Quaternion(), reference = new Quaternion()

export function applyVolumeSkin(mesh, index, position) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes
  realSum.set(0, 0, 0, 0); dualSum.set(0, 0, 0, 0)
  let uniformScale = 1
  for (let i = 0; i < 4; i++) {
    const joint = skinIndex.getComponent(index, i), weight = skinWeight.getComponent(index, i)
    if (!weight) continue
    matrix.multiplyMatrices(mesh.skeleton.bones[joint].matrixWorld, mesh.skeleton.boneInverses[joint])
    matrix.decompose(translation, q, scale); uniformScale = scale.x
    if (i === 0) reference.copy(q)
    const sign = reference.dot(q) < 0 ? -1 : 1, w = weight * sign
    dual.set(translation.x, translation.y, translation.z, 0).multiply(q)
    realSum.set(realSum.x + q.x * w, realSum.y + q.y * w, realSum.z + q.z * w, realSum.w + q.w * w)
    dualSum.set(dualSum.x + dual.x * w * .5, dualSum.y + dual.y * w * .5, dualSum.z + dual.z * w * .5, dualSum.w + dual.w * w * .5)
  }
  const length = realSum.length()
  realSum.normalize()
  dualSum.set(dualSum.x / length, dualSum.y / length, dualSum.z / length, dualSum.w / length)
  dual.copy(realSum).conjugate(); dualSum.multiply(dual)
  translation.set(dualSum.x * 2, dualSum.y * 2, dualSum.z * 2)
  return position.applyMatrix4(mesh.bindMatrix).multiplyScalar(uniformScale).applyQuaternion(realSum).add(translation).applyMatrix4(mesh.bindMatrixInverse)
}

export function preserveVolume(mesh) {
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => volumeMaterial(m.clone()))
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  mesh.customDepthMaterial = volumeMaterial(new MeshDepthMaterial({ depthPacking: RGBADepthPacking }))
  mesh.customDistanceMaterial = volumeMaterial(new MeshDistanceMaterial())
  mesh.applyBoneTransform = function(index, position) { return applyVolumeSkin(this, index, position) }
  return [...materials, mesh.customDepthMaterial, mesh.customDistanceMaterial]
}
