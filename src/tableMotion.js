export const SEATS = [
  { position: [0, -0.5, 1.7], rotation: [0, Math.PI, 0], avatar: '/models/avatar1.glb' },
  { position: [-1.7, -0.5, 0], rotation: [0, Math.PI / 2, 0], avatar: '/models/avatar2.glb' },
  { position: [0, -0.5, -1.7], rotation: [0, 0, 0], avatar: '/models/avatar3.glb' },
  { position: [1.7, -0.5, 0], rotation: [0, -Math.PI / 2, 0], avatar: '/models/avatar4.glb' },
]
export function seatsFor(players) {
  const indices = players.length === 2 ? [0, 2] : players.length === 3 ? [0, 1, 3] : [0, 1, 2, 3]
  return players.map((player, i) => ({ ...SEATS[indices[i]], avatar: `/models/avatar${player.avatar}.glb` }))
}
export const CARD_SCALE = .44
export const PLAY_SECONDS = 1.35
export const RELEASE_SECONDS = 0.48
export const DEAL_PAUSE = 0.8
export const DEAL_INTERVAL = 0.065
export const DEAL_FLIGHT = 0.48
export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }

export function seatPoint(playerId, x, y, z, seats = SEATS) {
  const seat = seats[playerId], angle = seat.rotation[1]
  return [seat.position[0] + x * Math.cos(angle) + z * Math.sin(angle), y,
    seat.position[2] - x * Math.sin(angle) + z * Math.cos(angle)]
}

export function handPoint(playerId, holding = true, seats = SEATS) {
  return seatPoint(playerId, holding ? 0.25 : -0.26, holding ? 0.49 : 0.385, playerId === 0 ? 0.65 : 0.53, seats)
}

export function playPoint(playerId, seats = SEATS) {
  return seatPoint(playerId, 0.16, 0.50, playerId === 0 ? 0.76 : 0.64, seats)
}

export function playReach(seconds) {
  return seconds < RELEASE_SECONDS ? smooth(seconds / RELEASE_SECONDS)
    : 1 - smooth((seconds - 0.72) / (PLAY_SECONDS - 0.72))
}

// One grip transform for held cards, release, dealing and collection.
export function cardInHand(anchor, playerId, index, position, rotation) {
  anchor.updateWorldMatrix(true, false)
  position.set(index * .012, .23, index * .004).multiplyScalar(CARD_SCALE)
  anchor.localToWorld(position)
  anchor.getWorldQuaternion(rotation)
}
