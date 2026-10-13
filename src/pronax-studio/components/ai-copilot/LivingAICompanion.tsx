/* Copyright (c) 2026 ProNax. All rights reserved. */
import React, { useState, useRef, useEffect } from 'react';
import { useAICopilot } from './AICopilotContext';
import { LivingOrb } from './LivingOrb';
import { PresenceDetector } from './PresenceDetector';
import { VoiceAssistant } from './VoiceAssistant';
import { X, Maximize2, Minimize2, MessageSquare, Sparkles, User, Bot, Trash2, Send, UserCircle } from 'lucide-react';

interface LivingAICompanionProps {
  isOpen: boolean;
  onClose: () => void;
  channelStats?: any;
}

export const LivingAICompanion: React.FC<LivingAICompanionProps> = ({
  isOpen,
  onClose,
  channelStats,
}) => {
  const { state, actions } = useAICopilot();
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  useEffect(() => {
    // Set creator name from channel stats
    if (channelStats?.name && state.creatorName === 'Creator') {
      actions.setCreatorName(channelStats.name);
    }
  }, [channelStats]);

  const handleSendMessage = () => {
    if (inputText.trim() && !state.isLoading) {
      actions.processUserMessage(inputText);
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickActions = [
    {
      label: 'Analyze Performance',
      prompt: 'Why did my views drop this week?',
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      label: 'Video Metadata',
      prompt: 'Write a viral title and tags for my gaming video',
      icon: <MessageSquare className="w-4 h-4" />,
    },
    {
      label: 'Growth Strategy',
      prompt: 'How can I grow my channel faster?',
      icon: <User className="w-4 h-4" />,
    },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Focus Mode - Full Screen */}
      {isFocusMode && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">ProNax Living AI</h2>
                <p className="text-xs text-gray-400">Focus Mode</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFocusMode(false)}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-8">
              {/* Large Orb */}
              <LivingOrb size={400} />

              {/* Stats Floating Around */}
              {channelStats && (
                <div className="grid grid-cols-3 gap-4 mt-8">
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
                    <p className="text-2xl font-bold text-white">
                      {channelStats.subscribers?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-gray-400">Subscribers</p>
                  </div>
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
                    <p className="text-2xl font-bold text-white">
                      {channelStats.views28Days?.toLocaleString() || '0'}
                    </p>
                    <p className="text-xs text-gray-400">28-Day Views</p>
                  </div>
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
                    <p className="text-2xl font-bold text-white">
                      ${(channelStats.estimatedRevenue28Days || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">28-Day Revenue</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="p-4 border-t border-gray-800">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Voice Switcher */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    actions.setVoiceGender('female');
                    actions.speak('السلام علیکم سئیں! میں تہاݙی کیویں مدد کر سکدا ہاں؟');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    state.voiceGender === 'female'
                      ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30'
                      : 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-800'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>👩 Female ("Noor")</span>
                </button>
                <button
                  onClick={() => {
                    actions.setVoiceGender('male');
                    actions.speak('السلام علیکم سئیں! میں تہاݙی کیویں مدد کر سکدا ہاں؟');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    state.voiceGender === 'male'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-800'
                  }`}
                >
                  <UserCircle className="w-4 h-4" />
                  <span>👨 Male ("Hamza")</span>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 justify-center">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => actions.processUserMessage(action.prompt)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm transition-colors border border-gray-700"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about your channel..."
                  className="flex-1 rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || state.isLoading}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium transition-all"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Normal Mode - Drawer */}
      {!isFocusMode && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          {/* Drawer */}
          <div className="relative z-10 w-full sm:w-[500px] bg-[#161616] border-l border-[#2e2e2e] shadow-2xl flex flex-col text-gray-100 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#292929] bg-[#1f1f1f]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md">
                  <Sparkles className="h-5 w-5 animate-pulse text-amber-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Living AI Companion
                  </h2>
                  <p className="text-[11px] text-gray-400">Vision + Voice + Actions</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsFocusMode(true)}
                  className="p-1.5 rounded-full hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors"
                  title="Focus Mode"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-[#2f2f2f] text-gray-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Orb & Controls */}
            <div className="p-4 border-b border-[#292929] bg-[#1a1a1a]">
              <div className="flex flex-col items-center gap-4">
                <LivingOrb size={150} />
                
                <div className="flex gap-4">
                  <PresenceDetector />
                  <VoiceAssistant />
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {state.messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-red-600 text-white font-medium rounded-br-none'
                        : 'bg-[#222222] text-gray-200 border border-[#333] rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>

                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {state.isLoading && (
                <div className="flex gap-3 items-center text-sm text-purple-400">
                  <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Bot className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2 bg-[#222] p-3 rounded-2xl border border-[#333]">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {state.messages.length <= 2 && (
              <div className="p-3 border-t border-[#292929] bg-[#1a1a1a] space-y-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Quick Actions
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {quickActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => actions.processUserMessage(action.prompt)}
                      disabled={state.isLoading}
                      className="flex items-center gap-2 text-left p-2 rounded-xl bg-[#232323] hover:bg-[#2d2d2d] text-sm text-gray-300 hover:text-white border border-[#333] transition-colors disabled:opacity-50"
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-[#292929] bg-[#1a1a1a]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type or speak to interact..."
                  disabled={state.isLoading}
                  className="flex-1 rounded-xl bg-[#101010] border border-[#333] py-2.5 px-3.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || state.isLoading}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white transition-all shadow-md"
                >
                  <Send className="h-4 w-4" />
                </button>
                <button
                  onClick={actions.clearMessages}
                  className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
                  title="Clear conversation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
