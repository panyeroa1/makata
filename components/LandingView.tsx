import React, { useEffect, useState } from 'react';
import { Video, Plus, Calendar, Clock } from 'lucide-react';

interface LandingViewProps {
  onNewMeeting: () => void;
  onJoinMeeting: () => void;
  onSchedule: () => void;
  isLight: boolean;
}

const LandingView: React.FC<LandingViewProps> = ({ onNewMeeting, onJoinMeeting, onSchedule, isLight }) => {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const themeClass = isLight ? 'bg-white text-gray-900' : 'bg-[#050505] text-white';
  const cardClass = isLight 
    ? 'bg-white border-gray-200 hover:shadow-xl' 
    : 'bg-[#0A0A0A] border-white/10 hover:bg-[#0F0F0F]';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';

  const formatTime = () => {
    return currentTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = () => {
    return currentTime.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className={`relative w-full min-h-screen flex items-center justify-center ${themeClass} font-sans py-8`}>
      {/* Subtle Background Gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full ${isLight ? 'bg-purple-500/5' : 'bg-purple-600/5'} blur-[120px]`} />
        <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full ${isLight ? 'bg-indigo-500/5' : 'bg-indigo-600/5'} blur-[120px]`} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6">
        {/* Time Display */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="text-4xl sm:text-5xl md:text-6xl font-light mb-2 tracking-tight">{formatTime()}</div>
          <div className={`text-sm sm:text-lg ${textMuted}`}>{formatDate()}</div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
          {/* New Meeting */}
          <button
            onClick={onNewMeeting}
            className={`group p-5 sm:p-8 rounded-2xl border ${cardClass} transition-all duration-300 active:scale-95 sm:hover:scale-105 hover:border-purple-500/30 text-left`}
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
              <Video size={24} className="text-white sm:w-7 sm:h-7" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-1 sm:mb-2">New Meeting</h3>
            <p className={`text-xs sm:text-sm ${textMuted}`}>
              Start an instant meeting with AI translation
            </p>
          </button>

          {/* Join Meeting */}
          <button
            onClick={onJoinMeeting}
            className={`group p-5 sm:p-8 rounded-2xl border ${cardClass} transition-all duration-300 active:scale-95 sm:hover:scale-105 hover:border-purple-500/30 text-left`}
          >
            <div className={`w-12 h-12 sm:w-14 sm:h-14 ${isLight ? 'bg-gray-100' : 'bg-white/5'} rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
              <Plus size={24} className={`sm:w-7 sm:h-7 ${isLight ? 'text-gray-700' : 'text-white'}`} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-1 sm:mb-2">Join</h3>
            <p className={`text-xs sm:text-sm ${textMuted}`}>
              Join an existing session with meeting ID
            </p>
          </button>

          {/* Schedule */}
          <button
            onClick={onSchedule}
            className={`group p-5 sm:p-8 rounded-2xl border ${cardClass} transition-all duration-300 active:scale-95 sm:hover:scale-105 hover:border-purple-500/30 text-left sm:col-span-2 md:col-span-1`}
          >
            <div className={`w-12 h-12 sm:w-14 sm:h-14 ${isLight ? 'bg-gray-100' : 'bg-white/5'} rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
              <Calendar size={24} className={`sm:w-7 sm:h-7 ${isLight ? 'text-gray-700' : 'text-white'}`} />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-1 sm:mb-2">Schedule</h3>
            <p className={`text-xs sm:text-sm ${textMuted}`}>
              Plan a meeting for later with calendar sync
            </p>
          </button>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-8 sm:mt-12">
          <p className={`text-xs sm:text-sm ${textMuted}`}>
            Powered by <span className="font-semibold text-purple-500">Eburon AI</span> • Premium Neural Translation
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingView;
