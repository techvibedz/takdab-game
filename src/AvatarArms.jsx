import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AnimationMixer, LoopOnce, LoopRepeat, Quaternion, Vector3 } from 'three'
import { handPoint, seatPoint, playPoint, smooth } from './tableMotion'
import { avatarAnimation, poseArm, updateAvatarMixer, orientHand, handGoal, gripAnchor, PALM_SIDE } from './avatarRig'

// Game timing is authoritative; IK aligns the original textured hands with the cards.
export function AvatarArms({ rig, clips, playerId, game, motion, handAnchor, playAnchor }) {
  const v = useMemo(() => ({ target: new Vector3(), pole: new Vector3(), forward: new Vector3(),
    palm: new Quaternion(), axis: new Vector3(0, 1, 0), palmX: new Vector3(), palmZ: new Vector3() }), [])
  const mixer = useMemo(() => new AnimationMixer(rig.root), [rig])
  const animationClips = useMemo(() => Object.fromEntries(clips.map(clip => {
    const copy = clip.clone()
    copy.tracks = copy.tracks.filter(track => !/^(Head|Neck)\./.test(track.name))
    return [clip.name, copy]
  })), [clips])
  const animation = avatarAnimation(game, playerId)
  useEffect(() => {
    const clip = animationClips[animation]
    if (!clip) throw new Error(`Missing avatar animation: ${animation}`)
    // Reacquire bindings after StrictMode or hot reload has cleaned up the mixer.
    const action = mixer.clipAction(clip)
    const repeating = ['SeatedIdle', 'HoldCards', 'DealReceive', 'Celebrate'].includes(animation)
    action.reset().setLoop(repeating ? LoopRepeat : LoopOnce, repeating ? Infinity : 1)
    action.clampWhenFinished = true
    if (animation === 'PlayCards') action.setDuration(1.35)
    if (animation === 'CollectCards') action.setDuration(0.9)
    action.fadeIn(0.18).play()
    return () => { action.fadeOut(0.18) }
  }, [mixer, animationClips, animation, game.playId])
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(rig.root) }, [mixer, rig])
  useFrame((state, delta) => {
    updateAvatarMixer(rig, mixer, delta, state.clock.elapsedTime, playerId)
    const playing = game.lastPlay?.playerId === playerId && game.phase === 'playing'
    const collecting = game.phase === 'collect' && game.challenge?.loser === playerId
    const winner = game.placements?.[0] === playerId
    const emptyHanded = game.phase !== 'dealing' && !playing && !collecting && (game.hands[playerId].length === 0 || game.placements?.includes(playerId))
    rig.root.updateWorldMatrix(true, true)
    rig.arms.forEach((arm, index) => {
      const holding = index === 1
      const accusing = !holding && game.challenge?.caller === playerId && game.phase === 'reveal'
      v.target.fromArray(handPoint(playerId, holding, game.seats))
      if (!holding && playing) {
        const t = motion.current
        v.target.lerp(v.forward.fromArray(handPoint(playerId, true, game.seats)), smooth(t / .18))
        v.target.lerp(v.forward.fromArray(playPoint(playerId, game.seats)), smooth((t - .18) / .30))
        v.target.lerp(v.forward.fromArray(handPoint(playerId, false, game.seats)), smooth((t - .82) / .53))
      }
      if (holding && collecting) {
        v.target.fromArray(seatPoint(playerId, 0.23, 0.47, 0.57, game.seats))
        v.target.y += Math.sin(Math.min(motion.current / 1.2, 1) * Math.PI) * 0.06
      }
      if (accusing) {
        // A clear "you!": the hand goes forward and up in front of the face, offset toward the accused. Aiming the
        // arm straight at someone on the card-hand side folded it across the chest into the card hand.
        rig.arms[0].upper.getWorldPosition(v.forward); rig.arms[1].upper.getWorldPosition(v.palmZ)
        v.forward.add(v.palmZ).multiplyScalar(.5)
        v.palmZ.set(0, 0, 1).applyAxisAngle(v.axis, game.seats[playerId].rotation[1])
        v.target.fromArray(game.seats[game.challenge.accused].position).sub(v.forward); v.target.y = 0
        v.palmX.copy(v.palmZ).multiplyScalar(v.target.dot(v.palmZ)); v.target.sub(v.palmX)
        const lateral = v.target.length() // zero when the accused sits straight across
        v.target.multiplyScalar(lateral > 1e-3 ? .14 / lateral : 0).addScaledVector(v.palmZ, .38).add(v.forward); v.target.y += .16
      }
      // While accusing, the card hand drops to the table edge and out of the way, so the point clears the fan.
      if (holding && game.challenge?.caller === playerId && game.phase === 'reveal') v.target.fromArray(seatPoint(playerId, .33, .42, playerId === 0 ? .6 : .5, game.seats))
      // A player out of cards rests the card hand on the felt like the other one; nobody grips thin air.
      if (holding && emptyHanded) v.target.fromArray(seatPoint(playerId, .26, .385, playerId === 0 ? .65 : .53, game.seats))
      if (!holding && winner) {
        // Winner's fist pump: up, a beat, up again, settling into a held raise.
        const t = state.clock.elapsedTime
        v.target.fromArray(seatPoint(playerId, -0.24, .98, 0.3, game.seats))
        v.target.y += Math.abs(Math.sin(t * 4.2)) * .07
      }
      const gesturing = game.challenge?.caller === playerId && game.phase === 'reveal'
      const idle = !playing && !collecting && !gesturing && game.phase !== 'dealing'
      // Small hand drift so seated players never freeze; the holding hand carries its cards with it.
      if (idle) v.target.y += Math.sin(state.clock.elapsedTime * (holding ? 1.3 : .9) + playerId * 2 + index) * (holding ? .008 : .004)
      if (!arm.initialized) { arm.target.copy(v.target); arm.initialized = true }
      // Card motion is time-critical; everything else eases like a relaxed arm instead of snapping.
      arm.target.lerp(v.target, 1 - Math.exp(-(playing || collecting || game.phase === 'dealing' ? 26 : gesturing ? 11 : 9) * delta))
      v.pole.set(holding ? .35 : -.35, -1, -.12).applyAxisAngle(v.axis, game.seats[playerId].rotation[1])
      poseArm(arm, arm.target, v.pole, 0)
      const side = holding ? PALM_SIDE.R : PALM_SIDE.L, seatAngle = game.seats[playerId].rotation[1]
      if (accusing) {
        arm.hand.getWorldPosition(v.forward)
        v.palmZ.fromArray(game.seats[game.challenge.accused].position); v.palmZ.y = 0.95
        v.palmZ.sub(v.forward).normalize()
      }
      const kind = holding ? (emptyHanded ? 'rest' : 'hold') : accusing ? 'point' : playing ? 'place' : winner ? 'raise' : 'rest'
      orientHand(arm, handGoal(kind, seatAngle, side, v.palm, v.palmZ))
      // Same actual hand transform drives the grip, held cards and flight endpoints.
      const anchor = holding ? handAnchor.current : playAnchor.current
      if (anchor) gripAnchor(arm.hand, side, anchor)
    })
  }, -0.5)
  return null
}
