import React from 'react';
import { PipelineState } from '../types';
import { Power, MicOff } from 'lucide-react';

interface OrbitRingProps {
  state: PipelineState;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  isLive?: boolean;
  isActive?: boolean;
  onToggle?: () => void;
}

const OrbitRing: React.FC<OrbitRingProps> = ({ state, size = 'lg', label, isLive, isActive = true, onToggle }) => {
  const sizeClasses = {
    sm: 'w-24 h-24',
    md: 'w-48 h-48',
    lg: 'w-64 h-64',
  };

  // Determine colors based on state
  let ringColor = 'border-gray-800';
  let glowColor = 'shadow-none';
  let pulseSpeed = '';
  
  if (isActive) {
      if (state === PipelineState.LISTENING) {
        ringColor = 'border-cyan-500';
        glowColor = 'shadow-[0_0_30px_rgba(6,182,212,0.5)]';
        pulseSpeed = 'animate-pulse'; 
      } else if (state === PipelineState.PROCESSING) {
        ringColor = 'border-purple-500';
        glowColor = 'shadow-[0_0_40px_rgba(168,85,247,0.6)]';
        pulseSpeed = 'animate-spin duration-[3s]';
      } else if (state === PipelineState.SPEAKING) {
        ringColor = 'border-amber-500';
        glowColor = 'shadow-[0_0_50px_rgba(245,158,11,0.7)]';
        pulseSpeed = 'animate-pulse duration-[500ms]';
      }
  } else {
      ringColor = 'border-red-900/30';
      glowColor = 'shadow-none';
      pulseSpeed = '';
  }

  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} mx-auto group`}>
      {/* Outer Orbit */}
      <div 
        className={`absolute inset-0 rounded-full border-2 ${ringColor} border-opacity-30 border-t-transparent ${isActive && state === PipelineState.PROCESSING ? 'animate-spin' : ''}`}
        style={{ transition: 'all 0.5s ease' }}
      ></div>
      
      {/* Inner Core */}
      <button 
        onClick={onToggle}
        className={`absolute w-3/4 h-3/4 rounded-full border border-white/10 backdrop-blur-md bg-white/5 flex items-center justify-center ${glowColor} transition-all duration-500 cursor-pointer hover:bg-white/10 z-20`}
        title={isActive ? "Mute AI Assistant" : "Activate AI Assistant"}
      >
        <div className={`w-1/2 h-1/2 rounded-full ${isActive ? (state === PipelineState.SPEAKING ? 'bg-amber-500/20' : 'bg-cyan-500/10') : 'bg-red-500/10'} flex items-center justify-center transition-colors`}>
           {/* Core dot / Icon */}
           {isActive ? (
               <div className={`w-2 h-2 rounded-full bg-white ${state === PipelineState.PROCESSING ? 'animate-ping' : ''}`}></div>
           ) : (
               <MicOff className="text-red-500/50" size={24} />
           )}
        </div>
        
        {/* Hover Overlay for Mute */}
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Power className={isActive ? "text-red-400" : "text-green-400"} size={24} />
        </div>
      </button>

      {/* Floating particles (Decorative) - Only when active */}
      {isActive && (
          <div className="absolute inset-0 animate-spin duration-[10s] opacity-30 pointer-events-none">
            <div className="absolute top-0 left-1/2 w-1 h-1 bg-white rounded-full shadow-[0_0_10px_white]"></div>
          </div>
      )}

      {label && (
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 whitespace-nowrap pointer-events-none">
            <span className={`px-3 py-1 rounded-full bg-black/40 border ${isActive ? 'border-white/10 text-gray-300' : 'border-red-900/30 text-red-700'} text-xs font-rajdhani tracking-wider uppercase backdrop-blur-sm`}>
                {isActive ? label : 'AI PAUSED'}
            </span>
        </div>
      )}
    </div>
  );
};

export default OrbitRing;