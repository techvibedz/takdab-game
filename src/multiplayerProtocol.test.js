import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cheatReducer, createGame } from './cheatEngine.js'
import { cleanName, cleanRoomCode, parseClientMessage, playerView } from './multiplayerProtocol.js'

test('multiplayer snapshots rotate the viewer to seat zero and never leak opponent cards', () => {
  let game = cheatReducer(createGame(() => .4, { playerCount: 2, players: [{ name: 'One' }, { name: 'Two' }] }), { type: 'DEAL_PROGRESS', count: 52 })
  game = cheatReducer(game, { type: 'CHOOSE_RANK', playerId: 0, rank: 'Ace' })
  const state = { hostId: 'p1', players: [
    { id: 'p1', name: 'One', avatar: 1, connected: true, micOn: false },
    { id: 'p2', name: 'Two', avatar: 2, connected: true, micOn: false },
  ], game }
  const view = playerView(state, 1, 'ABC123')
  assert.equal(view.players[0].id, 'p2')
  assert.deepEqual(view.game.hands[0], game.hands[1])
  assert.ok(view.game.hands[1].every(card => card.hidden && !String(card.id).includes('♥')))
  assert.equal(view.game.turnPlayerIndex, 1)

  state.game = cheatReducer(game, { type: 'PLAY', playerId: 0, indices: [0] })
  const concealed = playerView(state, 1, 'ABC123')
  assert.equal(concealed.game.lastPlay.actualCards[0].hidden, true)
  state.game = cheatReducer(cheatReducer(state.game, { type: 'PLAY_COMPLETE', playId: 1 }), { type: 'CALL', playerId: 1 })
  const revealed = playerView(state, 1, 'ABC123')
  assert.equal(revealed.game.lastPlay.actualCards[0].id, state.game.lastPlay.actualCards[0].id)
})

test('multiplayer protocol rejects oversized and malformed messages', () => {
  assert.equal(cleanRoomCode(' ab-c 12!3 '), 'ABC123')
  assert.equal(cleanName('  أنت  '), 'لاعب')
  assert.equal(parseClientMessage('{bad'), null)
  assert.equal(parseClientMessage('x'.repeat(16_385)), null)
  assert.deepEqual(parseClientMessage('{"type":"start"}'), { type: 'start' })
})
