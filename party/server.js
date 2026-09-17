import { cheatReducer, createGame, MAX_PLAY } from '../src/cheatEngine.js'
import { cleanAvatar, cleanName, parseClientMessage, playerView } from '../src/multiplayerProtocol.js'

const EMPTY_STATE = { hostId: null, players: [], game: null, timer: null }
const PHASE_DELAYS = { dealing: 4_700, playing: 1_450, reveal: 5_000, collect: 900 }

export default class TakdabServer {
  constructor(room) {
    this.room = room
    this.state = structuredClone(EMPTY_STATE)
    this.timeout = null
    this.cleanupTimers = new Map()
  }

  async onStart() {
    this.state = await this.room.storage.get('state') ?? structuredClone(EMPTY_STATE)
    this.state.players = this.state.players.map(player => ({ ...player, connected: false, micOn: false, connectionId: null }))
    this.scheduleTimer()
  }

  async onConnect(connection, context) {
    const url = new URL(context.request.url)
    const session = url.searchParams.get('session')
    if (!session || !/^[a-zA-Z0-9_-]{16,128}$/.test(session)) return this.reject(connection, 'جلسة غير صالحة')

    let player = this.state.players.find(candidate => candidate.session === session)
    if (!player) {
      if (this.state.game) return this.reject(connection, 'بدأت الجولة بالفعل')
      if (this.state.players.length >= 4) return this.reject(connection, 'الطاولة ممتلئة')
      player = {
        id: crypto.randomUUID(), session, connectionId: connection.id, connected: true, micOn: false,
        name: cleanName(url.searchParams.get('name')), avatar: cleanAvatar(url.searchParams.get('avatar')),
      }
      this.state.players.push(player)
      this.state.hostId ??= player.id
    } else {
      const cleanup = this.cleanupTimers.get(session)
      if (cleanup) clearTimeout(cleanup)
      this.cleanupTimers.delete(session)
      const previous = player.connectionId && this.room.getConnection(player.connectionId)
      if (previous && previous.id !== connection.id) previous.close(4000, 'reconnected')
      Object.assign(player, { connectionId: connection.id, connected: true, micOn: false,
        name: cleanName(url.searchParams.get('name') ?? player.name), avatar: cleanAvatar(url.searchParams.get('avatar') ?? player.avatar) })
    }
    connection.setState({ session, messages: 0, windowStarted: Date.now() })
    await this.commit()
  }

  async onMessage(raw, sender) {
    if (!this.allowMessage(sender)) return this.sendError(sender, 'رسائل كثيرة جدًا')
    const message = parseClientMessage(raw)
    if (!message) return this.sendError(sender, 'رسالة غير صالحة')
    const playerIndex = this.state.players.findIndex(player => player.connectionId === sender.id)
    if (playerIndex < 0) return this.sendError(sender, 'المقعد غير معروف')
    const player = this.state.players[playerIndex]

    if (message.type === 'ping') return sender.send(JSON.stringify({ type: 'pong', at: Date.now() }))
    if (message.type === 'signal') return this.forwardSignal(player, message)
    if (message.type === 'look') {
      const yaw = Number(message.yaw), pitch = Number(message.pitch)
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(yaw) > 1.2 || pitch < -.7 || pitch > .35) return
      const update = JSON.stringify({ type: 'look', playerId: player.id, yaw, pitch })
      for (const connection of this.room.getConnections()) if (connection.id !== sender.id) connection.send(update)
      return
    }
    if (message.type === 'voice') {
      player.micOn = message.enabled === true
      return this.commit()
    }
    if (message.type === 'profile' && !this.state.game) {
      player.name = cleanName(message.name)
      player.avatar = cleanAvatar(message.avatar)
      return this.commit()
    }
    if (message.type === 'start') {
      if (player.id !== this.state.hostId) return this.sendError(sender, 'المضيف فقط يبدأ الجولة')
      if (this.state.players.length < 2 || this.state.players.some(candidate => !candidate.connected)) return this.sendError(sender, 'نحتاج لاعبين متصلين على الأقل')
      this.state.game = createGame(Math.random, { playerCount: this.state.players.length, players: this.state.players })
      this.state.timer = null
      return this.commit()
    }
    if (!this.state.game || message.type !== 'action') return

    let next = this.state.game
    if (message.action === 'rank') next = cheatReducer(next, { type: 'CHOOSE_RANK', playerId: playerIndex, rank: message.rank })
    if (message.action === 'cheat') next = cheatReducer(next, { type: 'CALL', playerId: playerIndex })
    if (message.action === 'play') {
      const cardIds = Array.isArray(message.cardIds) ? [...new Set(message.cardIds.filter(id => typeof id === 'string'))].slice(0, MAX_PLAY) : []
      const indices = cardIds.map(id => next.hands[playerIndex].findIndex(card => card.id === id)).filter(index => index >= 0)
      if (indices.length === cardIds.length) next = cheatReducer(next, { type: 'PLAY', playerId: playerIndex, indices })
    }
    if (message.action === 'restart' && player.id !== this.state.hostId) return this.sendError(sender, 'المضيف فقط يبدأ لعبة جديدة')
    if (message.action === 'restart') {
      next = createGame(Math.random, { playerCount: this.state.players.length, players: this.state.players })
    }
    if (next !== this.state.game) {
      this.state.game = next
      this.state.timer = null
      await this.commit()
    }
  }

  async onClose(connection) {
    const player = this.state.players.find(candidate => candidate.connectionId === connection.id)
    if (!player) return
    Object.assign(player, { connected: false, micOn: false, connectionId: null })
    if (player.id === this.state.hostId) this.state.hostId = this.state.players.find(candidate => candidate.connected)?.id ?? player.id
    await this.commit()
    if (!this.state.game) {
      const session = player.session
      this.cleanupTimers.set(session, setTimeout(async () => {
        const current = this.state.players.find(candidate => candidate.session === session)
        if (current && !current.connected && !this.state.game) {
          this.state.players = this.state.players.filter(candidate => candidate !== current)
          if (current.id === this.state.hostId) this.state.hostId = this.state.players.find(candidate => candidate.connected)?.id ?? null
          await this.commit()
        }
        this.cleanupTimers.delete(session)
      }, 60_000))
    }
  }

  async onError(connection) {
    await this.onClose(connection)
  }

  allowMessage(connection) {
    const now = Date.now(), state = connection.state ?? { messages: 0, windowStarted: now }
    if (now - state.windowStarted > 1_000) Object.assign(state, { messages: 0, windowStarted: now })
    state.messages += 1
    connection.setState(state)
    return state.messages <= 40
  }

  forwardSignal(sender, message) {
    const target = this.state.players.find(player => player.id === message.target && player.connected)
    const connection = target?.connectionId && this.room.getConnection(target.connectionId)
    if (!connection || !message.signal || typeof message.signal !== 'object') return
    connection.send(JSON.stringify({ type: 'signal', from: sender.id, signal: message.signal }))
  }

  desiredTimer() {
    if (!this.state.game) return null
    const delay = PHASE_DELAYS[this.state.game.phase]
    if (delay) return { key: `${this.state.game.phase}:${this.state.game.playId}`, kind: 'phase', delay }
    const active = this.state.players[this.state.game.turnPlayerIndex]
    if (['play', 'challenge'].includes(this.state.game.phase) && active && !active.connected) {
      return { key: `auto:${this.state.game.phase}:${this.state.game.playId}:${active.id}`, kind: 'auto', delay: 8_000 }
    }
    return null
  }

  scheduleTimer() {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
    const desired = this.desiredTimer()
    if (!desired) { this.state.timer = null; return }
    if (!this.state.timer || this.state.timer.key !== desired.key) {
      this.state.timer = { key: desired.key, kind: desired.kind, deadline: Date.now() + desired.delay }
    }
    const wait = Math.max(0, this.state.timer.deadline - Date.now())
    this.timeout = setTimeout(() => this.runTimer(this.state.timer.key), wait)
  }

  async runTimer(key) {
    if (!this.state.game || this.state.timer?.key !== key) return
    const kind = this.state.timer.kind
    this.state.timer = null
    let game = this.state.game
    if (kind === 'auto') {
      const playerId = game.turnPlayerIndex
      const hand = game.hands[playerId]
      if (!game.currentRank && hand.length) game = cheatReducer(game, { type: 'CHOOSE_RANK', playerId, rank: hand[0].rank })
      const match = hand.findIndex(card => card.rank === game.currentRank)
      game = cheatReducer(game, { type: 'PLAY', playerId, indices: [match >= 0 ? match : 0] })
    } else if (game.phase === 'dealing') game = cheatReducer(game, { type: 'DEAL_PROGRESS', count: 52 })
    else if (game.phase === 'playing') game = cheatReducer(game, { type: 'PLAY_COMPLETE', playId: game.lastPlay.id })
    else if (game.phase === 'reveal') game = cheatReducer(game, { type: 'COLLECT', playerId: game.turnPlayerIndex, playId: game.lastPlay.id })
    else if (game.phase === 'collect') game = cheatReducer(game, { type: 'RESOLVE', playerId: game.turnPlayerIndex, playId: game.lastPlay.id })
    this.state.game = game
    await this.commit()
  }

  async commit() {
    this.scheduleTimer()
    await this.room.storage.put('state', this.state)
    for (const connection of this.room.getConnections()) {
      const viewer = this.state.players.findIndex(player => player.connectionId === connection.id)
      if (viewer >= 0) connection.send(JSON.stringify(playerView(this.state, viewer, this.room.id)))
    }
  }

  sendError(connection, message) {
    connection.send(JSON.stringify({ type: 'error', message }))
  }

  reject(connection, message) {
    this.sendError(connection, message)
    connection.close(4001, message)
  }
}
