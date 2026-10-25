import React, { useState, useRef, useEffect } from 'react';
import { GuardIaLogo } from './GuardIaLogo';
import { Volume2, VolumeX, Send, Sparkles, Shield, Heart, Clock, AlertTriangle, User } from 'lucide-react';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

export const AiCompanion: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm-1',
      sender: 'ai',
      text: "Hello! I'm Safera Companion. I'm right here walking with you. Tell me where you are heading or if you see anything uncomfortable.",
      time: 'Just now',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [checkInSec, setCheckInSec] = useState<number | null>(180);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speech synthesis helper
  const speakText = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (msgOverride?: string) => {
    const textToSend = msgOverride || inputText;
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!msgOverride) setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/companion-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: textToSend,
          currentLocation: 'Central Walkway Corridor',
          userStatus: 'Walking home',
        }),
      });

      const data = await response.json();
      const replyText = data.reply || "I'm right here with you. Keep moving toward the main avenue.";

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      speakText(replyText);
      if (data.suggestedCheckInSec) setCheckInSec(data.suggestedCheckInSec);
    } catch (err) {
      console.error(err);
      const fallbackMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: "I'm staying on the line with you. Stick to the well-lit main sidewalk and keep moving.",
        time: 'Just now',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      speakText(fallbackMsg.text);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <GuardIaLogo size="sm" />
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#E9D8DE] text-[10px] font-semibold mb-1">
                <Sparkles className="w-3 h-3 text-[#A70F43]" />
                <span>Real-Time "Walk With Me" Assistant</span>
              </div>
              <h2 className="text-base font-bold text-[#2F2B2D]">AI Companion Mode</h2>
              <p className="text-xs text-[#7B7280] mt-0.5">
                Conversational safety partner that walks with you and listens for distress cues.
              </p>
            </div>
          </div>

          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-2 shrink-0 ${
              voiceEnabled
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FFF8F9] text-[#7B7280] border-[#E9D8DE]'
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4 text-white" /> : <VolumeX className="w-4 h-4 text-[#7B7280]" />}
            <span>{voiceEnabled ? 'Voice Output ON' : 'Voice Output Muted'}</span>
          </button>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="bg-white border border-[#E9D8DE] rounded-2xl shadow-sm flex flex-col h-[480px] overflow-hidden">
        {/* Chat Messages Log */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 text-xs bg-[#FEFCFA]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start space-x-2 max-w-[88%] ${
                m.sender === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : ''
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                  m.sender === 'user'
                    ? 'bg-[#A70F43] text-white border border-[#8D0D39]'
                    : 'bg-[#FFF0F3] text-[#A70F43] border border-[#E9D8DE]'
                }`}
              >
                {m.sender === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              </div>

              <div
                className={`p-3 rounded-2xl leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-[#A70F43] text-white font-medium shadow-sm'
                    : 'bg-white border border-[#E9D8DE] text-[#2F2B2D] shadow-sm'
                }`}
              >
                <p>{m.text}</p>
                <span className="block text-[9px] text-right mt-1 opacity-60 font-mono">{m.time}</span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-2 bg-[#FFF8F9] border-t border-[#E9D8DE] flex items-center space-x-2 overflow-x-auto text-[10px] no-scrollbar">
          <button
            onClick={() => handleSendMessage("I'm passing through a dark alleyway right now.")}
            className="px-2.5 py-1 rounded-xl bg-white hover:bg-[#FFF0F3] text-[#2F2B2D] whitespace-nowrap transition-colors border border-[#E9D8DE]"
          >
            "Dark street ahead"
          </button>
          <button
            onClick={() => handleSendMessage("I feel like someone might be following me.")}
            className="px-2.5 py-1 rounded-xl bg-white hover:bg-[#FFF0F3] text-[#2F2B2D] whitespace-nowrap transition-colors border border-[#E9D8DE]"
          >
            "Someone behind me"
          </button>
          <button
            onClick={() => handleSendMessage("I made it safely to my destination!")}
            className="px-2.5 py-1 rounded-xl bg-white hover:bg-[#FFF0F3] text-[#A70F43] font-semibold whitespace-nowrap transition-colors border border-[#E9D8DE]"
          >
            "Made it home safe!"
          </button>
        </div>

        {/* Chat Input Bar */}
        <div className="p-2.5 bg-white border-t border-[#E9D8DE] flex gap-2">
          <input
            type="text"
            placeholder="Type message to AI Walk Companion..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 bg-[#FFF8F9] border border-[#E9D8DE] rounded-xl px-3 py-2 text-xs text-[#2F2B2D] placeholder-[#7B7280] focus:outline-none focus:border-[#A70F43]"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isLoading || !inputText.trim()}
            className="px-3.5 py-2 rounded-xl bg-[#A70F43] hover:bg-[#8D0D39] text-white font-bold text-xs flex items-center gap-1 transition-all disabled:opacity-50 border border-[#8D0D39]"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

