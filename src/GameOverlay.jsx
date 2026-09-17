import { number, rankName, playerName, suitName } from './arabic'
import { useEffect, useRef, useState } from 'react'
import { RANKS, MAX_PLAY } from './cheatEngine'

export function GameOverlay({ game }) {
  const playerName = game.playerName
  const dealing = game.phase === 'dealing'
  const busy = ['dealing', 'playing', 'reveal', 'collect'].includes(game.phase)
  const local = game.turnPlayerIndex === 0 && game.winner === null && !busy
  const count = dealing ? Math.ceil(game.dealtCount / game.hands.length) : game.hands[0].length
  const [editRank, setEditRank] = useState(false)
  const hand = useRef(null)
  const mouseDrag = useRef(null)
  const suppressClick = useRef(false)
  useEffect(() => { if (dealing && hand.current) hand.current.scrollLeft = 0 }, [dealing])
  const visibleCards = game.hands[0].slice(0, count)
  const choosingRank = local && game.phase === 'play' && game.centerPile.length === 0
  const showRanks = choosingRank && (!game.currentRank || editRank)
  const localPlacement = (game.placements ?? []).indexOf(0)
  const canCallCheat = localPlacement < 0 && game.phase === 'challenge' && game.lastPlay?.playerId !== 0
  return <div className="game-ui" dir="rtl">
    <header className="game-header">
      <div className="game-brand"><span className="brand-mark">♠</span><div><h1>تكذب<span>طاولة الخداع</span></h1></div></div>
      <div className="rank-token"><small>رتبة الجولة</small><strong>{rankName(game.rankToPlay)}</strong></div>
      <div className="pile-token"><span>♠</span><b>{number(game.centerPile.length)}</b><small>على الطاولة</small></div>
    </header>
    <div className="turn-pill"><i />{dealing ? 'توزيع الأوراق' : game.winner !== null ? `الفائز: ${playerName(game.winner)}` : local ? 'دورك' : `الدور: ${playerName(game.turnPlayerIndex)}`}</div>
    {game.challenge?.accused === 0 && <div role="status" className="local-accusation">أنت تكذب!</div>}
    {(game.phase === 'collect' || game.phase === 'reveal' && game.challenge?.accused === 0) && <div role="status" className="reveal-banner" key={game.phase}>
      <strong>{game.phase === 'reveal' ? 'لحظة الحقيقة!' : game.challenge.lied ? 'انكشف الكذب!' : 'كان صادقًا!'}</strong>
    </div>}
    {dealing && <div className="deal-banner"><span className="deal-suits">♠ ♥ ♣ ♦</span><b>نوزّع الحظ…</b>
      <div className="deal-track" role="progressbar" aria-label="توزيع الأوراق" aria-valuemin={0} aria-valuemax={52} aria-valuenow={game.dealtCount}><i style={{ width: `${game.dealtCount / 52 * 100}%` }} /></div>
    </div>}
    <footer className={`hand-panel ${dealing ? 'is-dealing' : ''} ${showRanks ? 'picking-rank' : ''}`}>
      <p role="status" aria-live="polite" className="sr-only">{game.message}</p>
      {showRanks && <section className="rank-picker" aria-label="اختر رتبة الجولة">
        <b>اختر رتبة الجولة</b><p>يلعب الجميع نفس الرتبة حتى تُسحب الطاولة</p>
        <div>{RANKS.map(rank => <button key={rank} aria-pressed={game.currentRank === rank} onClick={() => { game.chooseRank(rank); setEditRank(false) }}>{rankName(rank)}</button>)}</div>
      </section>}
      <div className="hand-content">
      <div className="hand-label"><span>♠ أوراقك <b>{number(count)}</b></span>
        {localPlacement >= 0 && <span className="local-placement">المركز <b dir="ltr">#{number(localPlacement + 1)}</b></span>}
        {choosingRank && !showRanks && <button className="rank-change" onClick={() => setEditRank(true)}>الرتبة: {rankName(game.currentRank)} ▾</button>}
        {localPlacement < 0 && <span className="selection-dots" aria-label={`المحدد: ${number(game.selectedCards.length)} من ${MAX_PLAY}`}>
          {Array.from({ length: MAX_PLAY }, (_, i) => <i key={i} className={i < game.selectedCards.length ? 'filled' : ''} />)}
          <span>اختر حتى {MAX_PLAY}</span>
        </span>}
      </div>
      <div ref={hand} className="html-hand" tabIndex={0} aria-label="أوراقك، اختر حتى 3 أوراق. اسحب لتصفّح الأوراق"
        onPointerDown={event => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return
          mouseDrag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false, pointerId: event.pointerId }
        }}
        onPointerMove={event => {
          if (!mouseDrag.current) return
          const dx = event.clientX - mouseDrag.current.x
          if (Math.abs(dx) > 4 && !mouseDrag.current.moved) {
            mouseDrag.current.moved = true
            event.currentTarget.setPointerCapture(mouseDrag.current.pointerId)
            event.currentTarget.classList.add('dragging')
          }
          if (mouseDrag.current.moved) event.currentTarget.scrollLeft = mouseDrag.current.scroll - dx
        }}
        onPointerUp={event => {
          if (!mouseDrag.current) return
          suppressClick.current = mouseDrag.current.moved
          mouseDrag.current = null
          event.currentTarget.classList.remove('dragging')
          setTimeout(() => { suppressClick.current = false }, 0)
        }}
        onPointerCancel={event => { mouseDrag.current = null; event.currentTarget.classList.remove('dragging') }}
        onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation() } }}>
        {visibleCards.map((card, index) => {
          const selected = game.selectedCards.includes(index)
          return <button key={card.id}
            className={`hand-card ${['♥', '♦'].includes(card.suit) ? 'red-card' : ''} ${selected ? 'selected-card' : ''}`}
            disabled={!local || (!selected && game.selectedCards.length === MAX_PLAY)} aria-pressed={selected}
            aria-label={`${rankName(card.rank)} ${suitName(card.suit)}`} onClick={() => game.toggleCard(index)}>
            <span className="card-corner">{rankName(card.rank)}<small>{card.suit}</small></span>
            <strong>{card.suit}</strong><span className="card-corner card-bottom">{rankName(card.rank)}<small>{card.suit}</small></span>
            {selected && <span className="card-check">✓</span>}
          </button>
        })}
      </div>
      {count > 5 && <div className="swipe-hint" aria-hidden="true">↔ اسحب أوراقك</div>}
      </div>
      {!showRanks &&
      <div className="action-row">
        {game.winner === null && localPlacement < 0 ? <>
          <button className="action-button play-button" disabled={!local || !game.currentRank || !game.selectedCards.length} onClick={game.playSelectedCards}>
            <span aria-hidden="true">♠</span><span>العب {game.selectedCards.length ? number(game.selectedCards.length) : ''}<small>على أنها {rankName(game.rankToPlay)}</small></span>
          </button>
          <button className="action-button cheat-button" disabled={!canCallCheat} onClick={game.callCheat}><span aria-hidden="true">!</span>أنت تكذب!</button>
        </> : game.winner === null ? <div className="spectating">أنهيت في المركز <b dir="ltr">#{number(localPlacement + 1)}</b><small>اللعبة مستمرة</small></div>
          : game.canRestart === false ? <div className="spectating">بانتظار المضيف<small>لبدء لعبة جديدة</small></div>
            : <button className="action-button play-button" onClick={game.restart}>↻ لعبة جديدة</button>}
      </div>}
    </footer>
  </div>
}
