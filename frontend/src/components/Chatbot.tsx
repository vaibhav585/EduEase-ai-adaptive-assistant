import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot, RotateCcw, Send, User } from 'lucide-react';

import { useProfile } from '../hooks/useProfile';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

/**
 * Fixes a real bug found while adding icons: this never sent `user_id`, so
 * every signed-in student's chat fell into the backend's single "anonymous"
 * bucket — quietly defeating the per-user memory isolation fixed in Phase 0.4
 * (routers/chatbot.py). Also wires DELETE /api/chatbot/{user_id}, which
 * existed on the backend from that same fix but had no caller anywhere.
 */
const Chatbot: React.FC = () => {
  const { uid } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { text, sender: 'user' }]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/chatbot/`, {
        text,
        user_id: uid ?? 'anonymous',
      });
      setMessages((prev) => [...prev, { text: response.data.response, sender: 'bot' }]);
    } catch (error) {
      console.error('Error communicating with chatbot:', error);
      setMessages((prev) => [
        ...prev,
        { text: 'Sorry, I am having trouble connecting right now.', sender: 'bot' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setMessages([]);
    if (!uid) return;
    try {
      await axios.delete(`${API_URL}/api/chatbot/${uid}`);
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  };

  return (
    <div className="fixed bottom-20 left-4 w-80 h-[28rem] bg-white rounded-card shadow-xl flex flex-col z-50 border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-primary-50/60">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary-800">
          <Bot className="h-4 w-4" aria-hidden="true" />
          EduEase Tutor
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear conversation"
            className="flex h-8 w-8 items-center justify-center rounded-control text-primary-700 hover:bg-primary-100"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <Bot className="h-8 w-8 text-slate-300 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-500">Ask me anything about your lesson.</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex items-end gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                msg.sender === 'user' ? 'bg-primary-100 text-primary-700' : 'bg-slate-200 text-slate-600'
              }`}
              aria-hidden="true"
            >
              {msg.sender === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <span
              className={`inline-block px-3 py-2 rounded-control text-sm max-w-[85%] ${
                msg.sender === 'user' ? 'bg-primary-500 text-white' : 'bg-white border border-slate-200 text-slate-800'
              }`}
            >
              {msg.text}
            </span>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600" aria-hidden="true">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="inline-block px-3 py-2 rounded-control bg-white border border-slate-200 text-slate-500 text-sm">
              Typing…
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 p-3 border-t border-slate-100">
        <label htmlFor="chatbot-input" className="sr-only">
          Message
        </label>
        <input
          id="chatbot-input"
          type="text"
          className="flex-1 rounded-control border border-slate-300 px-3 py-2 text-sm min-h-[44px]
                     focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Type your message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control
                     bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
