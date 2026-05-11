import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, User as UserIcon, Wifi, WifiOff } from 'lucide-react'
import { usePersistentState } from '../../hooks'
import { EMPLOYEES, nowStamp, type Inquiry, type Customer } from '../../mockData'
import { useWebSocket } from '../../useWebSocket'

interface ChatAssistantProps {
  inquiries: Inquiry[]
  customers: Customer[]
  onRefreshData?: () => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: string
  variant?: 'danger' | 'warning'
}

export default function ChatAssistant({
  onRefreshData,
}: ChatAssistantProps) {
  const [messages, setMessages] = usePersistentState<ChatMessage[]>('chat-messages', [{
    id: 'sys-1',
    role: 'assistant',
    ts: nowStamp(),
    content:
      "Hi — I'm an AI assistant for ABC Logistics. I can help you look up customers, inquiries, quotations, rates, and shipments. " +
      "I can also create records, update statuses, and help manage your sales workflow.\n\nAsk me anything!",
  }])
  const [draft, setDraft] = useState('')
  const [employeeId, setEmployeeId] = useState<number>(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { connected: aiConnected, waiting: aiWaiting, sendMessage: aiSend } = useWebSocket()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const pushUser = (content: string) => {
    setMessages(prev => [...prev, {
      id: `m-${prev.length}-${Date.now()}`,
      role: 'user',
      content,
      ts: nowStamp(),
    }])
  }

  // ------- Send handler — all messages go through WebSocket -------
  const send = (text?: string) => {
    const message = (text ?? draft).trim()
    if (!message) return
    pushUser(message)
    setDraft('')

    if (!aiConnected) {
      setMessages(prev => [...prev, {
        id: `m-err-${Date.now()}`,
        role: 'assistant',
        content: 'AI assistant is offline. Please make sure the backend server is running.',
        ts: nowStamp(),
        variant: 'danger',
      }])
      return
    }

    // Show "Thinking..." then replace with AI response
    const thinkingId = `m-thinking-${Date.now()}`
    setMessages(prev => [...prev, {
      id: thinkingId,
      role: 'assistant',
      content: 'Thinking...',
      ts: nowStamp(),
    }])

    aiSend(message)
      .then(aiResponse => {
        setMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, content: aiResponse, ts: nowStamp() }
            : m,
        ))
        // AI tools may have mutated data — re-sync dashboard
        onRefreshData?.()
      })
      .catch(() => {
        setMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, content: "The AI assistant didn't respond. Please try again.", variant: 'danger' as const }
            : m,
        ))
      })
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="db-page-anim ca-wrap">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Chat Assistant</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              AI-powered assistant — ask questions, look up data, create records, and manage your sales workflow.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={aiConnected ? 'AI assistant connected' : 'AI assistant offline'}>
              {aiConnected
                ? <Wifi size={13} style={{ color: '#22c55e' }} />
                : <WifiOff size={13} style={{ color: '#94a3b8' }} />}
              <span style={{ fontSize: 11, color: aiConnected ? '#22c55e' : '#94a3b8' }}>
                {aiWaiting ? 'AI thinking...' : aiConnected ? 'AI online' : 'AI offline'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Acting as</span>
            <select
              value={employeeId}
              onChange={e => setEmployeeId(Number(e.target.value))}
              className="lt-select"
            >
              {EMPLOYEES.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="ca-shell">
        <div ref={scrollRef} className="ca-scroll">
          {messages.map(m => (
            <ChatBubble key={m.id} message={m} />
          ))}
        </div>

        <div className="ca-input-row">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a question or give an instruction — the AI can query data, create records, and manage workflows. Enter to send."
            rows={2}
            className="ca-textarea"
          />
          <button
            className="db-btn primary ca-send-btn"
            onClick={() => send()}
            disabled={!draft.trim() || aiWaiting}
            style={{ opacity: draft.trim() && !aiWaiting ? 1 : 0.5, cursor: draft.trim() && !aiWaiting ? 'pointer' : 'not-allowed' }}
          >
            <Send size={12} /> {aiWaiting ? 'Waiting...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const variantClass = message.variant ? ` ${message.variant}` : ''
  return (
    <div className={`ca-row ${isUser ? 'me' : 'bot'}`}>
      <div className={`ca-avatar ${isUser ? 'me' : 'bot'}`}>
        {isUser ? <UserIcon size={13} /> : <Sparkles size={13} />}
      </div>
      <div className="ca-bubble-col">
        <div className="ca-bubble-meta">
          <span className="ca-bubble-name">{isUser ? 'You' : 'AI Assistant'}</span>
          <span className="ca-bubble-ts">{message.ts}</span>
        </div>
        <div className={`ca-bubble ${isUser ? 'me' : 'bot'}${variantClass}`}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        </div>
      </div>
    </div>
  )
}
