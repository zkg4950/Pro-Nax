/* Copyright (c) 2026 ProNax. All rights reserved. */
import React, { useEffect, useRef, useState } from 'react';
import { useAICopilot } from './AICopilotContext';
import { Mic, MicOff, Volume2, VolumeX, User, UserCircle } from 'lucide-react';

export const VoiceAssistant: React.FC = () => {
  const { state, actions } = useAICopilot();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  // Initialize audio context for microphone level visualization
  useEffect(() => {
    if (!state.isListening) {
      stopMicrophone();
      return;
    }

    startMicrophone();

    return () => {
      stopMicrophone();
    };
  }, [state.isListening]);

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMicLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = average / 255;
        
        setMicLevel(normalizedLevel);
        actions.setAudioLevel(normalizedLevel);

        requestAnimationFrame(updateMicLevel);
      };

      updateMicLevel();
    } catch (error) {
      console.error('Microphone access error:', error);
      actions.setSpeechEnabled(false);
      actions.stopListening();
    }
  };

  const stopMicrophone = () => {
    if (microphoneRef.current) {
      microphoneRef.current.getTracks().forEach(track => track.stop());
      microphoneRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMicLevel(0);
    actions.setAudioLevel(0);
  };

  const handleToggleListening = () => {
    if (state.isListening) {
      actions.stopListening();
    } else {
      actions.startListening();
    }
  };

  const handleToggleMute = () => {
    actions.toggleMute();
  };

  const handleToggleSound = () => {
    actions.toggleSound();
  };

  const handleToggleVoice = () => {
    actions.toggleVoiceGender();
  };

  const handleVoicePreview = () => {
    const previewText = state.currentLanguage === 'skr' 
      ? 'السلام علیکم، میں تہاݙا پرو-نیکس ای۔آی۔ ساتھی ہاں۔'
      : state.currentLanguage === 'ur'
      ? 'السلام علیکم، میں آپ کا ProNax AI ساتھی ہوں۔'
      : 'Hello, I am your ProNax AI companion!';
    actions.speak(previewText);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Microphone Level Visualizer */}
      {state.isListening && (
        <div className="flex items-center gap-1 h-8">
          {[...Array(20)].map((_, i) => {
            const isActive = micLevel > (i / 20);
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  isActive
                    ? 'bg-gradient-to-t from-purple-600 to-cyan-400'
                    : 'bg-gray-700'
                }`}
                style={{
                  height: `${isActive ? 20 + (micLevel * 20) : 8}px`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Voice Controls */}
      <div className="flex items-center gap-2">
        {/* Listening Toggle */}
        <button
          onClick={handleToggleListening}
          disabled={!state.speechEnabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            state.isListening
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
              : state.speechEnabled
              ? 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
              : 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed'
          }`}
          title={state.isListening ? 'Stop listening' : 'Start listening'}
        >
          {state.isListening ? (
            <>
              <Mic className="w-4 h-4 animate-pulse" />
              <span>Listening</span>
            </>
          ) : (
            <>
              <MicOff className="w-4 h-4" />
              <span>Listen</span>
            </>
          )}
        </button>

        {/* Voice Gender Toggle */}
        <button
          onClick={handleToggleVoice}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            state.voiceGender === 'female'
              ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30'
              : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
          }`}
          title={`Switch to ${state.voiceGender === 'female' ? 'Male' : 'Female'} voice`}
        >
          {state.voiceGender === 'female' ? (
            <>
              <User className="w-4 h-4" />
              <span>Female</span>
            </>
          ) : (
            <>
              <UserCircle className="w-4 h-4" />
              <span>Male</span>
            </>
          )}
        </button>

        {/* Voice Preview */}
        <button
          onClick={handleVoicePreview}
          disabled={state.isSpeaking}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            state.isSpeaking
              ? 'bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
          title="Test voice"
        >
          <Volume2 className="w-4 h-4" />
          <span>Test</span>
        </button>

        {/* Mute Toggle */}
        <button
          onClick={handleToggleMute}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            state.isMuted
              ? 'bg-red-600/20 text-red-400 border border-red-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
          title={state.isMuted ? 'Unmute' : 'Mute'}
        >
          {state.isMuted ? (
            <>
              <VolumeX className="w-4 h-4" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4" />
              <span>Unmuted</span>
            </>
          )}
        </button>

        {/* Sound Toggle */}
        <button
          onClick={handleToggleSound}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            state.soundEnabled
              ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
          title={state.soundEnabled ? 'Sound ON' : 'Sound OFF'}
        >
          {state.soundEnabled ? (
            <>
              <Volume2 className="w-4 h-4" />
              <span>Sound</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4" />
              <span>No Sound</span>
            </>
          )}
        </button>
      </div>

      {/* Live Transcript */}
      {state.lastTranscript && (
        <div className="mt-2 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
          <p className="text-xs text-gray-300 italic">
            "{state.lastTranscript}"
          </p>
        </div>
      )}

      {/* Speech Disabled Warning */}
      {!state.speechEnabled && (
        <div className="mt-2 p-2 bg-orange-900/20 rounded-lg border border-orange-500/30">
          <p className="text-xs text-orange-400">
            Speech recognition disabled. Check browser permissions.
          </p>
        </div>
      )}
    </div>
  );
};
