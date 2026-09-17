import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { preserveVolume } from './volumeSkinning.js'

export const AVATAR_SCALE = 1.9
export const avatarFits = Object.fromEntries([1, 2, 3, 4].map(i =>
  [`/models/avatar${i}.glb`, { contact: [0, 0.405, 0] }]))

export function avatarAnimation(game, playerId) {
  if (game.placements?.includes(playerId)) return game.placements[0] === playerId ? 'Celebrate' : 'SeatedIdle'
  if (game.phase === 'dealing') return 'DealReceive'
  if (game.phase === 'playing' && game.lastPlay?.playerId === playerId) return 'PlayCards'
  if (game.phase === 'reveal' && game.challenge?.caller === playerId) return 'Accuse'
  if (game.phase === 'reveal' && game.challenge?.accused === playerId) return 'React'
  if (game.phase === 'collect' && game.challenge?.loser === playerId) return 'CollectCards'
  return game.hands[playerId].length ? 'HoldCards' : 'SeatedIdle'
}

export function rigAvatar(root, fit, local) {
  const bone = name => {
    const result = root.getObjectByName(name)
    if (!result?.isBone) throw new Error(`Avatar is missing bone ${name}`)
    return result
  }
  const meshes = [], geometries = [], materials = [], skeletons = new Set()
  root.traverse(node => {
    if (!node.isSkinnedMesh) return
    meshes.push(node); skeletons.add(node.skeleton)
    materials.push(...preserveVolume(node))
    node.castShadow = node.receiveShadow = true
    node.frustumCulled = false
    if (local) {
      const geometry = node.geometry.clone(), visible = []
      const positions = geometry.attributes.position, source = geometry.index
      for (let i = 0; i < (source?.count ?? positions.count); i += 3) {
        const triangle = [0, 1, 2].map(j => source ? source.getX(i + j) : i + j)
        if (triangle.every(j => positions.getY(j) < 0.77)) visible.push(...triangle)
      }
      geometry.setIndex(visible); node.geometry = geometry; geometries.push(geometry)
    }
  })
  if (!meshes.length) throw new Error('Avatar has no skinned mesh')
  const arms = ['L', 'R'].map(side => {
    const upper = bone(`UpperArm_${side}`), lower = bone(`Forearm_${side}`), hand = bone(`Hand_${side}`)
    return { upper, lower, hand, upperRest: upper.quaternion.clone(), lowerRest: lower.quaternion.clone(),
      handRest: hand.quaternion.clone(), upperAxis: lower.position.clone().normalize(), lowerAxis: hand.position.clone().normalize(),
      upperLength: lower.position.length(), lowerLength: hand.position.length(),
      target: new Vector3(), initialized: false }
  })
  return { root, head: bone('Head'), neck: bone('Neck'), headRest: bone('Head').quaternion.clone(), neckRest: bone('Neck').quaternion.clone(),
    spine: bone('Spine'), spineRest: bone('Spine').quaternion.clone(), body: bone('Hips'), arms,
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); skeletons.forEach(s => s.dispose()) } }
}

const limitRotation = new Quaternion(), limitEuler = new Euler(), twist = new Quaternion()
export function limitJoint(bone, rest, min, max) {
  limitRotation.copy(rest).invert().multiply(bone.quaternion)
  limitEuler.setFromQuaternion(limitRotation, 'XYZ')
  limitEuler.set(MathUtils.clamp(limitEuler.x,min[0],max[0]),MathUtils.clamp(limitEuler.y,min[1],max[1]),MathUtils.clamp(limitEuler.z,min[2],max[2]))
  bone.quaternion.copy(rest).multiply(limitRotation.setFromEuler(limitEuler))
  bone.updateWorldMatrix(false,true)
}

export function poseNeck(rig, angles, delta) {
  limitEuler.set(MathUtils.clamp(angles.x,-.28,.28),MathUtils.clamp(angles.y,-.60,.60),MathUtils.clamp(angles.z,-.12,.12),'YXZ')
  limitRotation.setFromEuler(limitEuler).premultiply(rig.neckRest)
  rig.neck.quaternion.slerp(limitRotation,1-Math.exp(-6*delta))
  rig.head.quaternion.copy(rig.headRest)
}

export function updateAvatarMixer(rig, mixer, delta, seconds, playerId) {
  // Constant tracks can be omitted by GLB export. Reset before adding breathing so it cannot accumulate.
  rig.spine.quaternion.copy(rig.spineRest)
  mixer.update(delta)
  rig.spine.rotation.x += Math.sin(seconds * 1.8 + playerId) * 0.006
}

const shoulder = new Vector3(), direction = new Vector3(), bend = new Vector3(), elbow = new Vector3(), wrist = new Vector3()
const parentRotation = new Quaternion(), restWorld = new Quaternion(), rotation = new Quaternion(), axis = new Vector3()
const scale = new Vector3()

function aim(bone, rest, localAxis, target) {
  bone.parent.getWorldQuaternion(parentRotation)
  restWorld.copy(parentRotation).multiply(rest)
  bone.getWorldPosition(direction)
  direction.subVectors(target, direction).normalize()
  axis.copy(localAxis).applyQuaternion(restWorld)
  rotation.setFromUnitVectors(axis, direction).multiply(restWorld)
  bone.quaternion.copy(parentRotation.invert().multiply(rotation))
  bone.updateWorldMatrix(false, true)
}

// Two-bone IK preserves limb length, including targets beyond the arm's reach.
export function poseArm(arm, target, pole, pronation = -1.1) {
  arm.upper.getWorldPosition(shoulder)
  arm.upper.getWorldScale(scale)
  const a = arm.upperLength * scale.y, b = arm.lowerLength * scale.y
  direction.subVectors(target, shoulder)
  if (direction.lengthSq() < 1e-10) direction.set(0, 0, 1)
  const minReach=Math.sqrt(a*a+b*b+2*a*b*Math.cos(MathUtils.degToRad(145)))
  const maxReach=Math.sqrt(a*a+b*b+2*a*b*Math.cos(MathUtils.degToRad(5)))
  const distance = MathUtils.clamp(direction.length(), minReach, maxReach)
  direction.normalize()
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  bend.copy(pole).addScaledVector(direction, -pole.dot(direction))
  if (bend.lengthSq() < 0.0001) {
    bend.set(Math.abs(direction.x) < 0.9 ? 1 : 0, 0, Math.abs(direction.x) < 0.9 ? 0 : 1)
    bend.addScaledVector(direction, -bend.dot(direction))
  }
  bend.normalize()
  elbow.copy(shoulder).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
  wrist.copy(shoulder).addScaledVector(direction, distance)
  aim(arm.upper, arm.upperRest, arm.upperAxis, elbow)
  limitJoint(arm.upper,arm.upperRest,[-2.53,-1.57,-1.92],[2.53,1.57,1.92])
  aim(arm.lower, arm.lowerRest, arm.lowerAxis, wrist)
  // Elbow flexion is limited geometrically above; pronation rotates around the forearm axis without moving the wrist.
  arm.lower.quaternion.multiply(twist.setFromAxisAngle(arm.lowerAxis,pronation))
  arm.lower.updateWorldMatrix(false,true)
  return arm.hand.getWorldPosition(wrist)
}
