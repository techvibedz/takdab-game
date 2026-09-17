import { rankToPlay } from './cheatEngine.js'

export const cleanName = value => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 20)
  return !name || name === 'أنت' ? 'لاعب' : name
}
export const cleanAvatar = value => Math.min(4, Math.max(1, Number(value) || 1))
export const cleanRoomCode = value => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
export function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map(value => alphabet[value % alphabet.length]).join('')
}

const hiddenCard = id => ({ id, rank: 'Ace', suit: '♠', hidden: true })

export function playerView(state, viewerIndex, room) {
  const order = [viewerIndex, ...state.players.map((_, id) => id).filter(id => id !== viewerIndex)]
  const localId = serverId => order.indexOf(serverId)
  const players = order.map(id => {
    const player = state.players[id]
    return { id: player.id, name: player.name, avatar: player.avatar, connected: player.connected, micOn: player.micOn,
      isHost: player.id === state.hostId }
  })
  if (!state.game) return { type: 'snapshot', room, status: 'lobby', selfId: players[0].id, isHost: players[0].isHost, players }

  const game = state.game
  const showLastPlay = ['reveal', 'collect'].includes(game.phase)
  const lastCount = game.lastPlay?.actualCards.length ?? 0
  const lastStart = game.centerPile.length - lastCount
  const centerPile = game.centerPile.map((card, index) => showLastPlay && index >= lastStart ? card : hiddenCard(`pile-${index}`))
  const lastPlay = game.lastPlay && {
    ...game.lastPlay,
    playerId: localId(game.lastPlay.playerId),
    actualCards: centerPile.slice(lastStart),
  }
  const view = {
    ...game,
    hands: order.map((id, localIndex) => id === viewerIndex ? game.hands[id] : game.hands[id].map((_, cardIndex) => hiddenCard(`hand-${localIndex}-${cardIndex}`))),
    names: players.map(player => player.name),
    centerPile,
    discardedCards: game.discardedCards.map((_, index) => hiddenCard(`discarded-${index}`)),
    selectedCards: [],
    turnPlayerIndex: localId(game.turnPlayerIndex),
    placements: game.placements.map(localId),
    winner: game.winner === null ? null : localId(game.winner),
    lastPlay,
    challenge: game.challenge && {
      ...game.challenge,
      caller: localId(game.challenge.caller),
      accused: localId(game.challenge.accused),
      loser: localId(game.challenge.loser),
    },
    rankToPlay: rankToPlay(game),
  }
  return { type: 'snapshot', room, status: 'game', selfId: players[0].id, isHost: players[0].isHost, players, game: view }
}

export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 16_384) return null
  try {
    const message = JSON.parse(raw)
    return message && typeof message.type === 'string' ? message : null
  } catch {
    return null
  }
}
