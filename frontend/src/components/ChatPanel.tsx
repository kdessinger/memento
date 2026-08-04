import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { chatApi, type ChatMessage } from '../api/client';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load existing session messages when panel opens
  useEffect(() => {
    if (!isOpen) return;

    const loadHistory = async () => {
      try {
        const sessionsRes = await chatApi.getSessions();
        const sessions = sessionsRes.data.data ?? [];
        if (sessions.length > 0) {
          const latest = sessions[0];
          setSessionId(latest.id);
          const msgRes = await chatApi.getMessages(latest.id);
          setMessages(msgRes.data.data ?? []);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };

    loadHistory();
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      sessionId: sessionId ?? 0,
      role: 'user',
      content: inputMessage.trim(),
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.sendMessage(userMsg.content, sessionId);
      const data = response.data;

      if (data.success && data.data) {
        setSessionId(data.data.sessionId);
        const assistantMsg: ChatMessage = {
          id: Date.now() + 1,
          sessionId: data.data.sessionId,
          role: 'assistant',
          content: data.data.reply,
          createdAt: new Date().toISOString()
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        setError('Unexpected response from assistant.');
      }
    } catch (err: any) {
      console.error('Chat API error:', err);
      setError(err?.response?.data?.error || 'Failed to get response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(undefined);
    setError(null);
    setInputMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">
          <h3>Memento Assistant</h3>
          <span className="chat-subtitle">Ask questions about your data</span>
        </div>
        <div className="chat-header-actions">
          {sessionId && (
            <button className="chat-new-button" onClick={handleNewChat} title="New Chat">
              <span className="new-chat-icon">+</span>
              <span className="new-chat-label">New</span>
            </button>
          )}
          <button className="chat-close-button" onClick={onClose} title="Close Chat">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !isLoading && (
          <div className="chat-empty-state">
            <p>💬 Welcome to Memento Chat</p>
            <p className="chat-empty-hint">Ask me anything about your insights, action items, decisions, or lifelogs.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
          >
            <div className="message-content">{message.content}</div>
            <div className="message-timestamp">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant-message loading-message">
            <div className="message-content">
              <Loader2 size={16} className="spinning" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-container">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask a question about your data..."
            className="chat-input"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="chat-send-button"
            title="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="chat-input-hint">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
