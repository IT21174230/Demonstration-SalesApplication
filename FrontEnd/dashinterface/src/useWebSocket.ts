import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 16000

/**
 * React hook that manages a WebSocket connection to the backend AI chat.
 *
 * - Connects on mount, reconnects with exponential backoff on disconnect
 * - `sendMessage(text)` sends a user query and returns a promise that
 *   resolves with the AI response (or rejects on timeout/error)
 * - `connected` reflects the live connection status
 * - `waiting` is true while a response is in flight
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const backoffRef = useRef(RECONNECT_BASE_MS)
  const resolveRef = useRef<((value: string) => void) | null>(null)
  const rejectRef = useRef<((reason: Error) => void) | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    try {
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return }
        wsRef.current = ws
        setConnected(true)
        backoffRef.current = RECONNECT_BASE_MS
      }

      ws.onmessage = (event) => {
        setWaiting(false)
        if (resolveRef.current) {
          resolveRef.current(event.data)
          resolveRef.current = null
          rejectRef.current = null
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        setConnected(false)
        setWaiting(false)
        // Reject pending promise if socket closes mid-request
        if (rejectRef.current) {
          rejectRef.current(new Error('WebSocket closed'))
          resolveRef.current = null
          rejectRef.current = null
        }
        // Reconnect with backoff
        if (mountedRef.current) {
          const delay = backoffRef.current
          backoffRef.current = Math.min(delay * 2, RECONNECT_MAX_MS)
          setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror — reconnect is handled there
        ws.close()
      }
    } catch {
      // If WebSocket constructor throws, schedule reconnect
      if (mountedRef.current) {
        const delay = backoffRef.current
        backoffRef.current = Math.min(delay * 2, RECONNECT_MAX_MS)
        setTimeout(connect, delay)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      wsRef.current?.close()
    }
  }, [connect])

  /**
   * Send a message and wait for the AI response.
   * Returns a promise that resolves with the response text.
   * Rejects if the socket is disconnected or the response takes too long.
   */
  const sendMessage = useCallback((text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }
      // Cancel any pending request
      if (rejectRef.current) {
        rejectRef.current(new Error('Superseded by new message'))
      }
      resolveRef.current = resolve
      rejectRef.current = reject
      setWaiting(true)
      wsRef.current.send(text)

      // Timeout after 60s (AI tool loops can be slow)
      setTimeout(() => {
        if (resolveRef.current === resolve) {
          setWaiting(false)
          resolveRef.current = null
          rejectRef.current = null
          reject(new Error('Response timeout'))
        }
      }, 60_000)
    })
  }, [])

  return { connected, waiting, sendMessage }
}
