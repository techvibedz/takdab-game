import { useEffect, useReducer } from 'react'
import { cheatReducer, createGame, rankToPlay, deadRanks, botChooseRank, botPlayIndices, botCallChance } from './cheatEngine'

export const CHALLENGE_SECONDS = 3

export function useCheatGame(options) {
  const [state, dispatch] = useReducer(cheatReducer, options, options => createGame(Math.random, options))
  const placements = state.placements ?? []
  useEffect(() => {
    if (state.phase === 'dealing' || state.phase === 'playing') return
    if (state.phase === 'reveal' || state.phase === 'collect') {
      const timer = setTimeout(() => dispatch({ type: state.phase === 'reveal' ? 'COLLECT' : 'RESOLVE',
        playerId: state.turnPlayerIndex, playId: state.lastPlay.id }), state.phase === 'reveal' ? 5000 : 900)
      return () => clearTimeout(timer)
    }
    if (state.winner !== null) return
    if (state.phase === 'challenge') {
      const bots = state.hands.map((_, id) => id).filter(id => id !== 0 && id !== state.lastPlay.playerId && !placements.includes(id))
      // Each bot decides at its own moment inside the window, so calls don't all land on the same frame.
      const timers = bots.map(playerId => setTimeout(() => {
        if (Math.random() < botCallChance(state, playerId)) dispatch({ type: 'CALL', playerId })
      }, 900 + Math.random() * (CHALLENGE_SECONDS * 1000 - 1200)))
      if (state.turnPlayerIndex !== 0) timers.push(setTimeout(() => dispatch({ type: 'ADVANCE', playerId: state.turnPlayerIndex }), CHALLENGE_SECONDS * 1000))
      return () => timers.forEach(clearTimeout)
    }
    if (state.turnPlayerIndex === 0) return
    const timer = setTimeout(() => {
      const playerId = state.turnPlayerIndex
      if (state.currentRank === null) dispatch({ type: 'CHOOSE_RANK', playerId, rank: botChooseRank(state, playerId) })
      else dispatch({ type: 'PLAY', playerId, indices: botPlayIndices(state, playerId) })
    }, 900 + Math.random() * 700)
    return () => clearTimeout(timer)
  }, [state])
  return {
    ...state, rankToPlay: rankToPlay(state), deadRanks: deadRanks(state), challengeSeconds: CHALLENGE_SECONDS,
    toggleCard: index => dispatch({ type: 'SELECT', index }),
    chooseRank: rank => dispatch({ type: 'CHOOSE_RANK', rank }),
    playSelectedCards: () => dispatch({ type: 'PLAY' }),
    callCheat: () => dispatch({ type: 'CALL' }),
    advanceTurn: () => dispatch({ type: 'ADVANCE' }),
    restart: () => dispatch({ type: 'RESET', state: createGame(Math.random, options) }),
    dealProgress: count => dispatch({ type: 'DEAL_PROGRESS', count }),
    finishPlay: playId => dispatch({ type: 'PLAY_COMPLETE', playId }),
  }
}
