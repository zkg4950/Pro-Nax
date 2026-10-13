/* Copyright (c) 2026 ProNax. All rights reserved. */
import { useState, useCallback, useRef } from 'react';

export type VoiceGender = 'female' | 'male';

interface NeuralTTSOptions {
  text: string;
  voice: VoiceGender;
  language: string;
}

interface UseNeuralTTSReturn {
  isPlaying: boolean;
  audioLevel: number;
  error: string | null;
  speak: (options: NeuralTTSOptions) => Promise<void>;
  stop: () => void;
}

// Voice mappings for different TTS providers
const VOICE_MAPPINGS: Record<string, Record<VoiceGender, string>> = {
  // OpenAI TTS voices
  openai: {
    female: 'nova',
    male: 'onyx',
  },
  // Microsoft Edge TTS (Neural voices)
  edge: {
    ur: {
      female: 'ur-PK-UzmaNeural',
      male: 'ur-PK-AsadNeural',
    },
    en: {
      female: 'en-US-JennyNeural',
      male: 'en-US-GuyNeural',
    },
    ar: {
      female: 'ar-SA-ZariyahNeural',
      male: 'ar-SA-HamedNeural',
    },
    hi: {
      female: 'hi-IN-SwaraNeural',
      male: 'hi-IN-MadhurNeural',
    },
  },
};

export const useNeuralTTS = (): UseNeuralTTSReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsPlaying(false);
    setAudioLevel(0);
  }, []);

  const analyzeAudio = useCallback((audioElement: HTMLAudioElement) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = audioContextRef.current;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    
    const source = audioContext.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const analyze = () => {
      if (!isPlaying) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalizedLevel = average / 255;
      
      setAudioLevel(normalizedLevel);
      
      animationRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, [isPlaying]);

  const speak = useCallback(async ({ text, voice, language }: NeuralTTSOptions) => {
    try {
      setError(null);
      setIsPlaying(true);

      // Try Tier 1: Neural TTS from backend
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, language }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
        } else {
          audioRef.current = new Audio(audioUrl);
        }

        audioRef.current.onplay = () => {
          analyzeAudio(audioRef.current!);
        };

        audioRef.current.onended = () => {
          stop();
          URL.revokeObjectURL(audioUrl);
        };

        audioRef.current.onerror = () => {
          setError('Audio playback failed');
          stop();
          URL.revokeObjectURL(audioUrl);
        };

        await audioRef.current.play();
      } else {
        throw new Error('Neural TTS unavailable');
      }
    } catch (err) {
      // Tier 1 failed, will fallback to browser TTS
      console.warn('Neural TTS failed, falling back to browser:', err);
      setError('Neural TTS unavailable, using browser fallback');
      setIsPlaying(false);
      throw err; // Let caller handle fallback
    }
  }, [analyzeAudio, stop]);

  return {
    isPlaying,
    audioLevel,
    error,
    speak,
    stop,
  };
};
