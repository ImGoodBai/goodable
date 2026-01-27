'use client';

import { useState, useEffect, useRef } from 'react';

interface LogEntry {
  type: string;
  message: string;
  timestamp: string;
}

interface PendingPermission {
  id: string;
  toolName: string;
  input: any;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [pending, setPending] = useState<PendingPermission[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for pending permissions
  useEffect(() => {
    if (loading && !autoApprove) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/pending');
          const data = await res.json();
          setPending(data.pending || []);
        } catch (err) {
          console.error('Failed to fetch pending:', err);
        }
      }, 500);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setPending([]);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [loading, autoApprove]);

  const handlePermission = async (id: string, approved: boolean) => {
    try {
      await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approved }),
      });
      setPending(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to confirm:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const prompt = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, autoApprove }),
      });

      const data = await res.json();

      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        if (data.logs) {
          setLogs(prev => [...prev, ...data.logs]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'error', content: data.error }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: String(err) }]);
    }

    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#1a1a2e', color: '#eee', fontFamily: 'system-ui' }}>
      {/* Chat Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' }}>
        <div style={{ padding: '12px 20px', background: '#16213e', borderBottom: '1px solid #333' }}>
          <h1 style={{ fontSize: 16, margin: 0 }}>Claude SDK Demo - Phase 2 (Electron + Next.js)</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>SDK called from Next.js API Route with permission UI</p>
        </div>

        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 8,
                maxWidth: '80%',
                background: msg.role === 'user' ? '#0f4c75' : msg.role === 'error' ? '#5c1a1a' : '#1b262c',
                marginLeft: msg.role === 'user' ? 'auto' : 0,
                border: msg.role === 'error' ? '1px solid #8b2a2a' : 'none',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.content}
            </div>
          ))}
          {loading && <div style={{ color: '#888' }}>Processing...</div>}
        </div>

        {/* Permission Dialog */}
        {pending.length > 0 && (
          <div style={{
            padding: 16,
            background: '#2d1f3d',
            borderTop: '2px solid #9c27b0',
          }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12, color: '#ce93d8' }}>
              Permission Required
            </div>
            {pending.map(p => (
              <div key={p.id} style={{
                background: '#1a1a2e',
                padding: 12,
                borderRadius: 8,
                marginBottom: 8,
              }}>
                <div style={{ fontWeight: 'bold', color: '#ffb74d', marginBottom: 8 }}>
                  Tool: {p.toolName}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 12, maxHeight: 80, overflow: 'auto' }}>
                  {JSON.stringify(p.input, null, 2)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handlePermission(p.id, true)}
                    style={{
                      padding: '8px 16px',
                      background: '#4caf50',
                      border: 'none',
                      borderRadius: 4,
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => handlePermission(p.id, false)}
                    style={{
                      padding: '8px 16px',
                      background: '#f44336',
                      border: 'none',
                      borderRadius: 4,
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: 12, background: '#16213e', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={e => setAutoApprove(e.target.checked)}
            />
            Auto-approve
          </label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #333',
              borderRadius: 6,
              background: '#0f0f23',
              color: '#eee',
              fontSize: 14,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#333' : '#0f4c75',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Log Panel */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', background: '#0f0f23' }}>
        <div style={{ padding: '10px 14px', background: '#16213e', fontSize: 13, borderBottom: '1px solid #333' }}>
          Debug Logs
        </div>
        <div style={{ flex: 1, padding: 10, overflowY: 'auto', fontFamily: 'Monaco, monospace', fontSize: 11, lineHeight: 1.5 }}>
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                marginBottom: 4,
                padding: '4px 6px',
                borderRadius: 3,
                color: log.type === 'ERROR' ? '#ef5350' : log.type === 'HOOK' ? '#ffb74d' : log.type === 'TOOL' ? '#ffb74d' : '#4fc3f7',
                background: log.type === 'ERROR' ? '#2a1a1a' : log.type === 'HOOK' || log.type === 'TOOL' ? '#2a2a1a' : 'transparent',
              }}
            >
              <span style={{ color: '#666', marginRight: 8 }}>
                {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
              </span>
              <span style={{ fontWeight: 'bold', marginRight: 8 }}>[{log.type}]</span>
              {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
