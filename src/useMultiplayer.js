import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PartySocket from 'partysocket'
import { MAX_PLAY } from './cheatEngine'

const socketHost = import.meta.env.VITE_PARTYKIT_HOST || (import.meta.env.PROD ? window.location.host : 'localhost:1999')

function sessionId() {
  const key = 'takdab-multiplayer-session'
  let id = sessionStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id) }
  return id
}

export function useMultiplayerRoom({ room, name, avatar }) {
  const socket = useRef(null)
  const signalListeners = useRef(new Set())
  const remoteLooks = useRef(new Map())
  const lastLook = useRef({ at: 0, yaw: NaN, pitch: NaN })
  const [snapshot, setSnapshot] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState('')
  const [selectedCards, setSelectedCards] = useState([])

  useEffect(() => {
    const party = new PartySocket({ host: socketHost, room, query: () => ({ session: sessionId(), name, avatar: String(avatar) }) })
    socket.current = party
    const onOpen = () => { setConnection('connected'); setError('') }
    const onClose = event => {
      if (event.code === 4001) { setConnection('closed'); party.close(); return }
      if (event.code !== 1000) setConnection('reconnecting')
    }
    const onError = () => setConnection('reconnecting')
    const onMessage = event => {
      let message
      try { message = JSON.parse(event.data) } catch { return }
      if (message.type === 'snapshot') setSnapshot(message)
      if (message.type === 'signal') signalListeners.current.forEach(listener => listener(message.from, message.signal))
      if (message.type === 'look' && typeof message.playerId === 'string' && Number.isFinite(message.yaw) && Number.isFinite(message.pitch)) {
        remoteLooks.current.set(message.playerId, { yaw: message.yaw, pitch: message.pitch })
      }
      if (message.type === 'error') setError(message.message)
    }
    party.addEventListener('open', onOpen)
    party.addEventListener('close', onClose)
    party.addEventListener('error', onError)
    party.addEventListener('message', onMessage)
    return () => {
      party.removeEventListener('open', onOpen); party.removeEventListener('close', onClose)
      party.removeEventListener('error', onError); party.removeEventListener('message', onMessage)
      party.close(1000, 'left room'); socket.current = null
    }
  }, [room, name, avatar])

  const send = useCallback(message => socket.current?.send(JSON.stringify(message)), [])
  const start = useCallback(() => send({ type: 'start' }), [send])
  const setVoice = useCallback(enabled => send({ type: 'voice', enabled }), [send])
  const sendSignal = useCallback((target, signal) => send({ type: 'signal', target, signal }), [send])
  const sendLook = useCallback((yaw, pitch) => {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return
    const now = performance.now(), previous = lastLook.current
    if (Math.abs(yaw - previous.yaw) < .006 && Math.abs(pitch - previous.pitch) < .006) return
    if (now - previous.at < 80) return
    lastLook.current = { at: now, yaw, pitch }
    send({ type: 'look', yaw: Math.round(yaw * 1_000) / 1_000, pitch: Math.round(pitch * 1_000) / 1_000 })
  }, [send])
  const subscribeSignal = useCallback(listener => {
    signalListeners.current.add(listener)
    return () => signalListeners.current.delete(listener)
  }, [])
  const gameKey = snapshot?.game ? `${snapshot.game.playId}:${snapshot.game.phase}:${snapshot.game.hands[0]?.length}` : ''
  useEffect(() => setSelectedCards([]), [gameKey])

  const game = useMemo(() => snapshot?.game && ({
    ...snapshot.game,
    canRestart: snapshot.isHost,
    selectedCards,
    toggleCard(index) {
      setSelectedCards(current => current.includes(index) ? current.filter(value => value !== index)
        : current.length < MAX_PLAY ? [...current, index] : current)
    },
    chooseRank: rank => send({ type: 'action', action: 'rank', rank }),
    playSelectedCards() {
      const cardIds = selectedCards.map(index => snapshot.game.hands[0][index]?.id).filter(Boolean)
      if (cardIds.length) send({ type: 'action', action: 'play', cardIds })
    },
    callCheat: () => send({ type: 'action', action: 'cheat' }),
    restart: () => send({ type: 'action', action: 'restart' }),
    dealProgress() {}, finishPlay() {}, advanceTurn() {},
  }), [snapshot?.game, selectedCards, send])

  return {
    room, snapshot, game, connection, error,
    send, start, setVoice, sendSignal, subscribeSignal, sendLook, remoteLooks,
  }
}

const iceServers = () => {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }]
  const urls = String(import.meta.env.VITE_TURN_URL || '').split(',').map(value => value.trim()).filter(Boolean)
  if (urls.length) servers.push({ urls, username: import.meta.env.VITE_TURN_USERNAME || '', credential: import.meta.env.VITE_TURN_CREDENTIAL || '' })
  return servers
}

const VOICE_JITTER_MS = 140

function tuneVoiceTransceiver(transceiver) {
  try {
    const codecs = RTCRtpReceiver.getCapabilities?.('audio')?.codecs
    if (codecs?.length && transceiver.setCodecPreferences) {
      transceiver.setCodecPreferences([...codecs].sort((a, b) =>
        Number(b.mimeType.toLowerCase() === 'audio/opus') - Number(a.mimeType.toLowerCase() === 'audio/opus')))
    }
  } catch {}
  try {
    if ('jitterBufferTarget' in transceiver.receiver) transceiver.receiver.jitterBufferTarget = VOICE_JITTER_MS
  } catch {}
}

async function attachSpeechTrack(sender, track) {
  if ('contentHint' in track) track.contentHint = 'speech'
  await sender.replaceTrack(track)
  const parameters = sender.getParameters()
  if (!parameters.encodings?.length) return
  parameters.encodings[0].maxBitrate = 64_000
  parameters.encodings[0].priority = 'high'
  parameters.encodings[0].networkPriority = 'high'
  try { await sender.setParameters(parameters) } catch {}
}

function captureMicrophone() {
  const constraints = { audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    channelCount: { ideal: 1 }, sampleRate: { ideal: 48_000 }, latency: { ideal: .02 },
  }, video: false }
  if (!window.isSecureContext) return Promise.reject(new Error('افتح اللعبة عبر HTTPS لاستخدام الميكروفون'))
  if (navigator.mediaDevices?.getUserMedia) return navigator.mediaDevices.getUserMedia(constraints)
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia
  if (legacy) return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject))
  return Promise.reject(new Error('افتح اللعبة في Chrome أو Safari للسماح بالميكروفون'))
}

export function useVoiceChat(room) {
  const peers = useRef(new Map())
  const stream = useRef(null)
  const [remoteStreams, setRemoteStreams] = useState(new Map())
  const [connectedPeers, setConnectedPeers] = useState(0)
  const [mic, setMic] = useState('off')
  const [voiceError, setVoiceError] = useState('')
  const selfId = room.snapshot?.selfId
  const players = room.snapshot?.players ?? []

  const sendSignal = useCallback((target, signal) => room.sendSignal(target, signal), [room.sendSignal])
  const makePeer = useCallback(peerId => {
    if (!selfId || peerId === selfId || peers.current.has(peerId)) return peers.current.get(peerId)
    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' })
    tuneVoiceTransceiver(transceiver)
    const sender = transceiver.sender
    const record = { pc, sender, makingOffer: false, ignoreOffer: false, settingAnswer: false, polite: selfId > peerId, signals: Promise.resolve(), reconnectTimer: null }
    peers.current.set(peerId, record)
    if (stream.current) attachSpeechTrack(sender, stream.current.getAudioTracks()[0]).catch(error => setVoiceError(error.message))
    pc.onicecandidate = ({ candidate }) => candidate && sendSignal(peerId, { candidate })
    pc.onnegotiationneeded = async () => {
      try {
        record.makingOffer = true
        await pc.setLocalDescription()
        sendSignal(peerId, { description: pc.localDescription })
      } catch (error) { setVoiceError(error.message) } finally { record.makingOffer = false }
    }
    pc.ontrack = ({ track, streams }) => {
      const remote = streams[0] ?? new MediaStream([track])
      setRemoteStreams(current => new Map(current).set(peerId, remote))
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) setRemoteStreams(current => { const next = new Map(current); next.delete(peerId); return next })
      if (pc.connectionState === 'failed') pc.restartIce()
      clearTimeout(record.reconnectTimer)
      record.reconnectTimer = pc.connectionState === 'disconnected' ? setTimeout(() => {
        if (pc.connectionState === 'disconnected') pc.restartIce()
      }, 1_500) : null
      setConnectedPeers([...peers.current.values()].filter(peer => peer.pc.connectionState === 'connected').length)
    }
    return record
  }, [selfId, sendSignal])

  useEffect(() => room.subscribeSignal((from, signal) => {
    const record = makePeer(from)
    if (!record) return
    record.signals = record.signals.then(async () => {
      const { pc } = record
      try {
        if (signal.description) {
          const ready = !record.makingOffer && (pc.signalingState === 'stable' || record.settingAnswer)
          const collision = signal.description.type === 'offer' && !ready
          record.ignoreOffer = !record.polite && collision
          if (record.ignoreOffer) return
          record.settingAnswer = signal.description.type === 'answer'
          await pc.setRemoteDescription(signal.description)
          record.settingAnswer = false
          if (signal.description.type === 'offer') {
            await pc.setLocalDescription()
            sendSignal(from, { description: pc.localDescription })
          }
        } else if (signal.candidate) {
          try { await pc.addIceCandidate(signal.candidate) } catch (error) { if (!record.ignoreOffer) throw error }
        }
      } catch (error) { setVoiceError(error.message) }
    })
  }), [room.subscribeSignal, makePeer, sendSignal])

  useEffect(() => {
    const active = new Set(players.filter(player => player.connected && player.id !== selfId).map(player => player.id))
    active.forEach(makePeer)
    for (const [peerId, record] of peers.current) if (!active.has(peerId)) {
      clearTimeout(record.reconnectTimer)
      record.pc.close(); peers.current.delete(peerId)
      setRemoteStreams(current => { const next = new Map(current); next.delete(peerId); return next })
    }
  }, [players, selfId, makePeer])

  useEffect(() => () => {
    stream.current?.getTracks().forEach(track => track.stop())
    peers.current.forEach(record => { clearTimeout(record.reconnectTimer); record.pc.close() })
    peers.current.clear()
  }, [])

  const toggleMic = async () => {
    setVoiceError('')
    try {
      if (!stream.current) {
        setMic('requesting')
        stream.current = await captureMicrophone()
        const track = stream.current.getAudioTracks()[0]
        if (!track) throw new Error('لم يعثر المتصفح على ميكروفون')
        track.onended = () => { stream.current = null; setMic('off'); room.setVoice(false) }
        await Promise.all([...peers.current.values()].map(record => attachSpeechTrack(record.sender, track)))
        setMic('on'); room.setVoice(true)
      } else {
        const enabled = !stream.current.getAudioTracks()[0].enabled
        stream.current.getAudioTracks().forEach(track => { track.enabled = enabled })
        setMic(enabled ? 'on' : 'off'); room.setVoice(enabled)
      }
    } catch (error) {
      setMic('error'); setVoiceError(error.name === 'NotAllowedError' ? 'اسمح باستخدام الميكروفون للتحدث' : error.message)
      room.setVoice(false)
    }
  }

  return { mic, voiceError, remoteStreams, connectedPeers, toggleMic }
}
