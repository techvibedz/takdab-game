export const RANKS = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King']
export const SUITS = ['♠', '♥', '♦', '♣']
export const MAX_PLAY = 3
import { number, rankName, playerName as defaultPlayerName } from './arabic.js'

const nameOf = (state, id) => state.names?.[id] ?? defaultPlayerName(id)

function clearQuartets(hands) {
  const discardedCards = []
  const nextHands = hands.map(hand => {
    const counts = hand.reduce((map, card) => map.set(card.rank, (map.get(card.rank) ?? 0) + 1), new Map())
    return hand.filter(card => {
      if (counts.get(card.rank) !== 4) return true
      discardedCards.push(card)
      return false
    })
  })
  return { hands: nextHands, discardedCards }
}

function nextActive(start, placements, count) {
  for (let offset = 0; offset < count; offset++) {
    const playerId = (start + offset) % count
    if (!placements.includes(playerId)) return playerId
  }
  return start % count
}

export function createGame(random = Math.random, options = {}) {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ id: `${suit}-${rank}`, rank, suit })))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const playerCount = Number.isInteger(options.playerCount) && options.playerCount >= 2 && options.playerCount <= 4 ? options.playerCount : 4
  const base = Math.floor(deck.length / playerCount), extra = deck.length % playerCount
  const hands = Array.from({ length: playerCount }, (_, i) => {
    const start = i * base + Math.min(i, extra)
    return deck.slice(start, start + base + (i < extra ? 1 : 0))
  })
  return {
    hands, playerCount, names: Array.from({ length: playerCount }, (_, i) => String(options.players?.[i]?.name ?? defaultPlayerName(i)).trim().slice(0, 20) || defaultPlayerName(i)),
    turnPlayerIndex: 0, currentRank: null, centerPile: [], selectedCards: [],
    lastPlay: null, phase: 'dealing', dealtCount: 0, winner: null, placements: [], discardedCards: [], playId: 0,
    challenge: null,
    message: 'نخلط الأوراق… ونوزّع الحظ!',
  }
}

function advance(state) {
  const placements = [...state.placements]
  const ids = state.hands.map((_, id) => id)
  const candidates = [state.lastPlay?.playerId, ...ids]
  for (const playerId of candidates) {
    if (playerId !== undefined && state.hands[playerId].length === 0 && !placements.includes(playerId)) placements.push(playerId)
  }
  if (placements.length === state.hands.length - 1) placements.push(ids.find(playerId => !placements.includes(playerId)))
  if (placements.length === state.hands.length) return { ...state, placements, winner: placements[0], phase: 'finished', selectedCards: [],
    message: `انتهت اللعبة! الفائز: ${nameOf(state, placements[0])}.` }
  return {
    ...state, placements, turnPlayerIndex: nextActive(state.turnPlayerIndex, placements, state.hands.length), phase: 'play', selectedCards: [], lastPlay: null,
  }
}

export function cheatReducer(state, action) {
  if (action.type === 'RESET') return action.state
  if (!state.placements) state = { ...state, placements: [], discardedCards: state.discardedCards ?? [] }
  if (state.winner !== null) return state
  if (state.phase === 'dealing') {
    if (action.type !== 'DEAL_PROGRESS' || !Number.isInteger(action.count) || action.count <= state.dealtCount || action.count > 52) return state
    if (action.count < 52) return { ...state, dealtCount: action.count }
    const cleared = clearQuartets(state.hands)
    return { ...state, hands: cleared.hands, discardedCards: cleared.discardedCards, dealtCount: 52, phase: 'play',
      message: 'اختر رتبة الجولة، ثم العب من 1 إلى 3 أوراق.' }
  }
  if (state.phase === 'playing') {
    return action.type === 'PLAY_COMPLETE' && action.playId === state.lastPlay.id
      ? { ...state, phase: 'challenge' } : state
  }
  const playerId = action.playerId ?? 0
  if (!Number.isInteger(playerId) || !state.hands[playerId]) return state
  if (action.type === 'CALL') {
    if (state.phase !== 'challenge' || !state.lastPlay || state.lastPlay.playerId === playerId || state.placements.includes(playerId)) return state
    const lied = state.lastPlay.actualCards.some(card => card.rank !== state.lastPlay.claimedRank)
    const loser = lied ? state.lastPlay.playerId : playerId
    return { ...state, phase: 'reveal', selectedCards: [], challenge: { caller: playerId, accused: state.lastPlay.playerId, loser, lied },
      message: `${nameOf(state, playerId)} يتهم ${nameOf(state, state.lastPlay.playerId)} بالكذب… نكشف الأوراق!` }
  }
  if (playerId !== state.turnPlayerIndex) return state
  if (state.phase === 'reveal' || state.phase === 'collect') {
    if (action.playId !== state.lastPlay.id) return state
    if (action.type === 'COLLECT' && state.phase === 'reveal') return { ...state, phase: 'collect', message:
      `${state.challenge.lied ? 'انكشف الكذب!' : 'الادّعاء صحيح!'} على ${nameOf(state, state.challenge.loser)} سحب ${number(state.centerPile.length)} ورقة.` }
    if (action.type !== 'RESOLVE' || state.phase !== 'collect') return state
    const collected = state.hands.map((hand, i) => i === state.challenge.loser ? [...hand, ...state.centerPile] : hand)
    const cleared = clearQuartets(collected)
    const next = advance({ ...state, hands: cleared.hands, discardedCards: [...state.discardedCards, ...cleared.discardedCards], centerPile: [], challenge: null, currentRank: null })
    return next.winner !== null ? next : { ...next, message: `${nameOf(state, next.turnPlayerIndex)} يختار رتبة الجولة الجديدة.` }
  }
  if (action.type === 'CHOOSE_RANK') {
    if (state.phase !== 'play' || state.centerPile.length || !RANKS.includes(action.rank)) return state
    return { ...state, currentRank: action.rank, message: `رتبة الجولة: ${rankName(action.rank)}. ستبقى حتى سحب أوراق الطاولة.` }
  }
  if (action.type === 'SELECT') {
    if (playerId !== 0 || !Number.isInteger(action.index) || !state.hands[0][action.index]) return state
    const selectedCards = state.selectedCards.includes(action.index)
      ? state.selectedCards.filter(i => i !== action.index)
      : state.selectedCards.length < MAX_PLAY ? [...state.selectedCards, action.index] : state.selectedCards
    return { ...state, selectedCards }
  }
  if (action.type === 'ADVANCE') return state.phase === 'challenge' ? advance(state) : state
  if (action.type !== 'PLAY' || !RANKS.includes(state.currentRank)) return state
  const indices = action.indices ?? state.selectedCards
  if (!Array.isArray(indices) || indices.length < 1 || indices.length > MAX_PLAY || new Set(indices).size !== indices.length ||
      indices.some(i => !Number.isInteger(i) || !state.hands[playerId][i])) return state
  const next = state.phase === 'challenge' ? advance(state) : state
  if (next.winner !== null || next.placements.includes(playerId)) return next
  const actualCards = indices.map(i => next.hands[playerId][i])
  const lastPlay = { playerId, claimedRank: next.currentRank, actualCards, id: state.playId + 1 }
  return {
    ...next, hands: next.hands.map((hand, i) => i === playerId ? hand.filter((_, index) => !indices.includes(index)) : hand),
    centerPile: [...next.centerPile, ...actualCards], selectedCards: [], lastPlay,
    playId: lastPlay.id, phase: 'playing', turnPlayerIndex: nextActive(playerId + 1, next.placements, state.hands.length),
    message: `ادّعاء ${nameOf(state, playerId)}: ${number(actualCards.length)} ورقة من رتبة ${rankName(next.currentRank)}. بانتظار قرار اللاعب التالي.`,
  }
}

export function rankToPlay(state) {
  return state.currentRank
}
