import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, AlertCircle, Video, VideoOff, Mic, MicOff, Volume2, VolumeX, UserCircle, CheckCircle, XCircle, Activity } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  badge?: {
    type: 'HEALTHY' | 'DEGRADED' | 'BROKEN' | 'AI_AUTONOMOUS' | 'OFFLINE' | 'ENABLED';
    text: string;
    tooltip?: string;
  };
}

export function AdminChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Salam jani! Main tumhari AI Admin Brain hoon. Main real Supabase database se connect hoon aur tumhare liye kuch bhi kar sakti hoon - user management, content moderation, system monitoring, sab kuch. Camera on kar sakti hoon aur bol sakti hoon. Kya kaam karna hai?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Camera handling
  const toggleCamera = async () => {
    if (cameraEnabled) {
      const stream = videoRef.current?.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraEnabled(true);
      } catch (error) {
        console.error('Camera access denied:', error);
        alert('Camera access is required for me to see you. Please allow camera access.');
      }
    }
  };

  // Speech-to-text handling
  const toggleMic = async () => {
    if (micEnabled) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setMicEnabled(false);
    } else {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
          alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
          return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US'; // Can be changed to 'ur-PK' for Urdu
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          setMicEnabled(false);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setMicEnabled(false);
        };

        recognition.onend = () => {
          setMicEnabled(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setMicEnabled(true);
      } catch (error) {
        console.error('Speech recognition error:', error);
        alert('Speech recognition failed. Please try again.');
      }
    }
  };

  // Detect language from text (Urdu/Saraiki keywords)
  const detectLanguage = (text: string): 'ur' | 'en' => {
    const urduKeywords = [
      'jani', 'sain', 'hai', 'karo', 'kia', 'nahi', 'theak', 'salaam', 'bhai', 
      'maine', 'tum', 'tumhare', 'mera', 'kuch', 'kar', 'dekho', 'check', 'sab', 
      'kiya', 'kyun', 'kaise', 'lega', 'kiven', 'payin', 'chalday', 'thaak', 
      'ho', 'aay', 'gaay', 'je', 'jeh', 'wekh', 'sun', 'bol', 'aakh', 'khabar',
      'khush', 'rab', 'rakha', 'khair', 'vich', 'ton', 'nu', 'da', 'de', 'paar',
      'mut', 'jhoot', 'sach', 'dil', 'pyar', 'mohabbat', 'dost', 'yaar'
    ];
    const lowerText = text.toLowerCase();
    
    // Check if any Urdu/Saraiki keywords are present
    const hasUrduKeywords = urduKeywords.some(keyword => lowerText.includes(keyword));
    
    return hasUrduKeywords ? 'ur' : 'en';
  };

  // Strip markdown formatting and JSON symbols for TTS
  const stripMarkdown = (text: string): string => {
    return text
      // Remove JSON symbols
      .replace(/[{}[\]"':_]/g, '')
      // Remove bold/italic markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      // Remove bullet points
      .replace(/^[\s]*[-*•]\s+/gm, '')
      // Remove headers
      .replace(/^#+\s+/gm, '')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove emojis (basic pattern)
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Text-to-speech with AI Gateway Neural TTS
  const speak = async (text: string) => {
    if (!soundEnabled) return;

    try {
      // Detect language from text
      const detectedLanguage = detectLanguage(text);
      
      // Strip markdown formatting
      const cleanText = stripMarkdown(text);
      
      // Try AI Gateway Neural TTS first
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: cleanText,
          voice: voiceGender,
          language: detectedLanguage
        })
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };
        
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          console.log('AI Gateway TTS failed, falling back to browser synthesis');
          fallbackToBrowserTTS(cleanText);
        };
        
        audio.play();
      } else {
        console.log('AI Gateway TTS unavailable, falling back to browser synthesis');
        fallbackToBrowserTTS(cleanText);
      }
    } catch (error) {
      console.log('AI Gateway TTS error, falling back to browser synthesis:', error);
      fallbackToBrowserTTS(text);
    }
  };

  // Fallback to browser speech synthesis if AI Gateway is offline
  const fallbackToBrowserTTS = (text: string) => {
    if (!soundEnabled) return;

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    
    // Detect language
    const detectedLanguage = detectLanguage(text);
    
    // Try to find the best voice based on gender and language
    const preferredVoice = voices.find(voice => {
      if (detectedLanguage === 'ur') {
        // For Urdu, prefer Pakistani voices
        if (voiceGender === 'female') {
          return voice.lang === 'ur-PK' || 
                 voice.name.includes('Uzma') ||
                 voice.name.includes('Urdu') ||
                 voice.name.includes('Pakistani');
        } else {
          return voice.lang === 'ur-PK' || 
                 voice.name.includes('Asad') ||
                 voice.name.includes('Urdu') ||
                 voice.name.includes('Pakistani');
        }
      } else {
        // For English, use existing logic
        if (voiceGender === 'female') {
          return (voice.name.includes('Google') && voice.name.includes('Female') ||
                 voice.name.includes('Microsoft Zira') ||
                 voice.name.includes('Microsoft Aria') ||
                 voice.name.includes('Microsoft Heera') ||
                 voice.name.includes('Microsoft Kalpana') ||
                 voice.name.includes('Samantha') ||
                 voice.name.includes('Victoria') ||
                 voice.name.includes('Female') || 
                 voice.name.includes('female'));
        } else {
          return (voice.name.includes('Microsoft David') ||
                 voice.name.includes('Microsoft Mark') ||
                 voice.name.includes('Google') && voice.name.includes('Male') ||
                 voice.name.includes('Male') || 
                 voice.name.includes('male'));
        }
      }
    });
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // Set language for better pronunciation
    utterance.lang = detectedLanguage === 'ur' ? 'ur-PK' : 'en-US';
    
    // Natural voice settings
    utterance.pitch = voiceGender === 'female' ? 1.05 : 0.9;
    utterance.rate = 0.85;
    utterance.volume = 1.0;
    
    speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add typing indicator
    const typingMessage: Message = {
      id: 'typing',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isTyping: true
    };
    setMessages(prev => [...prev, typingMessage]);

    try {
      const response = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: input,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== 'typing'));

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

      // Speak the response with female voice
      speak(data.response);

      // If there are actions taken, show them with badges
      if (data.actions && data.actions.length > 0) {
        data.actions.forEach((action: any, index: number) => {
          let badge: Message['badge'] | undefined;
          
          // Determine badge type based on action
          if (action.is_autonomous) {
            badge = {
              type: 'AI_AUTONOMOUS',
              text: 'AI AUTONOMOUS ACTION',
              tooltip: action.description
            };
          } else if (action.type === 'System Health Diagnostic') {
            const healthStatus = action.data?.overall_status || 'UNKNOWN';
            if (healthStatus === 'HEALTHY') {
              badge = {
                type: 'HEALTHY',
                text: 'HEALTHY',
                tooltip: 'All systems operational'
              };
            } else if (healthStatus === 'DEGRADED') {
              badge = {
                type: 'DEGRADED',
                text: 'DEGRADED',
                tooltip: 'Some systems need attention'
              };
            } else {
              badge = {
                type: 'BROKEN',
                text: 'BROKEN',
                tooltip: 'Critical issues detected'
              };
            }
          } else if (action.type === 'Feature Toggled') {
            const enabled = action.data?.enabled;
            badge = {
              type: enabled ? 'ENABLED' : 'OFFLINE',
              text: enabled ? 'ENABLED' : 'OFFLINE',
              tooltip: action.description
            };
          }
          
          const actionMessage: Message = {
            id: (Date.now() + 2 + index).toString(),
            role: 'assistant',
            content: `• ${action.type}: ${action.description}`,
            timestamp: new Date(),
            badge
          };
          setMessages(prev => [...prev, actionMessage]);
        });
      }

    } catch (error) {
      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== 'typing'));

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please check if the AI Admin server is running.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsConnected(false);
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

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bot className="w-6 h-6 text-blue-400" />
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-800 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          <div>
            <h3 className="text-white font-semibold">AI Admin Brain</h3>
            <p className="text-xs text-gray-400">{isConnected ? 'Online & Ready' : 'Disconnected'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Camera Toggle */}
          <button
            onClick={toggleCamera}
            className={`p-2 rounded-lg ${cameraEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} hover:opacity-80 transition`}
            title={cameraEnabled ? 'Disable Camera' : 'Enable Camera'}
          >
            {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
          
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-lg ${soundEnabled ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'} hover:opacity-80 transition`}
            title={soundEnabled ? 'Mute Voice' : 'Enable Voice'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          
          {/* Voice Gender Toggle */}
          <button
            onClick={() => setVoiceGender(voiceGender === 'female' ? 'male' : 'female')}
            className={`p-2 rounded-lg ${voiceGender === 'female' ? 'bg-pink-600 text-white' : 'bg-blue-600 text-white'} hover:opacity-80 transition`}
            title={voiceGender === 'female' ? 'Switch to Male Voice' : 'Switch to Female Voice'}
          >
            {voiceGender === 'female' ? <Bot className="w-4 h-4" /> : <UserCircle className="w-4 h-4" />}
          </button>
          
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="px-2 py-1 bg-gray-700 rounded">Llama3.2</span>
            <span className="px-2 py-1 bg-gray-700 rounded">Ollama</span>
          </div>
        </div>
      </div>

      {/* Camera Preview */}
      {cameraEnabled && (
        <div className="relative bg-black h-48 border-b border-gray-700">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-red-600 text-white text-xs rounded flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.isTyping ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user' 
                    ? 'bg-blue-600' 
                    : 'bg-purple-600'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-100'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.badge && (
                    <div
                      className={`mt-2 px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${
                        message.badge.type === 'HEALTHY' || message.badge.type === 'ENABLED'
                          ? 'bg-green-600 text-white'
                          : message.badge.type === 'DEGRADED'
                          ? 'bg-amber-500 text-white'
                          : message.badge.type === 'AI_AUTONOMOUS'
                          ? 'bg-purple-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                      title={message.badge.tooltip}
                    >
                      {message.badge.type === 'HEALTHY' && <CheckCircle className="w-3 h-3" />}
                      {message.badge.type === 'DEGRADED' && <Activity className="w-3 h-3" />}
                      {message.badge.type === 'BROKEN' || message.badge.type === 'OFFLINE' && <XCircle className="w-3 h-3" />}
                      {message.badge.type === 'AI_AUTONOMOUS' && <Bot className="w-3 h-3" />}
                      {message.badge.type === 'ENABLED' && <CheckCircle className="w-3 h-3" />}
                      {message.badge.text}
                    </div>
                  )}
                  <span className="text-xs text-gray-500 mt-1">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-gray-800 px-4 py-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about the application..."
            disabled={isLoading || !isConnected}
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim() || !isConnected}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        {!isConnected && (
          <div className="flex items-center gap-2 mt-2 text-xs text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>AI Admin server is not connected. Please start the admin server.</span>
          </div>
        )}
      </div>
    </div>
  );
}
