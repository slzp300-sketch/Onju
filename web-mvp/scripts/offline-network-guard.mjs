// Installed only in local validation processes, never in the deployed app.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'

process.env.ONJU_OFFLINE = '1'
const blocked = () => { throw new Error('ONJU_OFFLINE_NETWORK_BLOCKED') }
globalThis.fetch = async () => blocked()
globalThis.WebSocket = class { constructor() { blocked() } }
for (const module of [http, https]) {
  module.request = blocked
  module.get = blocked
}
net.connect = blocked
net.createConnection = blocked
// Allow local IPC pipes used by build tooling, but deny outbound TCP sockets.
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  if ((typeof first === 'object' && first?.path) || (typeof first === 'string' && !/^\d+$/.test(first))) return connect.apply(this, args)
  return blocked()
}
tls.connect = blocked
dgram.createSocket = blocked
syncBuiltinESMExports()
