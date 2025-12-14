import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Languages, Volume2, VolumeX, Activity, Loader2,  AlertCircle, X } from 'lucide-react';
import { Language } from '../types';
import { GoogleGenAI } from '@google/genai';
import { RealtimeTranslationService, RealtimeTranslationConfig } from '../services/realtimeTranslationService';

interface RealtimeTranslatorProps {
  isOpen: boolean;
  onClose: () => void;
  isLight: boolean;
  geminiClient: GoogleGenAI | null;
  availableLanguages: Language[];
  onError?: (error: string) => void;
  userName?: string;
}

const RealtimeTranslator: React.FC<RealtimeTranslatorProps> = ({
  isOpen,
  onClose,
  isLight,
  geminiClient,
  availableLanguages,
  onError,
  userName = 'User'
}) => {
  const [sourceLang, setSourceLang] = useState<Language>(Language.AUTO);
  const [targetLang, setTargetLang] = useState<Language>(Language.ENGLISH_US);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'translating' | 'speaking' | 'error'>('idle');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const serviceRef = useRef<RealtimeTranslationService | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);

  // Theme classes
  const bgClass = isLight ? 'bg-white' : 'bg-[#0A0A0A]';
  const borderClass = isLight ? 'border-gray-200' : 'border-white/10';
  const textClass = isLight ? 'text-gray-900' : 'text-white';
  const textMuted = isLight ? 'text-gray-600' : 'text-gray-400';
  const inputClass = isLight 
    ? 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500'
    : 'bg-white/5 border-white/10 text-white focus:border-purple-500';

  // Status color
  const getStatusColor = () => {
    switch (status) {
      case 'listening': return 'text-green-500';
      case 'translating': return 'text-blue-500';
      case 'speaking': return 'text-purple-500';
      case 'error': return 'text-red-500';
      default: return textMuted;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'listening': return 'Listening...';
      case 'translating': return 'Translating...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  // Start translation
  const handleStart = async () => {
    if (!geminiClient) {
      const error = 'Gemini client not initialized';
      setErrorMessage(error);
      setStatus('error');
      onError?.(error);
      return;
    }

    try {
      setErrorMessage('');
      
      const config: RealtimeTranslationConfig = {
        sourceLang,
        targetLang,
        mode: 'discrete-tts',
        enableLoopback: false,
        speakerLabel: userName,
      };

      const service = new RealtimeTranslationService(geminiClient, config, {
        onTranscript: (text, isFinal) => {
          setOriginalText(text);
        },
        onTranslation: (text, isFinal) => {
          setTranslatedText(text);
        },
        onError: (error) => {
          setErrorMessage(error);
          setStatus('error');
          onError?.(error);
        },
        onStatusChange: (newStatus) => {
          setStatus(newStatus);
        },
      });

      await service.start();
      serviceRef.current = service;
      setIsActive(true);

      // Simulate audio level for visual feedback
      audioLevelIntervalRef.current = window.setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);

    } catch (error: any) {
      console.error('Failed to start translation:', error);
      setErrorMessage(error.message || 'Failed to start translation');
      setStatus('error');
      onError?.(error.message);
    }
  };

  // Stop translation
  const handleStop = () => {
    if (serviceRef.current) {
      serviceRef.current.stop();
      serviceRef.current = null;
    }

    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
    setAudioLevel(0);
    setOriginalText('');
    setTranslatedText('');
  };

  // Update language while running
  useEffect(() => {
    if (serviceRef.current && isActive) {
      serviceRef.current.setSourceLanguage(sourceLang);
    }
  }, [sourceLang, isActive]);

  useEffect(() => {
    if (serviceRef.current && isActive) {
      serviceRef.current.setTargetLanguage(targetLang);
    }
  }, [targetLang, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleStop();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`relative w-full max-w-2xl ${bgClass} ${textClass} rounded-3xl shadow-2xl border ${borderClass} overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${borderClass}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <Languages size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Real-Time Translation</h2>
              <p className={`text-sm ${textMuted}`}>Powered by Eburon AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-white/5 transition-colors`}
            aria-label="Close translator"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Language Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${textMuted}`}>
                Your Language
              </label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as Language)}
                disabled={isActive}
                className={`w-full px-4 py-3 rounded-xl border ${inputClass} focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all disabled:opacity-50`}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${textMuted}`}>
                Target Language
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as Language)}
                className={`w-full px-4 py-3 rounded-xl border ${inputClass} focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all`}
              >
                {availableLanguages.filter(l => l !== Language.AUTO).map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Bar */}
          <div className={`flex items-center justify-between p-4 rounded-xl ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
            <div className="flex items-center gap-3">
              <Activity size={18} className={getStatusColor()} />
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
            {isActive && status === 'listening' && (
              <div className="flex gap-1 items-end h-6">
                {[...Array(5)].map((_, i) => {
                  const barHeight = Math.max(4, (audioLevel / 100) * 24 * (1 - i * 0.1));
                  const heightClass = barHeight < 8 ? 'h-1' : barHeight < 12 ? 'h-2' : barHeight < 16 ? 'h-3' : barHeight < 20 ? 'h-4' : 'h-5';
                  
                  return (
                    <div
                      key={i}
                      className={`w-1 bg-purple-500 rounded-full transition-all ${heightClass}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Transcripts */}
          <div className="space-y-3">
            {/* Original */}
            <div className={`p-4 rounded-xl border ${borderClass} min-h-[80px]`}>
              <div className={`text-xs font-medium mb-2 ${textMuted}`}>Original</div>
              <div className="text-sm">
                {originalText || <span className={textMuted}>Speak to start transcription...</span>}
              </div>
            </div>

            {/* Translation */}
            <div className={`p-4 rounded-xl border ${borderClass} bg-gradient-to-br ${isLight ? 'from-purple-50 to-indigo-50' : 'from-purple-900/10 to-indigo-900/10'} min-h-[80px]`}>
              <div className={`text-xs font-medium mb-2 ${textMuted}`}>Translation</div>
              <div className="text-sm font-medium">
                {translatedText || <span className={textMuted}>Translation will appear here...</span>}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-500">{errorMessage}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-3">
            {!isActive ? (
              <button
                onClick={handleStart}
                className="flex-1 bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
              >
                <Mic size={20} />
                Start Translation
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 px-6 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25"
              >
                <MicOff size={20} />
                Stop Translation
              </button>
            )}
          </div>

          {/* Info */}
          <p className={`text-xs text-center ${textMuted}`}>
            Grant microphone permissions when prompted. Translation happens in real-time.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RealtimeTranslator;
