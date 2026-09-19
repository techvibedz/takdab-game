import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Clone, Html, useGLTF, useProgress } from '@react-three/drei'
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { FirstPersonCamera, EYE_POSITION } from './FirstPersonCamera'
import { AvatarArms } from './AvatarArms'
import { rigAvatar, avatarFits, AVATAR_SCALE, poseNeck } from './avatarRig'
import { useCheatGame } from './useCheatGame'
import { useMultiplayerRoom, useVoiceChat } from './useMultiplayer'
import { useAudioUnlock, useGameAudio } from './useGameAudio'
import { GameCards, HeldCards, PlayedCards } from './GameCards'
import { GameOverlay } from './GameOverlay'
import { SEATS, handPoint, PLAY_SECONDS, RELEASE_SECONDS, DEAL_PAUSE, DEAL_INTERVAL, DEAL_FLIGHT } from './tableMotion'
import { Lobby, LandscapeNotice } from './Lobby'
import { OnlineLobby, VoiceControls } from './MultiplayerUI'
import { seatsFor } from './tableMotion'
import { number, playerName } from './arabic'
import { normalizeQuality, QUALITY_PRESETS } from './renderQuality'

const labelPoint = new Vector3()
function accusationPosition(object, camera, size) {
  object.getWorldPosition(labelPoint).project(camera)
  return [MathUtils.clamp((labelPoint.x + 1) * size.width / 2, 80, size.width - 80),
    MathUtils.clamp((1 - labelPoint.y) * size.height / 2, 115, Math.max(115, size.height - 160))]
}

function Model({ path, ...props }) {
  const { scene } = useGLTF(path)
  return <Clone object={scene} castShadow receiveShadow {...props} />
}

function TableLoading() {
  const { progress } = useProgress()
  return <Html center><div className="loading-token">♠<span>{`نجهّز الطاولة… ${Math.round(progress)}%`}</span></div></Html>
}

function PlayerSeat({ seat, playerId, playerKey, game, look, remoteLooks, motion, handAnchors }) {
  const playerName = game.playerName
  const accusation = useRef()
  const { scene, animations } = useGLTF(seat.avatar)
  const fit = avatarFits[seat.avatar]
  const { avatar, rig } = useMemo(() => {
    const avatar = clone(scene)
    return { avatar, rig: rigAvatar(avatar, fit, playerId === 0) }
  }, [scene, fit, playerId])
  useEffect(() => () => rig.dispose(), [rig])
  const handAnchor = useRef(), playAnchor = useRef()
  useEffect(() => { handAnchors.current[playerId] = handAnchor.current; handAnchor.current.userData.playAnchor = playAnchor.current }, [handAnchors, playerId])
  const scratch = useMemo(() => ({ position: new Vector3(), target: new Vector3(), parent: new Quaternion(), angles: new Euler(0, 0, 0, 'YXZ') }), [])
  useFrame(({ camera }, delta) => {
    const { head } = rig, v = scratch
    if (playerId === 0) v.angles.set(-look.current.actualPitch, look.current.actualYaw, 0, 'YXZ')
    else {
      const remote = playerKey && remoteLooks?.current.get(playerKey)
      if (remote) v.angles.set(-remote.pitch, remote.yaw, 0, 'YXZ')
      else {
        if (game.challenge) {
          v.target.fromArray(game.seats[game.challenge.accused].position); v.target.y = .95
        } else if (game.phase === 'dealing' || game.phase === 'playing') v.target.set(0, .35, 0)
        else camera.getWorldPosition(v.target)
        head.getWorldPosition(v.position); v.target.sub(v.position)
        rig.neck.parent.getWorldQuaternion(v.parent).invert(); v.target.applyQuaternion(v.parent)
        const yaw = Math.atan2(v.target.x, v.target.z)
        const attention = 1 - MathUtils.smootherstep(Math.abs(yaw), Math.PI / 2, Math.PI * .85)
        v.angles.set(MathUtils.clamp(-Math.atan2(v.target.y, Math.hypot(v.target.x, v.target.z)), -.35, .35) * attention,
          MathUtils.clamp(yaw, -.78, .78) * attention, 0, 'YXZ')
      }
      if (game.phase === 'reveal' && game.challenge?.accused === playerId) v.angles.z = Math.sin(motion.current * 4) * Math.exp(-motion.current) * .08
    }
    poseNeck(rig, v.angles, delta)
    if (accusation.current) {
      head.updateWorldMatrix(true, false)
      head.getWorldPosition(accusation.current.position)
      accusation.current.position.y += .48
      accusation.current.updateWorldMatrix(true, false)
    }
  })
  const count = game.phase === 'dealing' ? Math.max(0, Math.ceil((game.dealtCount - playerId) / game.hands.length)) : game.hands[playerId].length
  const placement = (game.placements ?? []).indexOf(playerId)
  return <>
    <group position={seat.position} rotation={seat.rotation}>
      <Model path="/models/chair.glb" scale={1.15} />
      <primitive object={avatar} scale={AVATAR_SCALE} position={[-fit.contact[0] * AVATAR_SCALE, .48 - fit.contact[1] * AVATAR_SCALE, (playerId === 0 ? .30 : .16) - fit.contact[2] * AVATAR_SCALE]} />
      {playerId !== 0 && game.challenge?.accused !== playerId && <Html position={[0, 1.75, 0]} center style={{ left: 0, direction: 'ltr', width: 'max-content' }}>
        <div className={`seat-badge ${game.turnPlayerIndex === playerId ? 'seat-active' : ''} ${game.challenge?.accused === playerId ? 'seat-accused' : ''}`} dir="rtl">{playerName(playerId)} <b>{number(count)} ♠</b></div>
      </Html>}
      {playerId !== 0 && placement >= 0 && <Html position={[0, 2, 0]} center style={{ left: 0, direction: 'ltr', width: 'max-content' }}><div className="placement-badge" dir="rtl"><strong dir="ltr">#{number(placement + 1)}</strong><span>المركز</span></div></Html>}
    </group>
    {playerId !== 0 && game.phase === 'reveal' && game.challenge?.accused === playerId && <group ref={accusation}>
      <Html center calculatePosition={accusationPosition} zIndexRange={[45, 30]} style={{ left: 0, top: 0, direction: 'ltr', pointerEvents: 'none', width: 'max-content' }}><div role="status" className="accusation-bubble" dir="rtl"><small>{playerName(playerId)}</small><strong>أنت تكذب!</strong></div></Html>
    </group>}
    <group ref={handAnchor} position={handPoint(playerId, true, game.seats)}><HeldCards game={game} playerId={playerId} count={count} motion={motion} /></group>
    <group ref={playAnchor}><PlayedCards game={game} playerId={playerId} motion={motion} /></group>
    <AvatarArms rig={rig} clips={animations} playerId={playerId} game={game} motion={motion} handAnchor={handAnchor} playAnchor={playAnchor} />
  </>
}

function TableScene({ game, look, audio, quality, presence }) {
  const motion = useRef(0), phaseKey = `${game.phase}:${game.playId}`
  const handAnchors = useRef([]), soundProgress = useRef({ key: null })
  const previousPhase = useRef(phaseKey)
  useFrame((_, delta) => {
    if (previousPhase.current !== phaseKey) { motion.current = 0; previousPhase.current = phaseKey }
    motion.current += Math.min(delta, .05)
    if (soundProgress.current.key !== phaseKey) soundProgress.current = { key: phaseKey, deal: -1, release: false, land: false }
    const cues = soundProgress.current
    if (game.phase === 'dealing') {
      const card = Math.min(51, Math.floor((motion.current - DEAL_PAUSE) / DEAL_INTERVAL))
      if (card >= 0 && card > cues.deal) { audio.play('deal'); cues.deal = card }
      const count = Math.min(52, Math.max(0, Math.floor((motion.current - DEAL_PAUSE - DEAL_FLIGHT) / DEAL_INTERVAL) + 1))
      if (count > game.dealtCount) game.dealProgress(count)
    }
    if (game.phase === 'playing') {
      if (!cues.release && motion.current >= RELEASE_SECONDS) { audio.play('slide'); cues.release = true }
      if (!cues.land && motion.current >= RELEASE_SECONDS + .46) { audio.play('place'); cues.land = true }
      if (motion.current >= PLAY_SECONDS) game.finishPlay(game.lastPlay.id)
    }
    presence?.sendLook(look.current.actualYaw, look.current.actualPitch)
  }, -1)
  return <>
    <ambientLight intensity={.8} />
    <hemisphereLight args={['#ffe4bb', '#163c32', 1.1]} />
    <directionalLight castShadow={quality.shadows !== false} intensity={2.2} position={[3, 7, 4]} shadow-mapSize={[quality === QUALITY_PRESETS.high ? 2048 : 1024, quality === QUALITY_PRESETS.high ? 2048 : 1024]} />
    <pointLight position={[-2, 2, -1]} color="#efb76c" intensity={8} />
    <group position={[0, -.5, 0]}><Model path="/models/table.glb" scale={[2.5, 1.2, 2.5]} /></group>
    <FirstPersonCamera look={look} challenge={game.challenge} seats={game.seats} />
    <GameCards game={game} motion={motion} handAnchors={handAnchors} />
    {game.seats.map((seat, index) => <PlayerSeat key={index} seat={seat} playerId={index} playerKey={game.players[index]?.id} look={look} remoteLooks={presence?.remoteLooks} game={game} motion={motion} handAnchors={handAnchors} />)}
  </>
}

function GameRound({ config, onExit, state, voice, presence }) {
  const [qualityName, setQualityName] = useState(() => normalizeQuality(localStorage.getItem('takdab-quality')))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const quality = QUALITY_PRESETS[qualityName]
  const seats = useMemo(() => seatsFor(config.players), [config])
  const game = { ...state, seats, players: config.players, renderQuality: quality, playerName: id => config.players[id]?.name ?? playerName(id) }
  const audio = useGameAudio(game)
  const look = useRef({ yaw: 0, pitch: -.22, actualYaw: 0, actualPitch: -.22 })
  const chooseQuality = name => {
    const next = normalizeQuality(name)
    localStorage.setItem('takdab-quality', next)
    setQualityName(next)
  }
  return <main className="app">
    <Canvas shadows={quality.shadows} dpr={quality.dpr} camera={{ position: EYE_POSITION, fov: 75, near: .06 }} aria-label="مشهد اللعبة من منظور شخصيتك، اسحب أو استخدم الأسهم للنظر">
      <Suspense fallback={<TableLoading />}><TableScene game={game} look={look} audio={audio} quality={quality} presence={presence} /></Suspense>
    </Canvas>
    <GameOverlay game={game} />
    {voice && <VoiceControls voice={voice} players={config.players} inGame />}
    <button className="leave-table" onClick={onExit}>الردهة ↗</button>
    <LandscapeNotice />
    <button className="sound-toggle" onClick={audio.toggle} aria-pressed={audio.enabled} aria-label={audio.enabled ? 'كتم أصوات اللعبة' : 'تشغيل أصوات اللعبة'}>{audio.enabled ? '♪ الصوت' : '♪ صامت'}</button>
    <div className="quality-settings">
      <button className="quality-toggle" onClick={() => setSettingsOpen(open => !open)} aria-expanded={settingsOpen} aria-controls="quality-panel">⚙ الجودة</button>
      {settingsOpen && <section id="quality-panel" className="quality-panel" role="dialog" aria-label="إعدادات جودة الرسومات">
        <div><strong>جودة الرسومات</strong><button aria-label="إغلاق الإعدادات" onClick={() => setSettingsOpen(false)}>×</button></div>
        <p>اختر الوضوح المناسب لهاتفك.</p>
        <div className="quality-options">{Object.entries(QUALITY_PRESETS).map(([name, preset]) => <button key={name} aria-pressed={qualityName === name} onClick={() => chooseQuality(name)}><b>{preset.label}</b><small>{preset.detail}</small></button>)}</div>
      </section>}
    </div>
  </main>
}

function LocalGameRound({ config, onExit }) {
  return <GameRound config={config} onExit={onExit} state={useCheatGame(config)} />
}

function OnlineSession({ options, onExit }) {
  const room = useMultiplayerRoom(options)
  const voice = useVoiceChat(room)
  if (room.snapshot?.status !== 'game' || !room.game) return <OnlineLobby room={room} voice={voice} onExit={onExit} />
  return <GameRound config={{ playerCount: room.snapshot.players.length, players: room.snapshot.players }} onExit={onExit} state={room.game} voice={voice} presence={room} />
}

export default function App() {
  useAudioUnlock()
  useEffect(() => { window.ReactNativeWebView?.postMessage('ready') }, [])
  const [config, setConfig] = useState(null), [lastConfig, setLastConfig] = useState(null), [online, setOnline] = useState(null)
  if (online) return <OnlineSession options={online} onExit={() => setOnline(null)} />
  return config ? <LocalGameRound config={config} onExit={() => { setLastConfig(config); setConfig(null) }} />
    : <Lobby initial={lastConfig} onStart={setConfig} onMultiplayer={setOnline} />
}
for (const name of ['table', 'chair', 'card']) useGLTF.preload(`/models/${name}.glb`)
