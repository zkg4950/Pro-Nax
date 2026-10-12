/* Copyright (c) 2026 ProNax. All rights reserved. */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { detectLanguageFromGeo, detectLanguageFromText, getGreetingForLanguage, getSystemPromptForLanguage } from '@/lib/aiLanguageDetector';

// Types
export type OrbState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
export type PresenceState = 'UNKNOWN' | 'PRESENT' | 'ABSENT';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  language?: string;
}

export interface AICopilotState {
  // Presence
  presenceState: PresenceState;
  isCameraEnabled: boolean;
  creatorName: string;
  
  // Voice
  isListening: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  speechEnabled: boolean;
  lastTranscript: string;
  
  // Orb
  orbState: OrbState;
  audioLevel: number;
  
  // Conversation
  messages: Message[];
  isLoading: boolean;
  
  // Language
  currentLanguage: string;
  detectedLanguage: string;
  
  // Settings
  soundEnabled: boolean;
  ambientEnabled: boolean;
}

export interface AICopilotActions {
  // Presence
  setCameraEnabled: (enabled: boolean) => void;
  setPresenceState: (state: PresenceState) => void;
  setCreatorName: (name: string) => void;
  
  // Voice
  startListening: () => void;
  stopListening: () => void;
  toggleMute: () => void;
  setSpeechEnabled: (enabled: boolean) => void;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  
  // Orb
  setOrbState: (state: OrbState) => void;
  setAudioLevel: (level: number) => void;
  
  // Conversation
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  
  // Language
  setCurrentLanguage: (lang: string) => void;
  detectLanguageFromInput: (text: string) => void;
  
  // Settings
  toggleSound: () => void;
  toggleAmbient: () => void;
  
  // AI Actions
  processUserMessage: (message: string) => Promise<void>;
}

const AICopilotContext = createContext<{
  state: AICopilotState;
  actions: AICopilotActions;
} | null>(null);

// Convert language code to speech recognition language code
function getLanguageCodeForSpeech(langCode: string): string {
  const speechLangMap: Record<string, string> = {
    skr: 'ur-PK', // Saraiki uses Urdu for speech
    ur: 'ur-PK',
    ar: 'ar-SA',
    hi: 'hi-IN',
    pa: 'pa-IN',
    fa: 'fa-IR',
    tr: 'tr-TR',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    ru: 'ru-RU',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-BR',
    it: 'it-IT',
    bn: 'bn-BD',
    ta: 'ta-IN',
    te: 'te-IN',
    vi: 'vi-VN',
    th: 'th-TH',
    id: 'id-ID',
    ms: 'ms-MY',
    nl: 'nl-NL',
    pl: 'pl-PL',
    sv: 'sv-SE',
    el: 'el-GR',
    he: 'he-IL',
    uk: 'uk-UA',
  };
  return speechLangMap[langCode] || 'en-US';
}

// Load conversation from localStorage
const loadConversation = (): Message[] => {
  try {
    const saved = localStorage.getItem('pronax_ai_conversation');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Save conversation to localStorage
const saveConversation = (messages: Message[]) => {
  try {
    localStorage.setItem('pronax_ai_conversation', JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save conversation:', e);
  }
};

export const AICopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AICopilotState>({
    presenceState: 'UNKNOWN',
    isCameraEnabled: false,
    creatorName: 'Creator',
    isListening: false,
    isSpeaking: false,
    isMuted: false,
    speechEnabled: true,
    lastTranscript: '',
    orbState: 'IDLE',
    audioLevel: 0,
    messages: loadConversation(),
    isLoading: false,
    currentLanguage: 'en',
    detectedLanguage: 'en',
    soundEnabled: true,
    ambientEnabled: false,
  });

  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize language from geo-location
  useEffect(() => {
    detectLanguageFromGeo().then(detectedLang => {
      setState(prev => ({ 
        ...prev, 
        currentLanguage: detectedLang,
        detectedLanguage: detectedLang 
      }));
    });
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getLanguageCodeForSpeech(state.currentLanguage);
      
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setState(prev => ({ ...prev, lastTranscript: transcript }));
        
        // If final result, process it
        if (event.results[event.results.length - 1].isFinal) {
          processUserMessage(transcript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setState(prev => ({ ...prev, speechEnabled: false, isListening: false }));
        }
      };
      
      recognition.onend = () => {
        if (state.isListening && state.speechEnabled) {
          recognition.start();
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    saveConversation(state.messages);
  }, [state.messages]);

  // Actions
  const setCameraEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isCameraEnabled: enabled }));
  }, []);

  const setPresenceState = useCallback((presenceState: PresenceState) => {
    setState(prev => ({ ...prev, presenceState }));
    
    // Auto-greeting when presence detected (language-specific)
    if (presenceState === 'PRESENT' && state.presenceState !== 'PRESENT') {
      const greeting = getGreetingForLanguage(state.currentLanguage, state.creatorName);
      addMessage({ role: 'assistant', content: greeting, language: state.currentLanguage });
      if (state.soundEnabled) {
        speak(greeting);
      }
    } else if (presenceState === 'ABSENT' && state.presenceState !== 'ABSENT') {
      const farewell = state.currentLanguage === 'skr' 
        ? 'میں تہاݙے کیتے اتھے ہاں جݙاں وی تہاݙے تھیوے۔'
        : state.currentLanguage === 'ur'
        ? 'میں آپ کے لیے یہاں رہوں گا جب آپ تیار ہوں۔'
        : "I'll be right here whenever you're ready.";
      addMessage({ role: 'assistant', content: farewell, language: state.currentLanguage });
      if (state.soundEnabled) {
        speak(farewell);
      }
    }
  }, [state.creatorName, state.presenceState, state.soundEnabled, state.currentLanguage]);

  const setCreatorName = useCallback((name: string) => {
    setState(prev => ({ ...prev, creatorName: name }));
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && state.speechEnabled && !state.isMuted) {
      recognitionRef.current.start();
      setState(prev => ({ ...prev, isListening: true, orbState: 'LISTENING' }));
    }
  }, [state.speechEnabled, state.isMuted]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setState(prev => ({ ...prev, isListening: false, orbState: 'IDLE' }));
    }
  }, []);

  const toggleMute = useCallback(() => {
    setState(prev => {
      const newMuted = !prev.isMuted;
      if (newMuted) {
        stopListening();
      } else if (prev.speechEnabled) {
        startListening();
      }
      return { ...prev, isMuted: newMuted };
    });
  }, [startListening, stopListening]);

  const setSpeechEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, speechEnabled: enabled }));
    if (!enabled) {
      stopListening();
    }
  }, [stopListening]);

  const speak = useCallback(async (text: string) => {
    if (!state.soundEnabled || state.isMuted) return;
    
    stopSpeaking();
    setState(prev => ({ ...prev, isSpeaking: true, orbState: 'SPEAKING' }));
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Set language for TTS
    const speechLang = getLanguageCodeForSpeech(state.currentLanguage);
    utterance.lang = speechLang;
    
    // Try to get a natural voice for the current language
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith(speechLang.split('-')[0])) ||
                           voices.find(v => v.lang.startsWith('en')) ||
                           voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onend = () => {
      setState(prev => ({ ...prev, isSpeaking: false, orbState: 'IDLE' }));
    };
    
    utterance.onerror = () => {
      setState(prev => ({ ...prev, isSpeaking: false, orbState: 'IDLE' }));
    };
    
    speechSynthesisRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [state.soundEnabled, state.isMuted, state.currentLanguage]);

  const stopSpeaking = useCallback(() => {
    if (speechSynthesisRef.current) {
      speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    }
    setState(prev => ({ ...prev, isSpeaking: false, orbState: 'IDLE' }));
  }, []);

  const setOrbState = useCallback((orbState: OrbState) => {
    setState(prev => ({ ...prev, orbState }));
  }, []);

  const setAudioLevel = useCallback((audioLevel: number) => {
    setState(prev => ({ ...prev, audioLevel }));
  }, []);

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };
    setState(prev => ({ ...prev, messages: [...prev.messages, newMessage] }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }));
    localStorage.removeItem('pronax_ai_conversation');
  }, []);

  const setIsLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading, orbState: isLoading ? 'THINKING' : 'IDLE' }));
  }, []);

  const toggleSound = useCallback(() => {
    setState(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }));
  }, []);

  const toggleAmbient = useCallback(() => {
    setState(prev => ({ ...prev, ambientEnabled: !prev.ambientEnabled }));
  }, []);

  const setCurrentLanguage = useCallback((lang: string) => {
    setState(prev => ({ ...prev, currentLanguage: lang }));
  }, []);

  const detectLanguageFromInput = useCallback((text: string) => {
    const detected = detectLanguageFromText(text);
    if (detected !== state.currentLanguage) {
      setState(prev => ({ 
        ...prev, 
        detectedLanguage: detected,
        currentLanguage: detected 
      }));
    }
  }, [state.currentLanguage]);

  const processUserMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;
    
    // Auto-detect language from input
    detectLanguageFromInput(message);
    
    addMessage({ role: 'user', content: message, language: state.currentLanguage });
    setIsLoading(true);
    
    try {
      // Determine which AI service to call based on message content
      let endpoint = '/api/ai/creator-coach';
      let payload: any = { 
        request: message,
        language: state.currentLanguage,
        system_prompt: getSystemPromptForLanguage(state.currentLanguage)
      };
      
      if (message.toLowerCase().includes('title') || 
          message.toLowerCase().includes('tag') || 
          message.toLowerCase().includes('description') ||
          message.toLowerCase().includes('metadata')) {
        endpoint = '/api/ai/video-metadata';
        payload = { 
          video_title: 'Current Video', 
          category: 'Gaming', 
          content: message,
          language: state.currentLanguage
        };
      } else if (message.toLowerCase().includes('admin') || 
                 message.toLowerCase().includes('moderation') ||
                 message.toLowerCase().includes('ban')) {
        endpoint = '/api/ai/admin-decision';
        payload = { 
          task_type: 'full_check',
          language: state.currentLanguage
        };
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      // Format response
      let responseText = '';
      if (data.success && data.data) {
        responseText = typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2);
      } else if (data.response) {
        responseText = data.response;
      } else if (data.error) {
        responseText = `Sorry, I encountered an error: ${data.error}`;
      } else {
        responseText = 'I processed your request. Here\'s what I found.';
      }
      
      addMessage({ role: 'assistant', content: responseText, language: state.currentLanguage });
      
      if (state.soundEnabled && !state.isMuted) {
        await speak(responseText);
      }
    } catch (error) {
      console.error('AI processing error:', error);
      const errorMessage = state.currentLanguage === 'skr' 
        ? 'میں تہاݙی گالھ سمجھ نئیں سڳیا۔ ای۔آی۔ سروسز دستیاب نئیں ہو سڳدیاں۔'
        : state.currentLanguage === 'ur'
        ? 'میں آپ کی بات سمجھ نہیں سکا۔ AI سروسز دستیاب نہیں ہو سکتیں۔'
        : 'Sorry, I had trouble processing that. The AI services might be unavailable.';
      addMessage({ role: 'assistant', content: errorMessage, language: state.currentLanguage });
      if (state.soundEnabled && !state.isMuted) {
        await speak(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [addMessage, setIsLoading, state.soundEnabled, state.isMuted, speak, state.currentLanguage, detectLanguageFromInput]);

  const actions: AICopilotActions = {
    setCameraEnabled,
    setPresenceState,
    setCreatorName,
    startListening,
    stopListening,
    toggleMute,
    setSpeechEnabled,
    speak,
    stopSpeaking,
    setOrbState,
    setAudioLevel,
    addMessage,
    clearMessages,
    setIsLoading,
    setCurrentLanguage,
    detectLanguageFromInput,
    toggleSound,
    toggleAmbient,
    processUserMessage,
  };

  return (
    <AICopilotContext.Provider value={{ state, actions }}>
      {children}
    </AICopilotContext.Provider>
  );
};

export const useAICopilot = () => {
  const context = useContext(AICopilotContext);
  if (!context) {
    throw new Error('useAICopilot must be used within AICopilotProvider');
  }
  return context;
};
