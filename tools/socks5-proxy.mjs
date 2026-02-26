#!/usr/bin/env node
/**
 * Minimal SOCKS5 proxy server for routing WhatsApp Baileys
 * through a residential IP (your Mac).
 *
 * Usage: node tools/socks5-proxy.mjs [port]
 * Default port: 1080
 */

import net from "net"

const PORT = parseInt(process.argv[2] || "1080", 10)

const server = net.createServer((client) => {
  client.once("data", (data) => {
    // SOCKS5 greeting: version(1) + nmethods(1) + methods(n)
    if (data[0] !== 0x05) { client.end(); return }

    // Reply: no auth required
    client.write(Buffer.from([0x05, 0x00]))

    client.once("data", (data) => {
      // SOCKS5 request: ver(1) + cmd(1) + rsv(1) + atyp(1) + addr(n) + port(2)
      if (data[0] !== 0x05 || data[1] !== 0x01) { client.end(); return } // only CONNECT

      let host, port
      const atyp = data[3]

      if (atyp === 0x01) {
        // IPv4
        host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`
        port = data.readUInt16BE(8)
      } else if (atyp === 0x03) {
        // Domain
        const len = data[4]
        host = data.subarray(5, 5 + len).toString()
        port = data.readUInt16BE(5 + len)
      } else if (atyp === 0x04) {
        // IPv6
        host = Array.from({ length: 8 }, (_, i) => data.readUInt16BE(4 + i * 2).toString(16)).join(":")
        port = data.readUInt16BE(20)
      } else {
        client.end(); return
      }

      const target = net.createConnection(port, host, () => {
        // Success reply
        const reply = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        client.write(reply)

        // Pipe data bidirectionally
        client.pipe(target)
        target.pipe(client)
      })

      target.on("error", () => {
        // Connection refused reply
        client.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        client.end()
      })
    })
  })

  client.on("error", () => {})
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[SOCKS5] Proxy listening on 0.0.0.0:${PORT}`)
  console.log(`[SOCKS5] Your residential IP will be used for outbound connections`)
  console.log(`[SOCKS5] Press Ctrl+C to stop`)
})
