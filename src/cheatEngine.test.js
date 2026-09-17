import { createGameAudio } from './useGameAudio.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { AnimationMixer, Bone, BufferAttribute, BufferGeometry, Euler, Group, Matrix4, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { avatarFits, rigAvatar, poseArm, poseNeck, avatarAnimation, updateAvatarMixer, AVATAR_SCALE } from './avatarRig.js'
import { applyVolumeSkin } from './volumeSkinning.js'
import { number, rankName } from './arabic.js'
import { createGame as createDealingGame, cheatReducer, RANKS } from './cheatEngine.js'
import { CARD_SCALE, seatsFor, cardInHand, handPoint, playReach, PLAY_SECONDS, RELEASE_SECONDS, SEATS } from './tableMotion.js'

const createGame = () => {
  let seed = 7
  const game = createDealingGame(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32))
  return cheatReducer(cheatReducer(game, { type: 'DEAL_PROGRESS', count: 52 }), { type: 'CHOOSE_RANK', rank: 'Ace' })
}
const play = (state, indices) => {
  const next = cheatReducer(state, { type: 'PLAY', playerId: state.turnPlayerIndex, indices })
  return next.phase === 'playing' ? cheatReducer(next, { type: 'PLAY_COMPLETE', playId: next.lastPlay.id }) : next
}
const act = (state, type) => {
  let next = cheatReducer(state, { type, playerId: state.turnPlayerIndex })
  if (type === 'CALL' && next.phase === 'reveal') {
    next = cheatReducer(next, { type: 'COLLECT', playerId: next.turnPlayerIndex, playId: next.lastPlay.id })
    next = cheatReducer(next, { type: 'RESOLVE', playerId: next.turnPlayerIndex, playId: next.lastPlay.id })
  }
  return next
}
function conserved(state) {
  const cards = [...state.hands.flat(), ...state.centerPile, ...state.discardedCards]
  assert.equal(cards.length, 52)
  assert.equal(new Set(cards.map(card => card.id)).size, 52)
}

test('legal deal, turns and selection validation', () => {
  const state = createGame()
  assert.ok(state.hands.every(hand => hand.length <= 13))
  for (const hand of state.hands) for (const rank of RANKS) assert.notEqual(hand.filter(card => card.rank === rank).length, 4)
  conserved(state)
  assert.equal(play(state, []), state)
  assert.equal(play(state, [0, 0]), state)
  assert.equal(play(state, [-1]), state)
  assert.equal(cheatReducer(state, { type: 'PLAY', playerId: 2, indices: [0] }), state)
  assert.equal(act(state, 'CALL'), state)
})

test('four cards of one rank are automatically discarded after dealing and collecting', () => {
  const dealt = createDealingGame(() => 0.4)
  const deck = dealt.hands.flat(), aces = deck.filter(card => card.rank === 'Ace'), others = deck.filter(card => card.rank !== 'Ace')
  const arranged = [
    [...aces, ...others.slice(0, 9)],
    others.slice(9, 22),
    others.slice(22, 35),
    others.slice(35),
  ]
  let state = cheatReducer({ ...dealt, hands: arranged }, { type: 'DEAL_PROGRESS', count: 52 })
  assert.equal(state.hands[0].length, 9)
  assert.deepEqual(state.discardedCards.map(card => card.rank), ['Ace', 'Ace', 'Ace', 'Ace'])
  conserved(state)

  const threes = deck.filter(card => card.rank === '3'), rest = deck.filter(card => card.rank !== '3')
  state = { ...dealt, dealtCount: 52, phase: 'collect', turnPlayerIndex: 0, placements: [], discardedCards: [],
    hands: [[...threes.slice(0, 3), rest[0]], rest.slice(1, 17), rest.slice(17, 33), rest.slice(33)], centerPile: [threes[3]],
    currentRank: '3', lastPlay: { playerId: 1, claimedRank: '3', actualCards: [threes[3]], id: 1 },
    challenge: { caller: 0, accused: 1, loser: 0, lied: false } }
  state = cheatReducer(state, { type: 'RESOLVE', playerId: 0, playId: 1 })
  assert.equal(state.hands[0].length, 1)
  assert.equal(state.discardedCards.length, 4)
  conserved(state)
})

test('a lying player receives the whole pile; challenge cannot repeat', () => {
  const initial = createGame()
  const i = initial.hands[0].findIndex(card => card.rank !== 'Ace')
  const played = play(initial, [i])
  const resolved = act(played, 'CALL')
  assert.equal(resolved.hands[0].length, 13)
  assert.equal(resolved.centerPile.length, 0)
  assert.equal(resolved.currentRank, null)
  assert.equal(resolved.turnPlayerIndex, 1)
  assert.equal(act(resolved, 'CALL'), resolved)
  conserved(resolved)
})

test('truthful claim penalizes caller and compares recorded rank', () => {
  let state = createGame()
  state.currentRank = state.hands[0][0].rank
  const resolved = act(play(state, [0]), 'CALL')
  assert.equal(resolved.hands[1].length, 14)
  assert.equal(resolved.hands[0].length, 12)
  conserved(resolved)
})

test('any player except the accused can call cheat outside their turn', () => {
  let state = createGame()
  state.currentRank = state.hands[0][0].rank
  const played = play(state, [0])
  const revealing = cheatReducer(played, { type: 'CALL', playerId: 2 })
  assert.equal(revealing.phase, 'reveal')
  assert.deepEqual(revealing.challenge, { caller: 2, accused: 0, loser: 2, lied: false })
  assert.equal(cheatReducer(played, { type: 'CALL', playerId: 0 }), played)
})

test('rank stays fixed and an empty player is placed only after challenge resolution', () => {
  let state = createGame()
  state.currentRank = 'King'
  state = act(play(state, [0]), 'ADVANCE')
  assert.equal(state.currentRank, 'King')
  const first = state.hands[1][0]
  state.centerPile.push(...state.hands[1].slice(1))
  state.hands[1] = [first]
  state.currentRank = first.rank
  const played = play(state, [0])
  assert.equal(played.winner, null)
  assert.deepEqual(act(played, 'ADVANCE').placements, [1])
  assert.deepEqual(act(played, 'CALL').placements, [1])
  const bluff = play({ ...state, currentRank: RANKS.find(rank => rank !== first.rank) }, [0])
  const caught = act(bluff, 'CALL')
  assert.equal(caught.winner, null)
  assert.ok(caught.hands[1].length > 0)
  conserved(caught)
})

test('players finish first through fourth while the remaining game continues', () => {
  let state = createGame()
  const deck = [...state.hands.flat(), ...state.discardedCards]
  state = { ...state, hands: [[deck[0]], [deck[1]], [deck[2]], [deck[3]]], centerPile: deck.slice(4), discardedCards: [], placements: [], currentRank: 'Ace' }
  state = act(play(state, [0]), 'ADVANCE')
  assert.deepEqual(state.placements, [0]); assert.equal(state.winner, null); assert.equal(state.turnPlayerIndex, 1)
  state = act(play(state, [0]), 'ADVANCE')
  assert.deepEqual(state.placements, [0, 1]); assert.equal(state.winner, null); assert.equal(state.turnPlayerIndex, 2)
  state = act(play(state, [0]), 'ADVANCE')
  assert.deepEqual(state.placements, [0, 1, 2, 3]); assert.equal(state.winner, 0); assert.equal(state.phase, 'finished')
  conserved(state)
})

test('repeated rounds conserve every card and enforce phase transitions', () => {
  let state = createGame()
  for (let i = 0; i < 500 && state.winner === null; i++) {
    if (state.currentRank === null) state = cheatReducer(state, { type: 'CHOOSE_RANK', playerId: state.turnPlayerIndex, rank: 'Queen' })
    state = state.phase === 'challenge' ? act(state, i % 3 ? 'ADVANCE' : 'CALL') : play(state, [0])
    conserved(state)
  }
})

test('challenge reveals every last-play card before collecting and blocks intervening actions', () => {
  const played = play(createGame(), [0, 1, 2])
  const revealing = cheatReducer(played, { type: 'CALL', playerId: 1 })
  assert.equal(revealing.phase, 'reveal')
  assert.equal(revealing.lastPlay.actualCards.length, 3)
  assert.deepEqual(revealing.hands, played.hands)
  assert.deepEqual(revealing.centerPile, played.centerPile)
  for (const type of ['CALL', 'PLAY', 'ADVANCE', 'SELECT']) {
    assert.equal(cheatReducer(revealing, { type, playerId: 1, indices: [0], index: 0 }), revealing)
  }
  assert.equal(cheatReducer(revealing, { type: 'RESOLVE', playerId: 1, playId: played.lastPlay.id }), revealing)
  assert.equal(cheatReducer(revealing, { type: 'COLLECT', playerId: 1, playId: -1 }), revealing)
  const collecting = cheatReducer(revealing, { type: 'COLLECT', playerId: 1, playId: played.lastPlay.id })
  assert.equal(collecting.phase, 'collect')
  conserved(collecting)
  const resolved = cheatReducer(collecting, { type: 'RESOLVE', playerId: 1, playId: played.lastPlay.id })
  assert.equal(resolved.centerPile.length, 0)
  assert.equal(resolved.phase, 'play')
  conserved(resolved)
})

test('dealing and arm movement gate input, conserve cards, and reset cleanly', () => {
  let state = createDealingGame()
  for (const type of ['SELECT', 'PLAY', 'CALL', 'ADVANCE', 'PLAY_COMPLETE']) {
    assert.equal(cheatReducer(state, { type, index: 0, indices: [0] }), state)
  }
  for (const count of [-1, 53, 1.5, NaN]) assert.equal(cheatReducer(state, { type: 'DEAL_PROGRESS', count }), state)
  for (let count = 1; count <= 52; count++) {
    state = cheatReducer(state, { type: 'DEAL_PROGRESS', count })
    assert.equal(state.phase, count === 52 ? 'play' : 'dealing')
    conserved(state)
  }
  state = cheatReducer(state, { type: 'CHOOSE_RANK', rank: 'Ace' })
  state = cheatReducer(state, { type: 'PLAY', indices: [0, 1] })
  assert.equal(state.phase, 'playing')
  for (const type of ['PLAY', 'SELECT', 'CALL', 'ADVANCE']) {
    assert.equal(cheatReducer(state, { type, playerId: 1, indices: [0] }), state)
  }
  assert.equal(cheatReducer(state, { type: 'PLAY_COMPLETE', playId: -1 }), state)
  assert.equal(cheatReducer(state, { type: 'PLAY_COMPLETE', playId: state.playId }).phase, 'challenge')
  conserved(state)
  const reset = cheatReducer(state, { type: 'RESET', state: createDealingGame() })
  assert.equal(reset.phase, 'dealing'); assert.equal(reset.dealtCount, 0)
  conserved(reset)
})

test('opener chooses the rank, everyone follows it, and the next opener chooses after collection', () => {
  let state = cheatReducer(createDealingGame(), { type: 'DEAL_PROGRESS', count: 52 })
  assert.equal(state.currentRank, null)
  assert.equal(play(state, [0]), state)
  assert.equal(cheatReducer(state, { type: 'CHOOSE_RANK', rank: 'Joker' }), state)
  assert.equal(cheatReducer(state, { type: 'CHOOSE_RANK', rank: 'King', playerId: 1 }), state)
  state = cheatReducer(state, { type: 'CHOOSE_RANK', rank: '7' })
  for (let i = 0; i < 4; i++) {
    state = play(state, [0])
    assert.equal(state.lastPlay.claimedRank, '7')
    assert.equal(cheatReducer(state, { type: 'CHOOSE_RANK', rank: '2', playerId: state.turnPlayerIndex }), state)
    if (i < 3) state = act(state, 'ADVANCE')
  }
  state = act(state, 'CALL')
  assert.equal(state.currentRank, null)
  assert.equal(state.turnPlayerIndex, 0)
  assert.equal(state.centerPile.length, 0)
  state = cheatReducer(state, { type: 'CHOOSE_RANK', rank: 'King' })
  assert.equal(play(state, [0]).lastPlay.claimedRank, 'King')
  conserved(state)
})

test('human selection and every player play are limited to three cards', () => {
  let state = createGame()
  for (let index = 0; index < 5; index++) state = cheatReducer(state, { type: 'SELECT', index })
  assert.deepEqual(state.selectedCards, [0, 1, 2])
  assert.equal(play(state, [0, 1, 2, 3]), state)
  state = act(play(state, [0, 1, 2]), 'ADVANCE')
  assert.equal(play(state, [0, 1, 2, 3]), state)
  assert.equal(play(state, [0, 1, 2]).lastPlay.actualCards.length, 3)
})

test('play motion reaches release, returns to rest, and hands stay above the table at every seat', () => {
  assert.equal(playReach(0), 0)
  assert.equal(playReach(RELEASE_SECONDS), 1)
  assert.equal(playReach(PLAY_SECONDS), 0)
  for (let t = 0; t < PLAY_SECONDS; t += 0.01) assert.ok(playReach(t) >= 0 && playReach(t) <= 1)
  SEATS.forEach((_, id) => {
    for (const holding of [true, false]) {
      const p = handPoint(id, holding)
      assert.ok(p.every(Number.isFinite)); assert.ok(p[1] > 0.325)
      assert.ok(Math.hypot(p[0], p[2]) < 1.3)
    }
  })
})

test('Blender avatars retain textures, seated skin, independent head and reachable original hands', async () => {
  globalThis.ProgressEvent ??= class { constructor(type, values) { Object.assign(this, values); this.type = type } }
  for (const [path, fit] of Object.entries(avatarFits)) {
    const bytes = readFileSync(new URL(`../puplic${path}`, import.meta.url))
    const jsonLength = bytes.readUInt32LE(12)
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength))
    assert.ok(gltf.images.length > 0 && gltf.materials[0].pbrMetallicRoughness.baseColorTexture)
    assert.deepEqual(gltf.animations.map(a => a.name).sort(),
      ['Accuse', 'Celebrate', 'CollectCards', 'DealReceive', 'HoldCards', 'PlayCards', 'React', 'SeatedIdle'])
    // Node has no image decoder; keep the real geometry, skeleton and animation buffers.
    delete gltf.images; delete gltf.textures; delete gltf.materials
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material
    gltf.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`
    const loaded = await new GLTFLoader().parseAsync(JSON.stringify(gltf), '')
    const root = loaded.scene, rig = rigAvatar(root, fit, false)
    const meshes = []; root.traverse(n => { if (n.isSkinnedMesh) meshes.push(n) })
    assert.equal(meshes[0].skeleton.bones.length, 46)
    for (const side of ['L','R']) for (const finger of ['Thumb','Index','Middle','Ring','Little']) {
      for (let joint=1;joint<=3;joint++) assert.ok(root.getObjectByName(`${finger}${joint}_${side}`)?.isBone)
    }
    for (const mesh of meshes) {
      const { skinWeight, position, skinIndex } = mesh.geometry.attributes
      for (let i = 0; i < position.count; i++) {
        assert.ok(Math.abs(skinWeight.getX(i) + skinWeight.getY(i) + skinWeight.getZ(i) + skinWeight.getW(i) - 1) < 1e-5)
        for (let j = 0; j < 4; j++) assert.ok(skinIndex.array[i * 4 + j] < 46)
      }
      for (const index of mesh.geometry.index.array) assert.ok(index < position.count)
      assert.ok(root.getObjectByName('Shin_L').getWorldPosition(new Vector3()).z > 0.18, 'Knees are seated forward')
    }
    const mixer = new AnimationMixer(root)
    for (const clip of loaded.animations) {
      const action = mixer.clipAction(clip).play()
      mixer.setTime(clip.duration * 0.5)
      root.updateMatrixWorld(true)
      for (const mesh of meshes) {
        mesh.skeleton.update()
        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 11) {
          const p = mesh.getVertexPosition(i, new Vector3())
          assert.ok(p.toArray().every(Number.isFinite) && p.length() < 2, `${clip.name} has valid deformation`)
        }
      }
      action.stop()
    }
    mixer.stopAllAction(); mixer.uncacheRoot(root)
    const faceMesh=meshes[0], attributes=faceMesh.geometry.attributes
    const headIndex=faceMesh.skeleton.bones.indexOf(rig.head), face=[]
    for(let i=0;i<attributes.position.count;i++) {
      // The red shirt collar reaches .835; only the face above it must be rigid Head.
      if(attributes.position.getY(i)<.835) continue
      let headWeight=0
      for(let j=0;j<4;j++) if(attributes.skinIndex.getComponent(i,j)===headIndex) headWeight+=attributes.skinWeight.getComponent(i,j)
      assert.ok(headWeight>.99999,'Facial features have rigid head weights')
      if(i%13===0) face.push({index:i,point:faceMesh.getVertexPosition(i,new Vector3())})
    }
    assert.ok(face.length>20)
    if (path.endsWith('avatar2.glb')) {
      const spineIndex=faceMesh.skeleton.bones.indexOf(rig.spine), collar=[]
      for (let i=0;i<attributes.position.count;i++) {
        const height=attributes.position.getY(i)
        if (height<.805 || height>.835) continue
        for (let j=0;j<4;j++) if (attributes.skinIndex.getComponent(i,j)===spineIndex && attributes.skinWeight.getComponent(i,j)>.99999) collar.push(i)
      }
      assert.ok(collar.length>0, 'High red collar vertices follow the torso rather than the head')
      root.updateMatrixWorld(true)
      const before=collar.map(i=>faceMesh.getVertexPosition(i,new Vector3()))
      poseNeck(rig,new Euler(.28,.6,0,'YXZ'),1);root.updateMatrixWorld(true)
      collar.forEach((i,j)=>assert.ok(faceMesh.getVertexPosition(i,new Vector3()).distanceTo(before[j])<1e-6,'Neck turn cannot pull the collar into a spike'))
      rig.neck.quaternion.copy(rig.neckRest);root.updateMatrixWorld(true)
    }

    for(const yaw of [-2,2]) {
      poseNeck(rig,new Euler(.9,yaw,.5,'YXZ'),1)
      root.updateMatrixWorld(true)
      const anchor=faceMesh.getVertexPosition(face[0].index,new Vector3())
      for(const vertex of face) {
        const distance=faceMesh.getVertexPosition(vertex.index,new Vector3()).distanceTo(anchor)
        assert.ok(Math.abs(distance-vertex.point.distanceTo(face[0].point))<1e-5,'Turning at the neck preserves face dimensions')
      }
      assert.ok(rig.head.quaternion.angleTo(rig.headRest)<1e-6)
      const angles=new Euler().setFromQuaternion(rig.neckRest.clone().invert().multiply(rig.neck.quaternion),'YXZ')
      assert.ok(Math.abs(angles.x)<=.401 && Math.abs(angles.y)<=.851 && Math.abs(angles.z)<=.121)
    }
    rig.neck.quaternion.copy(rig.neckRest);root.updateMatrixWorld(true)
    // Reacquire actions after cleanup, as React StrictMode does on its effect replay.
    const holding = loaded.animations.find(c => c.name === 'HoldCards')
    mixer.clipAction(holding).play()
    for (let frame = 0; frame < 600; frame++) {
      updateAvatarMixer(rig, mixer, 1 / 60, frame / 60, 0)
      assert.ok(Math.abs(rig.spine.rotation.x) < .02, 'Idle breathing does not accumulate into a lean')
    }
    mixer.stopAllAction(); mixer.uncacheRoot(root)
    SEATS.forEach((seat, id) => {
      const group = new Group(); group.position.fromArray(seat.position); group.rotation.fromArray(seat.rotation)
      group.add(root); root.scale.setScalar(AVATAR_SCALE)
      root.position.set(0, .48 - fit.contact[1] * AVATAR_SCALE, id === 0 ? .30 : .16)
      group.updateMatrixWorld(true)
      for (const [i, arm] of rig.arms.entries()) {
        const target = new Vector3(...handPoint(id, i === 1))
        const wrist = poseArm(arm, target, new Vector3(0, -1, 0))
        assert.ok(wrist.distanceTo(target) < .015, `Seat ${id} arm ${i} reaches its cards`)
        const upperLength = arm.upper.getWorldPosition(new Vector3()).distanceTo(arm.lower.getWorldPosition(new Vector3()))
        assert.ok(Math.abs(upperLength - arm.upperLength * AVATAR_SCALE) < .001)
        assert.ok(poseArm(arm, new Vector3(10, 10, 10), new Vector3(0, -1, 0)).toArray().every(Number.isFinite))
      }
    })
    rig.dispose()
  }
})

test('every game event selects the appropriate avatar animation', () => {
  const game = createGame()
  assert.equal(avatarAnimation(game, 0), 'HoldCards')
  assert.equal(avatarAnimation({ ...game, phase: 'dealing' }, 0), 'DealReceive')
  assert.equal(avatarAnimation({ ...game, phase: 'playing', lastPlay: { playerId: 0 } }, 0), 'PlayCards')
  const reveal = { ...game, phase: 'reveal', challenge: { caller: 1, accused: 0, loser: 0 } }
  assert.equal(avatarAnimation(reveal, 1), 'Accuse')
  assert.equal(avatarAnimation(reveal, 0), 'React')
  assert.equal(avatarAnimation({ ...reveal, phase: 'collect' }, 0), 'CollectCards')
  assert.equal(avatarAnimation({ ...game, placements: [0] }, 0), 'Celebrate')
})

test('dual-quaternion skinning preserves radius under opposing twists and uniform scale', () => {
  const a=new Bone(),b=new Bone(),root=new Group()
  root.add(a,b);a.rotation.y=Math.PI/2;b.rotation.y=-Math.PI/2
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new BufferAttribute(new Float32Array([1,0,0]),3))
  geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array([0,1,0,0]),4))
  geometry.setAttribute('skinWeight',new BufferAttribute(new Float32Array([.5,.5,0,0]),4))
  const mesh=new SkinnedMesh(geometry),skeleton=new Skeleton([a,b],[new Matrix4(),new Matrix4()])
  mesh.bind(skeleton,new Matrix4())
  for(const scale of [1,1.9]) {
    root.scale.setScalar(scale);root.position.set(2,3,4);root.updateMatrixWorld(true)
    const p=applyVolumeSkin(mesh,0,new Vector3(1,0,0))
    assert.ok(Math.abs(p.distanceTo(root.position)-scale)<1e-6)
  }
  geometry.dispose();skeleton.dispose();mesh.material.dispose()
})

test('all numeric labels use English digits', () => {
  assert.equal(number(52), '52'); assert.equal(rankName('10'), '10'); assert.equal(rankName(null), '—')
})


test('card flight endpoints exactly match the scaled hand grip at every seat', () => {
  for (let id = 0; id < 4; id++) {
    const anchor = new Group(); anchor.position.fromArray(handPoint(id)); anchor.rotation.set(.4, SEATS[id].rotation[1], -.2)
    for (let index = 0; index < 3; index++) {
      const position = new Vector3(), rotation = new Quaternion()
      cardInHand(anchor, id, index, position, rotation)
      const held = new Group(); held.scale.setScalar(CARD_SCALE); anchor.add(held)
      const expected = new Vector3(index * .012, .23, index * .004); held.localToWorld(expected)
      assert.ok(position.distanceTo(expected) < 1e-9)
      assert.ok(rotation.angleTo(anchor.quaternion) < 1e-7)
      anchor.remove(held)
    }
  }
})

test('every game sound schedules finite bounded notes and remains silent while suspended', () => {
  const starts = [], stops = []
  const param = () => ({ value: 0, setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && time >= 0) }, exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && Number.isFinite(value) && time >= 0) } })
  const node = () => ({ gain: param(), frequency: param(), Q: param(), connect() {}, disconnect() {}, start(t) { starts.push(t) }, stop(t) { stops.push(t) } })
  class Context {
    state = 'running'; currentTime = 3; sampleRate = 8000; destination = {}
    createGain = node; createBiquadFilter = node; createBufferSource = node; createOscillator = node
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) } }
    close() { this.state = 'closed' }
  }
  const audio = createGameAudio(Context)
  for (const name of ['shuffle', 'deal', 'slide', 'collect', 'place', 'select', 'cheat', 'win']) {
    const before = starts.length; audio.play(name); assert.ok(starts.length > before, name)
  }
  assert.equal(starts.length, stops.length)
  starts.forEach((time, i) => assert.ok(stops[i] > time && stops[i] - time < .4))
  const before = starts.length; audio.context.state = 'suspended'; audio.play('cheat'); assert.equal(starts.length, before)
  audio.close(); assert.equal(audio.context.state, 'closed')
})



test('local lobbies support complete rounds with 2, 3 or 4 players', () => {
  for (const count of [2, 3, 4]) {
    let seed = 40 + count
    let state = createDealingGame(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32), { playerCount: count })
    assert.equal(state.hands.length, count)
    assert.equal(state.hands.flat().length, 52)
    assert.ok(Math.max(...state.hands.map(h=>h.length))-Math.min(...state.hands.map(h=>h.length))<=1)
    state = cheatReducer(state, { type: 'DEAL_PROGRESS', count: 52 })
    for (let step=0; step<2000 && state.winner===null; step++) {
      const playerId=state.turnPlayerIndex
      assert.ok(playerId>=0 && playerId<count)
      if (state.currentRank===null) state=cheatReducer(state,{type:'CHOOSE_RANK',playerId,rank:'Ace'})
      state=cheatReducer(state,{type:'PLAY',playerId,indices:[0]})
      state=cheatReducer(state,{type:'PLAY_COMPLETE',playId:state.playId})
      state=cheatReducer(state,{type:'ADVANCE',playerId:state.turnPlayerIndex})
      conserved(state)
    }
    assert.equal(state.phase,'finished')
    assert.equal(new Set(state.placements).size,count)
    assert.ok(state.placements.every(id=>id<count))
    const seats=seatsFor(Array.from({length:count},(_,i)=>({avatar:i+1})))
    assert.equal(seats.length,count)
    assert.equal(new Set(seats.map(s=>s.position.join(','))).size,count)
  }
})
