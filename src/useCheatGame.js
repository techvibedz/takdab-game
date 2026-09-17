import { useEffect, useReducer } from 'react'
import { cheatReducer, createGame, rankToPlay, MAX_PLAY } from './cheatEngine'

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
      const bots = state.hands.map((_, id) => id).filter(id => id !== 0).filter(playerId => playerId !== state.lastPlay.playerId && !placements.includes(playerId))
      const timer = setTimeout(() => {
        if (bots.length && Math.random() < 0.3) dispatch({ type: 'CALL', playerId: bots[Math.floor(Math.random() * bots.length)] })
        else if (state.turnPlayerIndex !== 0) dispatch({ type: 'ADVANCE', playerId: state.turnPlayerIndex })
      }, 3000)
      return () => clearTimeout(timer)
    }
    if (state.turnPlayerIndex === 0) return
    const timer = setTimeout(() => {
      const playerId = state.turnPlayerIndex
      const hand = state.hands[playerId]
      if (state.currentRank === null) {
        dispatch({ type: 'CHOOSE_RANK', playerId, rank: hand[Math.floor(Math.random() * hand.length)].rank })
        return
      }
      const matches = hand.flatMap((card, i) => card.rank === state.currentRank ? [i] : []).slice(0, MAX_PLAY)
      dispatch({ type: 'PLAY', playerId, indices: matches.length ? matches : [Math.floor(Math.random() * hand.length)] })
    }, 1300)
    return () => clearTimeout(timer)
  }, [state])
  return {
    ...state, rankToPlay: rankToPlay(state),
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
