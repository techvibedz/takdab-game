import { DurableObject } from 'cloudflare:workers'
import TakdabServer from '../party/server.js'

class Connection {
  constructor(socket) {
    this.id = crypto.randomUUID()
    this.socket = socket
    this.state = null
  }

  send(message) { this.socket.send(message) }
  close(code, reason) { this.socket.close(code, reason) }
  setState(state) { this.state = state }
}

class Room {
  constructor(owner, ctx) {
    this.owner = owner
    this.storage = ctx.storage
  }

  get id() { return this.owner.roomId }
  getConnection(id) { return this.owner.connections.get(id) }
  getConnections() { return this.owner.connections.values() }
}

export class TakdabRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.roomId = ''
    this.connections = new Map()
    this.game = new TakdabServer(new Room(this, ctx))
    ctx.blockConcurrencyWhile(() => this.game.onStart())
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 })
    this.roomId ||= request.headers.get('X-Takdab-Room') || ''

    const [client, server] = Object.values(new WebSocketPair())
    const connection = new Connection(server)
    this.connections.set(connection.id, connection)
    server.accept()
    server.addEventListener('message', event => this.ctx.waitUntil(this.game.onMessage(event.data, connection)))
    server.addEventListener('close', () => this.ctx.waitUntil(this.disconnect(connection)))
    server.addEventListener('error', () => this.ctx.waitUntil(this.disconnect(connection)))
    await this.game.onConnect(connection, { request })
    return new Response(null, { status: 101, webSocket: client })
  }

  async disconnect(connection) {
    if (!this.connections.delete(connection.id)) return
    await this.game.onClose(connection)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/parties\/main\/([A-Za-z0-9_-]{4,64})$/)
    if (request.headers.get('Upgrade') === 'websocket' && match) {
      const room = match[1]
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room))
      const headers = new Headers(request.headers)
      headers.set('X-Takdab-Room', room)
      return stub.fetch(new Request(request, { headers }))
    }
    return env.ASSETS.fetch(request)
  },
}
