import React from 'react';

interface WaveformProps {
  active: boolean;
  color?: string;
}

const Waveform: React.FC<WaveformProps> = ({ active, color = 'bg-cyan-400' }) => {
  return (
    <div className="flex items-end justify-center gap-1 h-8 w-16">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full ${color} ${active ? 'animate-waveform' : 'h-1'}`}
          style={{
            height: active ? undefined : '4px',
            animationDuration: `${0.4 + i * 0.1}s`,
            animationName: active ? 'wave' : 'none',
            animationIterationCount: 'infinite',
            animationDirection: 'alternate'
          }}
        ></div>
      ))}
      <style>{`
        @keyframes wave {
          0% { height: 20%; opacity: 0.5; }
          100% { height: 100%; opacity: 1; }
        }
        .animate-waveform {
            animation-name: wave;
            animation-timing-function: ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Waveform;
