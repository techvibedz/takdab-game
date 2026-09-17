import assert from 'node:assert/strict'
import PartySocket from 'partysocket'

const host = process.env.PARTYKIT_HOST || 'localhost:1999'
const room = `smoke-${Date.now().toString(36)}`
const sessions = [crypto.randomUUID(), crypto.randomUUID()]

function client(name, avatar, session) {
  const socket = new PartySocket({ host, room, query: { name, avatar: String(avatar), session } })
  let snapshot
  const messages = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    messages.push(message)
    if (message.type === 'snapshot') snapshot = message
  })
  return { socket, messages, get snapshot() { return snapshot } }
}

async function waitFor(check, message, timeout = 8_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = check()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(message)
}

let a = client('Host', 1, sessions[0])
let b
try {
  await waitFor(() => a.snapshot?.players.length === 1, 'host did not create room')
  b = client('Guest', 2, sessions[1])
  await waitFor(() => a.snapshot?.players.length === 2 && b.snapshot?.players.length === 2, 'two players did not join')
  assert.equal(a.snapshot.isHost, true)
  assert.equal(b.snapshot.players[0].name, 'Guest')
  const guestId = b.snapshot.selfId

  a.socket.send(JSON.stringify({ type: 'signal', target: guestId, signal: { probe: 'voice' } }))
  const signal = await waitFor(() => b.messages.find(message => message.type === 'signal'), 'voice signal was not relayed')
  assert.deepEqual(signal.signal, { probe: 'voice' })
  assert.equal(signal.from, a.snapshot.selfId)

  a.socket.send(JSON.stringify({ type: 'look', yaw: .45, pitch: -.2 }))
  const look = await waitFor(() => b.messages.find(message => message.type === 'look'), 'camera look was not relayed')
  assert.deepEqual({ playerId: look.playerId, yaw: look.yaw, pitch: look.pitch }, { playerId: a.snapshot.selfId, yaw: .45, pitch: -.2 })

  b.socket.close(1000, 'reconnect test')
  await waitFor(() => a.snapshot?.players.some(player => player.id === guestId && !player.connected), 'disconnect was not synchronized')
  b = client('Guest', 2, sessions[1])
  await waitFor(() => b.snapshot?.selfId === guestId && a.snapshot?.players.every(player => player.connected), 'session did not reconnect to its seat')

  a.socket.send(JSON.stringify({ type: 'start' }))
  await waitFor(() => a.snapshot?.status === 'game' && b.snapshot?.status === 'game', 'game did not start')
  assert.equal(a.snapshot.game.hands[1][0].hidden, true)
  assert.equal(a.snapshot.game.hands[0][0].hidden, undefined)
  assert.equal(b.snapshot.game.hands[1][0].hidden, true)
  assert.equal(b.snapshot.game.hands[0][0].hidden, undefined)

  await waitFor(() => a.snapshot?.game.phase === 'play' && b.snapshot?.game.phase === 'play', 'deal did not complete', 8_000)
  const card = a.snapshot.game.hands[0][0]
  a.socket.send(JSON.stringify({ type: 'action', action: 'rank', rank: card.rank }))
  await waitFor(() => a.snapshot?.game.currentRank === card.rank, 'rank was not synchronized')
  a.socket.send(JSON.stringify({ type: 'action', action: 'play', cardIds: [card.id] }))
  await waitFor(() => a.snapshot?.game.playId === 1 && b.snapshot?.game.playId === 1, 'card play was not synchronized')
  assert.equal(a.snapshot.game.lastPlay.playerId, 0)
  assert.equal(b.snapshot.game.lastPlay.playerId, 1)
  assert.equal(a.snapshot.game.lastPlay.actualCards[0].hidden, true)
  assert.match(b.snapshot.game.message, /Host/)
  assert.doesNotMatch(b.snapshot.game.message, /ادّعاؤك/)

  await waitFor(() => b.snapshot?.game.phase === 'challenge', 'challenge window did not open')
  b.socket.send(JSON.stringify({ type: 'action', action: 'cheat' }))
  await waitFor(() => a.snapshot?.game.phase === 'reveal' && b.snapshot?.game.phase === 'reveal', 'challenge was not synchronized')
  assert.equal(a.snapshot.game.lastPlay.actualCards[0].rank, card.rank)
  assert.equal(b.snapshot.game.lastPlay.actualCards[0].id, card.id)
  console.log(`multiplayer smoke passed: ${room}`)
} finally {
  a.socket.close(1000, 'done')
  b?.socket.close(1000, 'done')
}
process.exit(0)
