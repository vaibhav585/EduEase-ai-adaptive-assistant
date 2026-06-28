import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { auth } from '../services/firebase';
import type { Sentiment } from './Eye';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

interface ChatbotProps {
  onSentiment?: (sentiment: Sentiment) => void;
  gradeLevel?: string | null;
  readingDifficulty?: string | null;
}

const Chatbot: React.FC<ChatbotProps> = ({ onSentiment, gradeLevel, readingDifficulty }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionId = useMemo(() => {
    const uid = auth.currentUser?.uid ?? 'anon';
    return `${uid}_${Date.now()}`;
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (input.trim() === '') return;

    const userMessage: Message = { text: input, sender: 'user' };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post('/chatbot/', {
        text: userMessage.text,
        session_id: sessionId,
        grade_level: gradeLevel ?? null,
        reading_difficulty: readingDifficulty ?? null,
      });
      const reply = response.data?.response || response.data?.reply || "I'm not sure how to respond to that.";
      const botMessage: Message = { text: reply, sender: 'bot' };
      setMessages((prev) => [...prev, botMessage]);
      if (response.data?.sentiment && onSentiment) {
        onSentiment(response.data.sentiment);
      }
    } catch (error: any) {
      const fallback = error?.response?.data?.detail || 'Sorry, I am having trouble connecting right now.';
      setMessages((prev) => [...prev, { text: fallback, sender: 'bot' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-24 right-4 w-96 max-w-[calc(100vw-2rem)] max-h-[500px] z-[9998] flex flex-col bg-white rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary-container p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>auto_awesome</span>
        </div>
        <div>
          <p className="font-heading text-sm font-semibold text-white">EduEase Assistant</p>
          <p className="text-[10px] text-white/70 font-body">AI-powered learning support</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-bright min-h-[200px] max-h-[340px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-4xl text-primary/20 block mb-2" style={{fontVariationSettings: "'FILL' 1"}}>chat_bubble</span>
            <p className="text-xs text-on-surface-variant font-body">Ask me anything about your reading material</p>
          </div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-2.5 text-sm font-body leading-relaxed ${
              msg.sender === 'user'
                ? 'bg-primary text-white rounded-2xl rounded-br-md'
                : 'bg-surface-container text-on-surface rounded-2xl rounded-bl-md'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-container text-on-surface-variant rounded-2xl rounded-bl-md px-4 py-2.5 text-sm font-body">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{animationDelay: "0ms"}}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{animationDelay: "150ms"}}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{animationDelay: "300ms"}}></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-outline-variant/20 bg-white">
        <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-3 py-1 border border-outline-variant/30 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <input
            type="text"
            className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-body text-on-surface placeholder:text-on-surface-variant/50 py-2"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <button
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
              input.trim() ? 'bg-primary text-white hover:bg-primary-container active:scale-95' : 'bg-surface-container text-on-surface-variant'
            }`}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
