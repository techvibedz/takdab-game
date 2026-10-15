import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { rankName, playerName } from './arabic'
import { Html } from '@react-three/drei'
import { BoxGeometry, CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Quaternion, Euler, Vector3 } from 'three'
import { handPoint, playPoint, cardInHand, CARD_SCALE, smooth, RELEASE_SECONDS, DEAL_PAUSE, DEAL_INTERVAL, DEAL_FLIGHT } from './tableMotion'

const shortRank = rankName
const PILE_SCALE = CARD_SCALE

// One shared 12-triangle card for every card on the table. The old card.glb had 1,148 triangles per card and
// ~65 cards are visible at once; faces and backs are canvas textures built once and cached.
const CARD_SIZE = [0.32, 0.46, 0.014]
let shared = null
function sharedCard() {
  if (shared) return shared
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 368
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4ead2'; ctx.fillRect(0, 0, 256, 368)
  ctx.fillStyle = '#123a33'; ctx.beginPath(); ctx.roundRect(12, 12, 232, 344, 14); ctx.fill()
  ctx.strokeStyle = '#c9933f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(22, 22, 212, 324, 10); ctx.stroke()
  ctx.save(); ctx.beginPath(); ctx.roundRect(30, 30, 196, 308, 8); ctx.clip()
  ctx.strokeStyle = '#1d5a4c'; ctx.lineWidth = 2
  for (let i = -368; i < 256 + 368; i += 18) { ctx.beginPath(); ctx.moveTo(i, 30); ctx.lineTo(i + 308, 338); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + 308, 30); ctx.lineTo(i, 338); ctx.stroke() }
  ctx.restore()
  ctx.fillStyle = '#c9933f'; ctx.font = '64px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♠', 128, 184)
  const back = new CanvasTexture(canvas); back.colorSpace = SRGBColorSpace; back.anisotropy = 4
  const edge = new MeshStandardMaterial({ color: '#efe5cc', roughness: .8 })
  const backMaterial = new MeshStandardMaterial({ map: back, roughness: .55 })
  shared = { geometry: new BoxGeometry(...CARD_SIZE), materials: [edge, edge, edge, edge, backMaterial, backMaterial], faces: new Map(), plane: new PlaneGeometry(0.307, 0.447), glow: new PlaneGeometry(0.35, 0.49) }
  return shared
}

function faceTexture(card, quality) {
  const textureSize = quality?.textureSize ?? 384, key = `${card.rank}${card.suit}${textureSize}`, cache = sharedCard().faces
  if (cache.has(key)) return cache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = textureSize; canvas.height = Math.round(textureSize * 368 / 256)
  const ctx = canvas.getContext('2d')
  ctx.scale(textureSize / 256, textureSize / 256)
  ctx.fillStyle = '#fff9e9'; ctx.fillRect(0, 0, 256, 368)
  ctx.fillStyle = ['♥', '♦'].includes(card.suit) ? '#bf3545' : '#18312b'
  ctx.font = 'bold 48px Georgia'; ctx.fillText(shortRank(card.rank), 16, 52)
  ctx.font = '38px Georgia'; ctx.fillText(card.suit, 16, 98)
  ctx.textAlign = 'center'; ctx.font = '100px Georgia'; ctx.fillText(card.suit, 128, 227)
  ctx.save(); ctx.translate(256, 368); ctx.rotate(Math.PI)
  ctx.textAlign = 'left'; ctx.font = 'bold 48px Georgia'; ctx.fillText(shortRank(card.rank), 16, 52)
  ctx.restore()
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = quality?.anisotropy ?? 4
  const material = new MeshBasicMaterial({ map: texture, toneMapped: false })
  cache.set(key, material)
  return material
}

const glowMaterial = new MeshBasicMaterial({ color: '#e7bb65', toneMapped: false })
function CardModel({ card, face = false, highlighted = false, quality }) {
  const { geometry, materials, plane, glow } = sharedCard()
  return <>
    {/* Cards never cast shadows: under the low pendant spot, a floating card threw a black card-sized slab onto the felt. */}
    <mesh geometry={geometry} material={materials} receiveShadow />
    {face && <mesh geometry={plane} material={faceTexture(card, quality)} position={[0, 0, 0.009]} />}
    {highlighted && <mesh geometry={glow} material={glowMaterial} position={[0, 0, -0.009]} />}
  </>
}

function PileCard({ card, index, game, motion, handAnchors }) {
  const group = useRef()
  const released = useRef(false)
  useEffect(() => { released.current = false }, [game.playId])
  const startRotation = useMemo(() => new Quaternion(), [])
  const endRotation = useMemo(() => new Quaternion(), [])
  const collectOrigin = useRef(null)
  const origin = useMemo(() => new Vector3(...playPoint(game.lastPlay?.playerId ?? 0, game.seats)), [game.lastPlay?.playerId])
  const destination = useMemo(() => new Vector3(), [])
  const revealIndex = game.lastPlay?.actualCards.findIndex(c => c.id === card.id) ?? -1
  const reveal = game.phase === 'reveal' && revealIndex >= 0
  const revealScale = game.hands.length === 2 ? CARD_SCALE * 1.78 : CARD_SCALE * 1.5
  const collect = game.phase === 'collect'
  const count = game.lastPlay?.actualCards.length ?? 1
  const position = collect ? handPoint(game.challenge.loser, true, game.seats)
    : reveal ? [(revealIndex - (count - 1) / 2) * (game.hands.length === 2 ? 0.48 : 0.41), 0.59, 0.1]
    : [Math.sin(index * 13) * 0.045, 0.325 + index * 0.003, Math.cos(index * 7) * 0.035]
  useFrame((_, delta) => {
    const playing = game.phase === 'playing' && revealIndex >= 0
    group.current.visible = !playing || motion.current >= RELEASE_SECONDS
    if (playing) {
      if (!released.current && motion.current >= RELEASE_SECONDS) {
        const playerId = game.lastPlay.playerId, anchor = handAnchors.current[playerId]?.userData.playAnchor
        if (anchor) {
          cardInHand(anchor, playerId, revealIndex, origin, startRotation)
        }
        released.current = true
      }
      const t = smooth((motion.current - RELEASE_SECONDS - revealIndex * 0.035) / 0.46)
      group.current.position.copy(origin).lerp(destination.fromArray(position), t)
      group.current.position.y += Math.sin(t * Math.PI) * 0.15
      endRotation.setFromEuler(new Euler(Math.PI / 2, 0, Math.sin(index * 3) * .1))
      group.current.quaternion.copy(startRotation).slerp(endRotation, t)
      group.current.scale.setScalar(CARD_SCALE)
    } else if (collect) {
      if (!collectOrigin.current) collectOrigin.current = { position: group.current.position.clone(), rotation: group.current.quaternion.clone() }
      const anchor = handAnchors.current[game.challenge.loser]
      const t = smooth((motion.current - Math.min(index * .009, .18)) / .65)
      if (anchor) {
        cardInHand(anchor, game.challenge.loser, 0, destination, endRotation)
      } else destination.fromArray(position)
      group.current.position.copy(collectOrigin.current.position).lerp(destination, t)
      group.current.position.y += Math.sin(t * Math.PI) * .12
      group.current.quaternion.copy(collectOrigin.current.rotation).slerp(endRotation, t)
      group.current.scale.setScalar(CARD_SCALE)
      group.current.visible = t < 1
    } else {
      const t = 1 - Math.exp(-9 * delta)
      group.current.position.lerp(destination.fromArray(position), t)
      group.current.rotation.x += ((reveal ? -0.95 : Math.PI / 2) - group.current.rotation.x) * t
      group.current.scale.setScalar(group.current.scale.x + ((reveal ? revealScale : CARD_SCALE) - group.current.scale.x) * t)
    }
  })
  return <group ref={group} visible={game.phase !== 'playing' || revealIndex < 0} position={position} scale={PILE_SCALE}><CardModel card={card} face={reveal} quality={game.renderQuality} /></group>
}

function DealCard({ card, index, motion, handAnchors, game }) {
  const group = useRef()
  const destination = useMemo(() => new Vector3(...handPoint(index % game.hands.length, true, game.seats)), [index])
  const rotation = useMemo(() => new Quaternion(), [])
  const startRotation = useMemo(() => new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)), [])
  useFrame(() => {
    const anchor = handAnchors.current[index % game.hands.length]
    if (anchor) {
      cardInHand(anchor, index % game.hands.length, 0, destination, rotation)
    }
    const t = smooth((motion.current - DEAL_PAUSE - index * DEAL_INTERVAL) / DEAL_FLIGHT)
    group.current.visible = t < 1
    group.current.position.set(0, 0.33 + (51 - index) * 0.002, 0).lerp(destination, t)
    group.current.position.y += Math.sin(t * Math.PI) * 0.22
    group.current.scale.setScalar(CARD_SCALE)
    group.current.quaternion.copy(startRotation).slerp(rotation, t)
  })
  return <group ref={group} scale={CARD_SCALE}><CardModel card={card} /></group>
}

export function HeldCards({ game, playerId, count, motion }) {
  const playing = game.phase === 'playing' && game.lastPlay?.playerId === playerId
  const waiting = useRef()
  useFrame(() => { if (waiting.current) waiting.current.visible = motion.current < .18 })
  const cards = game.hands[playerId].slice(0, count)
  const fan = Math.min(.85, .20 + cards.length * .05)
  return <group scale={CARD_SCALE}>
    {playing && <group ref={waiting}>{game.lastPlay.actualCards.map((card, i) => <group key={card.id} position={[i * .012, .23, i * .004]}><CardModel card={card} face={playerId === 0} quality={game.renderQuality} /></group>)}</group>}
    {cards.map((card, index) => {
      const angle = (index / Math.max(cards.length - 1, 1) - 0.5) * fan
      return <group key={card.id} rotation={[0, 0, -angle]} position={[0, 0, index * 0.002]}>
        <group position={[0, 0.23, 0]}><CardModel card={card} face={playerId === 0} quality={game.renderQuality} /></group>
      </group>
    })}
  </group>
}

export function PlayedCards({ game, playerId, motion }) {
  const outgoing = useRef()
  const playing = game.phase === 'playing' && game.lastPlay?.playerId === playerId
  useFrame(() => { if (outgoing.current) outgoing.current.visible = playing && motion.current >= .18 && motion.current < RELEASE_SECONDS })
  if (!playing) return null
  return <group ref={outgoing} scale={CARD_SCALE}>
    {game.lastPlay.actualCards.map((card, i) => <group key={card.id} position={[i * .012, .23, i * .004]}>
      <CardModel card={card} face={playerId === 0} quality={game.renderQuality} />
    </group>)}
  </group>
}

export function GameCards({ game, motion, handAnchors }) {
  if (game.phase === 'dealing') return Array.from({ length: 52 }, (_, index) =>
    <DealCard game={game} key={index} card={game.hands[index % game.hands.length][Math.floor(index / game.hands.length)]} index={index} motion={motion} handAnchors={handAnchors} />)
  return <>
    {game.centerPile.map((card, index) =>
      <PileCard key={card.id} card={card} index={index} game={game} motion={motion} handAnchors={handAnchors} />)}
    {game.lastPlay && ['playing', 'challenge'].includes(game.phase) &&
      <Html key={game.lastPlay.id} position={[0, 0.5, -0.1]} center zIndexRange={[20, 0]} style={{ left: 0, pointerEvents: 'none', direction: 'ltr', width: 'max-content' }}>
        <div className="play-count" dir="rtl" aria-label={`${game.playerName(game.lastPlay.playerId)}: ${game.lastPlay.actualCards.length} أوراق`}>
          <span className="play-count-cards" aria-hidden="true">♠</span>
          <strong dir="ltr">×{game.lastPlay.actualCards.length}</strong>
          <small>{rankName(game.lastPlay.claimedRank)}</small>
        </div>
      </Html>}
  </>
}
