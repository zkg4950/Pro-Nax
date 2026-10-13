/* Copyright (c) 2026 ProNax. All rights reserved. */
import React, { useEffect, useRef } from 'react';
import { useAICopilot } from './AICopilotContext';

export const LivingOrb: React.FC<{ size?: number }> = ({ size = 200 }) => {
  const { state } = useAICopilot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = size * 0.3;

    let time = 0;

    const animate = () => {
      time += 0.02;
      ctx.clearRect(0, 0, size, size);

      const audioLevel = state.audioLevel;
      const orbState = state.orbState;

      // Dynamic radius based on state and audio
      let dynamicRadius = baseRadius;
      let glowIntensity = 0.3;
      let pulseSpeed = 1;
      let colorPrimary = '#8b5cf6'; // Purple
      let colorSecondary = '#06b6d4'; // Cyan

      switch (orbState) {
        case 'IDLE':
          // Gentle breathing glow
          dynamicRadius = baseRadius + Math.sin(time * pulseSpeed) * 5;
          glowIntensity = 0.3 + Math.sin(time * 0.5) * 0.1;
          break;
        case 'LISTENING':
          // Expanding responsive pulse matching microphone input
          dynamicRadius = baseRadius + audioLevel * 30 + Math.sin(time * 3) * 5;
          glowIntensity = 0.5 + audioLevel * 0.5;
          pulseSpeed = 3;
          colorPrimary = '#22c55e'; // Green when listening
          colorSecondary = '#84cc16';
          break;
        case 'THINKING':
          // Orbiting particle rings
          dynamicRadius = baseRadius + Math.sin(time * 2) * 8;
          glowIntensity = 0.6 + Math.sin(time * 4) * 0.2;
          pulseSpeed = 2;
          colorPrimary = '#f59e0b'; // Orange when thinking
          colorSecondary = '#eab308';
          break;
        case 'SPEAKING':
          // Expressive waveform pulsating
          dynamicRadius = baseRadius + Math.sin(time * 5) * 15;
          glowIntensity = 0.7 + Math.sin(time * 8) * 0.3;
          pulseSpeed = 5;
          colorPrimary = '#3b82f6'; // Blue when speaking
          colorSecondary = '#60a5fa';
          break;
      }

      // Create gradient
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, dynamicRadius * 2
      );
      gradient.addColorStop(0, colorPrimary);
      gradient.addColorStop(0.5, colorSecondary);
      gradient.addColorStop(1, 'transparent');

      // Draw outer glow
      ctx.beginPath();
      ctx.arc(centerX, centerY, dynamicRadius * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = glowIntensity * 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Draw main orb
      ctx.beginPath();
      ctx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
      const orbGradient = ctx.createRadialGradient(
        centerX - dynamicRadius * 0.3, centerY - dynamicRadius * 0.3, 0,
        centerX, centerY, dynamicRadius
      );
      orbGradient.addColorStop(0, '#ffffff');
      orbGradient.addColorStop(0.3, colorPrimary);
      orbGradient.addColorStop(1, colorSecondary);
      ctx.fillStyle = orbGradient;
      ctx.fill();

      // Draw inner glow
      ctx.beginPath();
      ctx.arc(centerX, centerY, dynamicRadius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${glowIntensity * 0.3})`;
      ctx.fill();

      // Draw orbiting particles when thinking
      if (orbState === 'THINKING') {
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
          const angle = (time * 2) + (i * (Math.PI * 2 / particleCount));
          const orbitRadius = dynamicRadius * 1.4;
          const px = centerX + Math.cos(angle) * orbitRadius;
          const py = centerY + Math.sin(angle) * orbitRadius;

          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = colorPrimary;
          ctx.fill();

          // Trail
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(
            centerX + Math.cos(angle - 0.3) * orbitRadius,
            centerY + Math.sin(angle - 0.3) * orbitRadius
          );
          ctx.strokeStyle = colorSecondary;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Draw waveform when speaking (lip-sync effect)
      if (orbState === 'SPEAKING') {
        const waveCount = 3;
        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          for (let i = 0; i <= 360; i += 5) {
            const angle = (i * Math.PI) / 180;
            // Enhanced waveform with audio level for lip-sync
            const waveAmplitude = 10 + audioLevel * 20;
            const waveRadius = dynamicRadius * (1.2 + w * 0.2) + 
                              Math.sin(angle * 4 + time * 5 + w) * waveAmplitude;
            const wx = centerX + Math.cos(angle) * waveRadius;
            const wy = centerY + Math.sin(angle) * waveRadius;
            
            if (i === 0) {
              ctx.moveTo(wx, wy);
            } else {
              ctx.lineTo(wx, wy);
            }
          }
          ctx.closePath();
          ctx.strokeStyle = colorSecondary;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.4 - w * 0.1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        
        // Add inner pulsing core synced to audio
        const pulseRadius = dynamicRadius * 0.5 + audioLevel * 15;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + audioLevel * 0.4})`;
        ctx.fill();
      }

      // Draw listening indicator
      if (orbState === 'LISTENING') {
        const ringCount = 2;
        for (let r = 0; r < ringCount; r++) {
          const ringRadius = dynamicRadius * (1.3 + r * 0.2);
          const ringAlpha = (Math.sin(time * 3 + r) + 1) / 2 * 0.3;
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = colorPrimary;
          ctx.lineWidth = 2;
          ctx.globalAlpha = ringAlpha;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.orbState, state.audioLevel, size]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full"
      />
      
      {/* State indicator */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-black/50 px-2 py-1 rounded-full">
          {state.orbState}
        </span>
      </div>
    </div>
  );
};
