/* Copyright (c) 2026 ProNax. All rights reserved. */
import React, { useEffect, useRef, useState } from 'react';
import { useAICopilot } from './AICopilotContext';
import { Camera, CameraOff, User, UserX } from 'lucide-react';

export const PresenceDetector: React.FC = () => {
  const { state, actions } = useAICopilot();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [motionLevel, setMotionLevel] = useState(0);
  const [luminance, setLuminance] = useState(0);
  const previousFrameRef = useRef<ImageData | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout>();
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize camera
  useEffect(() => {
    if (!state.isCameraEnabled) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [state.isCameraEnabled]);

  // Start camera stream
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startPresenceDetection();
        };
      }
    } catch (error) {
      console.error('Camera access error:', error);
      actions.setCameraEnabled(false);
      actions.setSpeechEnabled(false);
    }
  };

  // Stop camera stream
  const stopCamera = () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setMotionLevel(0);
    setLuminance(0);
  };

  // Lightweight presence detection using motion and luminance
  const startPresenceDetection = () => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    checkIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        return;
      }

      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Calculate luminance (brightness)
      let totalLuminance = 0;
      const data = currentFrame.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalLuminance += (0.299 * r + 0.587 * g + 0.114 * b);
      }
      const avgLuminance = totalLuminance / (data.length / 4);
      setLuminance(avgLuminance);

      // Calculate motion if we have a previous frame
      if (previousFrameRef.current) {
        let motionPixels = 0;
        const prevData = previousFrameRef.current.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const diff = Math.abs(data[i] - prevData[i]) +
                       Math.abs(data[i + 1] - prevData[i + 1]) +
                       Math.abs(data[i + 2] - prevData[i + 2]);
          if (diff > 30) {
            motionPixels++;
          }
        }
        
        const motionRatio = motionPixels / (data.length / 4);
        setMotionLevel(motionRatio);

        // Determine presence based on luminance and motion
        const isPresent = avgLuminance > 30 && motionRatio > 0.001;
        
        if (isPresent && state.presenceState !== 'PRESENT') {
          actions.setPresenceState('PRESENT');
        } else if (!isPresent && avgLuminance < 20 && state.presenceState !== 'ABSENT') {
          actions.setPresenceState('ABSENT');
        }
      }

      previousFrameRef.current = currentFrame;
    }, 500); // Check every 500ms
  };

  const toggleCamera = () => {
    actions.setCameraEnabled(!state.isCameraEnabled);
  };

  return (
    <div className="relative">
      {/* Hidden video element for processing */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
      />
      
      {/* Hidden canvas for frame processing */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Camera Toggle Button */}
      <button
        onClick={toggleCamera}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
          state.isCameraEnabled
            ? 'bg-green-600/20 text-green-400 border border-green-500/30'
            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
        }`}
      >
        {state.isCameraEnabled ? (
          <>
            <Camera className="w-4 h-4" />
            <span>Camera ON</span>
          </>
        ) : (
          <>
            <CameraOff className="w-4 h-4" />
            <span>Camera OFF</span>
          </>
        )}
      </button>

      {/* Presence Indicator */}
      {state.isCameraEnabled && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            {state.presenceState === 'PRESENT' ? (
              <>
                <User className="w-3 h-3 text-green-400" />
                <span className="text-green-400">Present</span>
              </>
            ) : state.presenceState === 'ABSENT' ? (
              <>
                <UserX className="w-3 h-3 text-orange-400" />
                <span className="text-orange-400">Away</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-gray-500 animate-pulse" />
                <span className="text-gray-400">Detecting...</span>
              </>
            )}
          </div>
          
          {/* Debug info (can be hidden in production) */}
          <div className="text-[10px] text-gray-500 space-y-0.5">
            <div>Motion: {(motionLevel * 100).toFixed(2)}%</div>
            <div>Brightness: {luminance.toFixed(0)}</div>
          </div>
        </div>
      )}
    </div>
  );
};
