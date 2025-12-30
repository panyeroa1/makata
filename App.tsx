import React, { useState, useEffect, useRef } from 'react';
import LandingView from './components/LandingView';
import ConsentDialog from './components/ConsentDialog';
import { 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  PhoneOff, 
  Globe, 
  Activity,
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  Mail,
  Copy,
  ArrowLeft,
  Users,
  Lock,
  Key,
  Pin,
  Volume2,
  VolumeX,
  MoreVertical,
  Shield,
  LayoutGrid,
  BrainCircuit,
  MessageSquare,
  MonitorUp,
  Disc,
  Smile,
  Send,
  X,
  Hand,
  MoreHorizontal,
  Check,
  UserPlus,
  UserMinus,
  AlertCircle,
  Settings as SettingsIcon,
  Link as LinkIcon,
  Trash2,
  BadgeCheck,
  RotateCcw,
  User,
  List,
  Grid,
  Camera,
  Edit2,
  LogOut,
  UploadCloud,
  Loader2,
  Captions,
  Monitor,
  Layout,
  PlayCircle,
  Languages,
  Sparkles
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { supabase, updateUserProfile, ensureGuestSession } from './services/supabaseClient';
import { SignalingService, ParticipantData } from './services/signalingService';


import { AppMode, Language, LanguageConfig, PipelineState, MessageLog, Participant, SubtitleState, ChatMessage, AppSettings, AppTheme, AppFont, ConsentState, RoomMode } from './types';
import { DEFAULT_LANGUAGE_CONFIG, COLORS } from './constants';
import { createAudioContext, blobToBase64 } from './services/audioUtils';
import { 
  transcribeAudio, 
  translateText, 
  generateSpeech, 
  LiveSession 
} from './services/geminiService';
import { TranslationPipeline } from './services/translationPipeline';
import { webSpeechSTT, WebSpeechSTT } from './services/webSpeechSTT';

import OrbitRing from './components/OrbitRing';
import GlassPanel from './components/GlassPanel';
import Waveform from './components/Waveform';
import RealtimeTranslator from './components/RealtimeTranslator';
import { DeepgramSTT } from './services/deepgramSTT';
import { transcriptLogger } from './services/transcriptLogger';
import { WebRTCService } from './services/webrtcService';

type SetupView = 'LANDING' | 'HOST' | 'JOIN' | 'SETTINGS' | 'AUTH';
type SidebarView = 'NONE' | 'PARTICIPANTS' | 'CHAT';
type ParticipantViewMode = 'LIST' | 'GRID';
type MainLayout = 'FOCUS' | 'GRID';

// Mock data removed as per user request
const MOCK_PARTICIPANTS: Participant[] = [];

const DEFAULT_SETTINGS: AppSettings = {
  theme: AppTheme.DARK,
  font: AppFont.FUTURISTIC,
  allowInstantJoin: false,
};

// Mac-style Tooltip Component
const Tooltip = ({ children, text }: { children: React.ReactNode, text: string }) => {
    return (
        <div className="group relative flex flex-col items-center">
            {children}
            <div className="absolute bottom-full mb-3 hidden flex-col items-center group-hover:flex z-[100] transition-opacity duration-200 pointer-events-none animate-float-up-sm">
                <span className="relative z-10 p-2 text-xs leading-none text-white whitespace-no-wrap bg-black/90 backdrop-blur-md shadow-xl rounded-lg px-3 font-medium border border-white/10">
                    {text}
                </span>
                <div className="w-3 h-3 -mt-2 rotate-45 bg-black/90 border-r border-b border-white/10"></div>
            </div>
        </div>
    );
};

// Floating emoji component
const ReactionBubble = ({ emoji, onComplete }: { emoji: string, onComplete: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onComplete, 2000);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="absolute bottom-20 right-10 text-4xl animate-float-up pointer-events-none z-50 opacity-0">
            {emoji}
        </div>
    );
};

const vibrate = (pattern: number | number[] = 10) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
    }
};

const App: React.FC = () => {
  // --- State ---
  const [mode, setMode] = useState<AppMode>(AppMode.IDLE);
  const [setupView, setSetupView] = useState<SetupView>('LANDING');
  const [pipelineState, setPipelineState] = useState<PipelineState>(PipelineState.IDLE);
  const [config, setConfig] = useState<LanguageConfig>(DEFAULT_LANGUAGE_CONFIG);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  
  // Auth & User State
  const [session, setSession] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');

  // Session Info
  const [sessionId, setSessionId] = useState(''); // Room code for sharing
  const [sessionPass, setSessionPass] = useState('');
  const [roomId, setRoomId] = useState(''); // UUID from Supabase
  const [participantId, setParticipantId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [joinPass, setJoinPass] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [roomAllowInstantJoin, setRoomAllowInstantJoin] = useState<boolean>(false);
  
  // Call State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mainLayout, setMainLayout] = useState<MainLayout>('FOCUS');
  const [pinnedUser, setPinnedUser] = useState<string>('me'); // 'me' or participant ID
  const [monitorAI, setMonitorAI] = useState(true); // Default to TRUE so user hears their own translation (loopback)
  const [isAIActive, setIsAIActive] = useState(false); // Master switch for AI - Default to FALSE
  const [subtitle, setSubtitle] = useState<SubtitleState>({ original: '', translation: '', lastUpdated: 0 });
  const [showCaptions, setShowCaptions] = useState(true);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showSettingsInCall, setShowSettingsInCall] = useState(false);
  const [showFullScreenSettings, setShowFullScreenSettings] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showRealtimeTranslator, setShowRealtimeTranslator] = useState(false);
  
  // Audio Device State
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>('');
  
  // UI Panels
  const [activeSidebar, setActiveSidebar] = useState<SidebarView>('NONE');
  const [participantViewMode, setParticipantViewMode] = useState<ParticipantViewMode>('LIST');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{id: number, emoji: string}[]>([]);
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // UI Dropdowns
  const [activeParticipantMenu, setActiveParticipantMenu] = useState<string | null>(null);

  // Feature Toggles
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMeetingLocked, setIsMeetingLocked] = useState(false);
  
  // Consent State
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showEndCallModal, setShowEndCallModal] = useState(false);
  const [consentState, setConsentState] = useState<ConsentState>({
    granted: false,
    timestamp: null,
    region: 'Global'
  });

  // Media State
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const translationPipelineRef = useRef<any>(null); // TranslationPipeline instance
  const sharedTabSTTRef = useRef<DeepgramSTT | null>(null);
  const roomChannelRef = useRef<any>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);

  // AI Client
  const apiKey = process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';
  const aiRef = useRef<GoogleGenAI | null>(null);

  // --- Effects ---

  useEffect(() => {
    if (apiKey) {
      aiRef.current = new GoogleGenAI({ apiKey });
    } else {
        console.error("API Key is missing! Please set GEMINI_API_KEY in .env");
        setToastMessage("Critical: API Key missing");
    }
  }, [apiKey]);

  // Parse URL for orbit ID (domain.com/orbit-id/)
  useEffect(() => {
    const path = window.location.pathname;
    // Match pattern: /XXX-XXX-XXX/ or /XXX-XXX-XXX
    const match = path.match(/^\/(\d{3}-\d{3}-\d{3})\/?$/);
    if (match) {
      const orbitId = match[1];
      setJoinId(orbitId);
      setSetupView('JOIN');
      setToastMessage(`Joining meeting: ${orbitId}`);
      // Clean up URL without reload
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Auth Session Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setSession(session);
      if (session?.user) {
         setDisplayName(session.user.user_metadata?.display_name || '');
         setUserAvatar(session.user.user_metadata?.avatar_url || null);
         if (session.user.user_metadata?.settings) {
             setSettings((prev: AppSettings) => ({...prev, ...session.user.user_metadata.settings}));
         }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setSession(session);
      if (session?.user) {
         setDisplayName(session.user.user_metadata?.display_name || '');
         setUserAvatar(session.user.user_metadata?.avatar_url || null);
         if (session.user.user_metadata?.settings) {
             setSettings((prev: AppSettings) => ({...prev, ...session.user.user_metadata.settings}));
         }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-save Settings
  useEffect(() => {
    if (session?.user) {
        const timer = setTimeout(() => {
            updateUserProfile({ settings }).catch(console.error);
        }, 2000); // Debounce 2s
        return () => clearTimeout(timer);
    }
  }, [settings, session]);

  // Persist meeting state to sessionStorage
  useEffect(() => {
    if (mode === AppMode.CALL_DISCRETE || mode === AppMode.CALL_LIVE) {
      const meetingState = {
        mode,
        sessionId,
        sessionPass,
        roomId,
        participantId,
        roomAllowInstantJoin,
        isHost,
        config
      };
      sessionStorage.setItem('orbitz_meeting', JSON.stringify(meetingState));
    }
  }, [mode, sessionId, sessionPass, roomId, participantId, roomAllowInstantJoin, isHost, config]);

  // Restore meeting state on mount (for refresh)
  useEffect(() => {
    const saved = sessionStorage.getItem('orbitz_meeting');
    if (saved) {
      try {
        const meetingState = JSON.parse(saved);
        setSessionId(meetingState.sessionId);
        setSessionPass(meetingState.sessionPass);
        setRoomId(meetingState.roomId || '');
        setParticipantId(meetingState.participantId || '');
        setRoomAllowInstantJoin(Boolean(meetingState.roomAllowInstantJoin));
        setIsHost(meetingState.isHost);
        setConfig(meetingState.config);
        setMode(meetingState.mode);
        
        // Fix for persistence: Ensure we exit LANDING view
        // usage of 'HOST'/'JOIN' bypasses the landing check
        // and correctly routes if in IDLE/SETUP mode
        setSetupView(meetingState.isHost ? 'HOST' : 'JOIN');
        
        setToastMessage('Reconnected to meeting');
      } catch (e) {
        console.error('Failed to restore meeting state:', e);
        sessionStorage.removeItem('orbitz_meeting');
      }
    }
  }, []);

  // Enumerate audio/video devices
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        // Request permission first (needed to get device labels)
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
          stream.getTracks().forEach(track => track.stop());
        }).catch(() => {});
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
        setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
        setVideoInputDevices(devices.filter(d => d.kind === 'videoinput'));
        
        // Set defaults
        const defaultAudioIn = devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default');
        const defaultAudioOut = devices.find(d => d.kind === 'audiooutput' && d.deviceId === 'default');
        const defaultVideoIn = devices.find(d => d.kind === 'videoinput');
        
        if (defaultAudioIn) setSelectedAudioInput(defaultAudioIn.deviceId);
        if (defaultAudioOut) setSelectedAudioOutput(defaultAudioOut.deviceId);
        if (defaultVideoIn) setSelectedVideoInput(defaultVideoIn.deviceId);
      } catch (e) {
        console.error('Failed to enumerate devices:', e);
      }
    };
    
    enumerateDevices();
    
    // Re-enumerate when devices change
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
  }, []);

  // CRITICAL: Re-attach stream to video element when view mounts or camera state changes
  useEffect(() => {
    if ((mode === AppMode.CALL_LIVE || mode === AppMode.CALL_DISCRETE) && videoRef.current) {
        if (isScreenSharing && screenStreamRef.current) {
            videoRef.current.srcObject = screenStreamRef.current;
        } else if (isCamOn && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        } else {
            videoRef.current.srcObject = null;
        }
    }
  }, [mode, isCamOn, isScreenSharing]);

  // Attach remote stream to pinned view
  useEffect(() => {
    if (!remoteVideoRef.current) return;
    if (pinnedUser === 'me') {
        remoteVideoRef.current.srcObject = null;
        return;
    }

    const participant = participants.find(p => p.id === pinnedUser);
    const stream = participant?.userId ? remoteStreams[participant.userId] : null;
    remoteVideoRef.current.srcObject = stream || null;
  }, [pinnedUser, participants, remoteStreams]);

  // Subtitle Fade Out Timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - subtitle.lastUpdated > 12000 && (subtitle.original || subtitle.translation)) {
         setSubtitle({ original: '', translation: '', lastUpdated: Date.now() });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [subtitle]);

  // Room presence sync
  useEffect(() => {
    if (!roomId) return;
    let isActive = true;

    const loadParticipants = async () => {
        const list = await SignalingService.getRoomParticipants(roomId);
        if (isActive) {
            syncParticipants(list);
        }
    };

    loadParticipants();

    if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
        roomChannelRef.current = null;
    }

    roomChannelRef.current = SignalingService.subscribeToRoom(roomId, {
        onParticipantJoined: (participant) => {
            const selfId = session?.user?.id;
            if (selfId && participant.user_id === selfId) {
                setParticipantId(participant.id);
                return;
            }
            setParticipants((prev) => {
                if (prev.some(p => p.id === participant.id)) return prev;
                return [...prev, mapParticipantData(participant)];
            });
        },
        onParticipantUpdated: (participant) => {
            const selfId = session?.user?.id;
            if (selfId && participant.user_id === selfId) {
                setParticipantId(participant.id);
                if (mode === AppMode.WAITING_ROOM && participant.status === 'active') {
                    startLivePipeline();
                }
                return;
            }

            setParticipants((prev) => prev.map(p => {
                if (p.id !== participant.id) return p;
                return {
                    ...p,
                    status: participant.status,
                };
            }));
        },
        onParticipantLeft: (participant) => {
            setParticipants((prev) => prev.filter(p => p.id !== participant.id));
            setRemoteStreams((prev) => {
                const next = { ...prev };
                if (participant.user_id && next[participant.user_id]) {
                    delete next[participant.user_id];
                }
                return next;
            });
        }
    });

    return () => {
        isActive = false;
        if (roomChannelRef.current) {
            supabase.removeChannel(roomChannelRef.current);
            roomChannelRef.current = null;
        }
    };
  }, [roomId, session?.user?.id, mode]);

  // Monitor Audio Toggle
  useEffect(() => {
    if (liveSessionRef.current) {
        liveSessionRef.current.setVolume(monitorAI ? 1 : 0);
    }
  }, [monitorAI]);

  // AI Active Toggle Effect
  useEffect(() => {
     if (liveSessionRef.current) {
         if (!isAIActive) {
             setPipelineState(PipelineState.IDLE);
         }
     }
  }, [isAIActive]);

  // Toast Timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Generate Session ID on mount
  useEffect(() => {
    generateSessionCreds();
  }, []);
  
  // Scroll chat to bottom
  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeSidebar]);

  const generateSessionCreds = () => {
    const pass = Math.random().toString(36).slice(-6).toUpperCase();
    setSessionId('');
    setSessionPass(pass);
  };

  // --- Styles Computation ---
  const getThemeClasses = () => {
      const isLight = settings.theme === AppTheme.LIGHT || (settings.theme === AppTheme.SYSTEM && window.matchMedia('(prefers-color-scheme: light)').matches);
      
      const bg = isLight ? 'bg-[#F2F4F8] text-gray-900' : 'bg-transparent text-white';
      // Sleeker panel with smoother borders
      const panel = isLight 
          ? 'bg-white/80 border-white/40 text-gray-900 shadow-2xl shadow-blue-900/5' 
          : '!bg-[#0A0A0A]/80 border-white/5 text-white shadow-2xl shadow-black/50';
      
      const input = isLight 
          ? 'bg-gray-50 border-transparent text-gray-900 focus:bg-white focus:shadow-inner' 
          : 'bg-[#121212] border-white/5 text-white focus:bg-[#1A1A1A]';
      
      return { bg, panel, input, isLight };
  };

  const getFontClass = () => {
      switch (settings.font) {
          case AppFont.CLASSIC: return 'font-sans';
          case AppFont.TERMINAL: return 'font-mono';
          default: return 'font-inter'; // Default futuristic stack
      }
  };

  const theme = getThemeClasses();
  const fontClass = getFontClass();

  // --- Actions ---

  const showToast = (msg: string) => setToastMessage(msg);

  const ensureMeetingAuth = async () => {
    try {
      await ensureGuestSession();
      return true;
    } catch (error: any) {
      console.error('Failed to authenticate:', error);
      showToast('Authentication failed');
      return false;
    }
  };
  
  const getMeetingLink = () => `${window.location.origin}/${sessionId}/`;

  const copyInvite = () => {
      if (!sessionId) {
          showToast('Meeting ID not ready yet');
          return;
      }
      const link = getMeetingLink();
      const invite = `Join Orbits Meeting\nLink: ${link}\nID: ${sessionId}\nPass: ${sessionPass}`;
      navigator.clipboard.writeText(invite);
      showToast('Meeting Invite Copied!');
  };

  const resetSettings = () => {
      setSettings(DEFAULT_SETTINGS);
      showToast("Settings reset to defaults");
      vibrate(50);
  };

  const mapParticipantData = (p: ParticipantData): Participant => {
      const isSelf = p.user_id === session?.user?.id;
      const fallbackName = `Guest ${p.user_id?.slice(0, 4) || '----'}`;
      return {
          id: p.id,
          userId: p.user_id,
          name: isSelf ? (displayName || 'You') : fallbackName,
          role: p.role === 'host' ? 'host' : 'guest',
          status: p.status,
          isMuted: false,
          isCamOn: false,
          isTalking: false,
          avatarUrl: isSelf ? userAvatar || undefined : undefined,
      };
  };

  const syncParticipants = (list: ParticipantData[]) => {
      const selfId = session?.user?.id;
      let selfParticipantId = participantId;
      const others: Participant[] = [];

      list.forEach((p) => {
          if (selfId && p.user_id === selfId) {
              selfParticipantId = p.id;
              return;
          }
          others.push(mapParticipantData(p));
      });

      if (selfParticipantId && selfParticipantId !== participantId) {
          setParticipantId(selfParticipantId);
      }
      setParticipants(others);
  };

  const ensureRoomForHost = async () => {
      if (!isHost || roomId) return true;
      const authed = await ensureMeetingAuth();
      if (!authed) return false;

      const passcode = sessionPass || Math.random().toString(36).slice(-6).toUpperCase();
      if (!sessionPass) {
          setSessionPass(passcode);
      }

      const created = await SignalingService.createRoom(
          'one_to_many',
          passcode,
          settings.allowInstantJoin
      );

      if (!created) {
          showToast('Failed to create room');
          return false;
      }

      setRoomId(created.room_id);
      setSessionId(created.room_code);
      setRoomAllowInstantJoin(Boolean(created.settings?.allow_instant_join));

      return true;
  };

  const startWebRTC = async (stream: MediaStream) => {
      if (!roomId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (webrtcRef.current) {
          webrtcRef.current.disconnect();
      }

      const service = new WebRTCService();
      webrtcRef.current = service;

      await service.initialize(
          {
              roomId,
              peerId: user.id,
              isHost,
              onRemoteStream: (remoteStream, peerId) => {
                  const key = peerId || 'remote';
                  setRemoteStreams(prev => ({ ...prev, [key]: remoteStream }));
                  if (remoteAudioRef.current) {
                      remoteAudioRef.current.srcObject = remoteStream;
                  }
              }
          },
          stream
      );
  };

  const stopWebRTC = () => {
      if (webrtcRef.current) {
          webrtcRef.current.disconnect();
          webrtcRef.current = null;
      }
      setRemoteStreams({});
      if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
      }
  };

  // --- Auth & Saving ---

  const handleAuth = async () => {
      setIsLoadingAuth(true);
      try {
          if (isSignUp) {
              const { error } = await supabase.auth.signUp({
                  email: authEmail,
                  password: authPassword,
                  options: {
                      data: { display_name: displayName }
                  }
              });
              if (error) throw error;
              showToast("Account created! Check your email.");
          } else {
              const { error } = await supabase.auth.signInWithPassword({
                  email: authEmail,
                  password: authPassword
              });
              if (error) throw error;
              showToast("Logged in successfully");
              setSetupView('LANDING');
          }
      } catch (error: any) {
          showToast(error.message);
      } finally {
        setIsLoadingAuth(false);
    }
};

const handleGoogleLogin = async () => {
    setIsLoadingAuth(true);
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
    } catch (error: any) {
        showToast(error.message);
        setIsLoadingAuth(false);
    }
};
  const handleLogout = async () => {
      await supabase.auth.signOut();
      setSession(null);
      setDisplayName('');
      setUserAvatar(null);
      showToast("Logged out");
      setSetupView('LANDING');
  };

  const saveToCloud = async () => {
      if (!session) {
          showToast("Please log in to save settings to cloud");
          return;
      }
      if (!session) return;
      try {
          const { error } = await supabase.auth.updateUser({
              data: { settings }
          });
          if (error) throw error;
          showToast("Settings saved to cloud");
      } catch (error: any) {
          showToast("Failed to save settings");
      }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      if (!session) {
          showToast("Log in to upload avatar");
          return;
      }

      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      try {
          showToast("Uploading...");
          const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
          setUserAvatar(data.publicUrl);
          
          await updateUserProfile({ avatar_url: data.publicUrl });
          
          showToast("Avatar uploaded successfully");
      } catch (error: any) {
          // If bucket doesn't exist or permissions fail, we just mock it for UI demo
          console.warn("Storage upload failed (Mocking for UI):", error);
          const reader = new FileReader();
          reader.onload = (ev) => {
              if (typeof ev.target?.result === 'string') {
                  setUserAvatar(ev.target.result);
                  showToast("Avatar set (Local Only - Storage requires setup)");
              }
          };
          reader.readAsDataURL(file);
      }
  };

  // --- Participant Management ---

  const admitParticipant = async (participantId: string) => {
    const participant = participants.find((p: Participant) => p.id === participantId);
    if (!participant) return;
    
    try {
        await SignalingService.updateParticipantStatus(participantId, 'active');
        setParticipants((prev: Participant[]) => prev.map((p: Participant) => p.id === participantId ? { ...p, status: 'active' } : p));
        showToast(`${participant.name} admitted`);
    } catch (error) {
        showToast("Failed to admit participant");
    }
  };

  const admitAllParticipants = async () => {
    const waiting = participants.filter((p: Participant) => p.status === 'waiting');
    if (waiting.length === 0) return;

    try {
        for (const p of waiting) {
            await SignalingService.updateParticipantStatus(p.id, 'active');
        }
        setParticipants((prev: Participant[]) => prev.map((p: Participant) => p.status === 'waiting' ? { ...p, status: 'active' } : p));
        showToast(`Admitted ${waiting.length} participants`);
    } catch (error) {
        showToast("Failed to admit all participants");
    }
  };
  const removeParticipant = (id: string) => {
      setParticipants((prev: Participant[]) => prev.filter((p: Participant) => p.id !== id));
      setActiveParticipantMenu(null);
      showToast('Participant removed');
  };

  const makeHost = (id: string) => {
      // Transfer host logic (mock)
      const p = participants.find((p: Participant) => p.id === id);
      if (p) {
          showToast(`${p.name} is now the Host`);
          setIsHost(false); // In real app, this would change permissions
          setActiveParticipantMenu(null);
      }
  };

  const toggleParticipantMute = (id: string) => {
      if (!isHost) return;
      setParticipants((prev: Participant[]) => prev.map((p: Participant) => {
          if (p.id === id) {
              const newMuted = !p.isMuted;
              showToast(newMuted ? `Muted ${p.name}` : `Requested ${p.name} to unmute`);
              return { ...p, isMuted: newMuted };
          }
          return p;
      }));
      setActiveParticipantMenu(null);
  };

  const toggleParticipantVideo = (id: string) => {
      if (!isHost) return;
      setParticipants((prev: Participant[]) => prev.map((p: Participant) => {
          if (p.id === id) {
              const newCam = !p.isCamOn;
              showToast(newCam ? `Requested ${p.name} to start video` : `Stopped video for ${p.name}`);
              return { ...p, isCamOn: newCam };
          }
          return p;
      }));
      setActiveParticipantMenu(null);
  };


  // --- Media & Pipeline Logic ---

  const startMedia = async (video: boolean, audio: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: video ? { width: 1280, height: 720, facingMode: 'user' } : false, 
        audio: audio 
      });
      streamRef.current = stream;
      
      setIsMicOn(audio);
      setIsCamOn(video);
      return stream;
    } catch (err) {
      console.error("Failed to get media", err);
      showToast("Camera/Mic access denied or failed");
      return null;
    }
  };

  const stopMedia = () => {
    streamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    streamRef.current = null;
    if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        screenStreamRef.current = null;
    }
    setIsMicOn(false);
    setIsCamOn(false);
    setIsScreenSharing(false);
    
    if (sharedTabSTTRef.current) {
        sharedTabSTTRef.current.stop();
        sharedTabSTTRef.current = null;
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
        // Stop sharing, revert to camera
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
            screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
        setShowShareMenu(false);
    } else {
        setShowShareMenu(true);
    }
  };

  const startScreenShare = async (shareType: 'screen' | 'window' | 'tab') => {
    try {
      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: {
          displaySurface: shareType === 'tab' ? 'browser' : shareType === 'window' ? 'window' : 'monitor'
        } as any,
        audio: shareType === 'tab' ? {
          suppressLocalAudioPlayback: false,
          echoCancellation: true,
          noiseSuppression: true
        } as any : false
      };

      const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);
      setShowShareMenu(false);

      // Check for audio track for "Host Shared Tab" STT
      const audioTrack = screenStream.getAudioTracks()[0];
      if (audioTrack) {
          const apiKey = process.env.VITE_DEEPGRAM_API_KEY || import.meta.env.VITE_DEEPGRAM_API_KEY || '';
          if (apiKey) {
              const stt = new DeepgramSTT(apiKey);
              sharedTabSTTRef.current = stt;
              
              await stt.start(
                 screenStream, 
                 {
                     onTranscript: async (segment) => {
                         if (segment.isFinal) {
                             await transcriptLogger.logSegment(sessionId || 'active-session', segment.text);
                         }
                     }
                 },
                 'Host Shared Tab'
              );
              showToast('Shared Tab Audio Transcription Active');
          }
      }
      
      // Show toast based on share type
      showToast(`Sharing ${shareType === 'tab' ? 'browser tab' : shareType === 'window' ? 'window' : 'entire screen'}`);
      
      // Handle user stopping via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        showToast('Screen sharing stopped');
      };
    } catch (e) {
      console.error("Screen share failed", e);
      showToast("Screen share cancelled");
      setShowShareMenu(false);
    }
  };

  const processAudioChunk = async (blob: Blob) => {
    if (!aiRef.current || !isAIActive) return;
    setPipelineState(PipelineState.PROCESSING);
    
    // Transcribe
    const audioBase64 = await blobToBase64(blob);
    const text = await transcribeAudio(aiRef.current, audioBase64);
    
    if (!text.trim()) {
      setPipelineState(PipelineState.LISTENING);
      return; 
    }

    // Translate
    const translatedText = await translateText(aiRef.current, text, config.source, config.target);
    
    setSubtitle({
        original: text,
        translation: translatedText,
        lastUpdated: Date.now()
    });

    // TTS
    setPipelineState(PipelineState.SPEAKING);
    const ttsAudioBase64 = await generateSpeech(aiRef.current, translatedText, config.target);
    
    if (ttsAudioBase64) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(
        Uint8Array.from(atob(ttsAudioBase64), c => c.charCodeAt(0)).buffer
      );
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => setPipelineState(PipelineState.LISTENING);
    } else {
      setPipelineState(PipelineState.LISTENING);
    }
  };

  const startDiscretePipeline = async () => {
    if (isHost) {
        const roomReady = await ensureRoomForHost();
        if (!roomReady) return;
    }
    const stream = await startMedia(true, true);
    if (!stream) return;

    await startWebRTC(stream);

    setMode(AppMode.CALL_DISCRETE);
    setPipelineState(PipelineState.LISTENING);
    setParticipants([]);

    // Initialize TranslationPipeline with Web Speech API
    if (aiRef.current && consentState.granted) {
      const pipeline = new TranslationPipeline(
        {
          roomId: sessionId || 'demo-room',
          speakerId: session?.user?.id || 'anonymous',
          sourceLang: config.source,
          targetLang: config.target,
          useWebSpeech: WebSpeechSTT.isSupported(), // Use Web Speech if available
          enableTTS: true,
          geminiClient: aiRef.current,
        },
        {
          onTranscript: (text, isFinal) => {
            setSubtitle((prev: { original: string, translation: string, lastUpdated: number }) => ({
              ...prev,
              original: text,
              lastUpdated: Date.now()
            }));
            if (isFinal) {
              setPipelineState(PipelineState.PROCESSING);
            }
          },
          onTranslation: (text, isFinal) => {
            setSubtitle((prev: { original: string, translation: string, lastUpdated: number }) => ({
              ...prev,
              translation: text,
              lastUpdated: Date.now()
            }));
          },
          onTTSReady: (audioBase64) => {
            // Play TTS audio
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            ctx.decodeAudioData(
              Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0)).buffer
            ).then(audioBuffer => {
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start();
              source.onended = () => setPipelineState(PipelineState.LISTENING);
            });
            setPipelineState(PipelineState.SPEAKING);
          },
          onError: (error) => {
            console.error('[App] Pipeline error:', error);
            setPipelineState(PipelineState.LISTENING);
          },
        }
      );

      translationPipelineRef.current = pipeline;
      await pipeline.start();
      console.log('[App] TranslationPipeline started with Web Speech API');
    }

    // Fallback: Keep old media recorder logic if Translation Pipeline not active
    if (!translationPipelineRef.current) {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { 
          if (e.data.size > 0 && isAIActive) audioChunksRef.current.push(e.data); 
      };
      mediaRecorder.onstop = async () => {
        if (!isAIActive) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        await processAudioChunk(blob);
      };
      mediaRecorder.start();
      recordingIntervalRef.current = window.setInterval(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setTimeout(() => {
               if (mediaRecorder.state === 'inactive' && streamRef.current?.active) mediaRecorder.start();
          }, 100);
        }
      }, 4000);
    }
  };

  const startLivePipeline = async () => {
    if (!apiKey) return alert("API Key missing");
    if (isHost) {
        const roomReady = await ensureRoomForHost();
        if (!roomReady) return;
    }
    const stream = await startMedia(true, true);
    if (!stream) return;

    await startWebRTC(stream);

    setMode(AppMode.CALL_LIVE);
    setPipelineState(PipelineState.LISTENING);
    setParticipants([]);
    setChatMessages([{
        id: 'sys-1', senderId: 'system', senderName: 'System', 
        text: 'Welcome to Orbits. Click the Orbit Ring (bottom right) to activate AI Translation.', 
        timestamp: Date.now(), isSystem: true
    }]);


    const liveSession = new LiveSession(apiKey);
    liveSessionRef.current = liveSession;
    // Set initial monitoring state
    liveSession.setVolume(monitorAI ? 1 : 0);

    const sourceInstruction = config.source === Language.AUTO 
        ? "Detect the source language automatically." 
        : `The source language is ${config.source}.`;

    const systemInstruction = `
    You are Orbits, an elite real-time voice translator engine.
    ${sourceInstruction}
    Target Language: ${config.target}.

    CORE DIRECTIVE:
    Translate the user's speech into ${config.target} and speak it aloud immediately.

    "VOICE MIRROR" & "EXTREME NUANCE" PROTOCOLS:

    1. VERBATIM DISFLUENCY:
       - You MUST capture and reproduce EVERY filler word, hesitation, and stutter.
       - If the user says "Um... ah... I think...", you MUST say the equivalent in ${config.target}.
       - DO NOT CLEAN UP THE SPEECH. Do not make it sound professional. If they stumble, YOU STUMBLE.

    2. NON-CONVERSATIONAL:
       - DO NOT reply to the user. DO NOT have a conversation.
       - ONLY TRANSLATE what is heard. If silence, remain silent.
       - You are a tool, not a chatbot.
    `;

    await liveSession.connect({
        systemInstruction,
        voiceName: 'Puck',
    }, (text, sender) => {
        if (!isAIActive) return;

        setSubtitle((prev: { original: string, translation: string, lastUpdated: number }) => {
            const isModel = sender === 'model';
            return {
                original: isModel ? prev.original : text,
                translation: isModel ? text : prev.translation,
                lastUpdated: Date.now()
            };
        });

        if (sender === 'model') {
            setPipelineState(PipelineState.SPEAKING);
            setTimeout(() => setPipelineState(PipelineState.LISTENING), 3000);
        } else {
            setPipelineState(PipelineState.PROCESSING);
        }
    });

    const ctx = createAudioContext(16000); 
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
        if (isAIActive) {
            liveSession.sendAudioChunk(e.inputBuffer.getChannelData(0));
        }
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    processorRef.current = processor;
  };

  const endCall = () => {
    if (participantId) {
      SignalingService.leaveRoom(participantId);
    }
    stopMedia();
    stopWebRTC();
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    liveSessionRef.current?.disconnect();
    audioContextRef.current?.close();
    
    // Stop translation pipeline
    if (translationPipelineRef.current) {
      translationPipelineRef.current.stop();
      translationPipelineRef.current = null;
    }
    
    setMode(AppMode.IDLE);
    setSetupView('LANDING'); // Return to landing screen
    setPipelineState(PipelineState.IDLE);
    setSubtitle({ original: '', translation: '', lastUpdated: 0 });
    setParticipants([]);
    setIsHost(false);
    setRoomId('');
    setParticipantId('');
    setRoomAllowInstantJoin(false);
    setActiveSidebar('NONE');
    setShowSettingsInCall(false);
    setShowCaptions(true); // Reset captions to visible for next call
    generateSessionCreds();
  };

  const togglePin = (id: string) => {
    setPinnedUser(id);
  };

  const sendChatMessage = () => {
      if (!newMessage.trim()) return;
      const msg: ChatMessage = {
          id: Date.now().toString(),
          senderId: 'me',
          senderName: 'You',
          text: newMessage,
          timestamp: Date.now()
      };
      setChatMessages((prev: ChatMessage[]) => [...prev, msg]);
      setNewMessage('');
  };

  const triggerReaction = (emoji: string) => {
      const id = Date.now();
      setActiveReactions((prev: {id: number, emoji: string}[]) => [...prev, { id, emoji }]);
      setShowReactions(false);
  };

  // --- Sub-components ---

  const LanguageSelector = ({ label, value, onChange, compact = false }: { label?: string, value: Language, onChange: (val: Language) => void, compact?: boolean }) => (
    <div className={`space-y-2 ${compact ? 'min-w-[150px]' : ''}`}>
      {label && <label className={`text-xs ${theme.isLight ? 'text-gray-600' : 'text-gray-500'} uppercase tracking-widest font-bold ml-1`}>{label}</label>}
      <div className="relative group">
        <select 
          className={`w-full ${theme.input} rounded-xl ${compact ? 'py-2 pl-3 pr-8 text-sm' : 'p-4'} appearance-none focus:border-cyan-800 focus:ring-1 focus:ring-cyan-900 focus:outline-none transition-colors cursor-pointer hover:border-white/20 font-medium tracking-wide`}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as Language)}
          aria-label={label || "Select Language"}
          title={label || "Select Language"}
        >
          {Object.values(Language).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 pointer-events-none" size={compact ? 12 : 16} />
      </div>
    </div>
  );

  const renderAuth = () => (
      <GlassPanel className={`w-full max-w-md relative ${theme.panel} backdrop-blur-3xl mx-4`}>
           <button onClick={() => setSetupView('LANDING')} className={`absolute top-6 left-6 ${theme.isLight ? 'text-gray-600' : 'text-gray-500 hover:text-white'} transition-colors`} aria-label="Back to Landing">
                <ArrowLeft size={24} />
           </button>
           <div className="mt-8 mb-8 text-center">
               <h2 className={`text-3xl font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'} mb-2`}>
                   {isSignUp ? 'Create Account' : 'Welcome Back'}
               </h2>
               <p className="text-gray-500 text-xs tracking-widest uppercase">
                   {isSignUp ? 'Join the Neural Network' : 'Authenticate Identity'}
               </p>
           </div>
           
           <div className="space-y-4">
               {isSignUp && (
                   <div className="space-y-2">
                       <label className="text-xs text-gray-500 ml-1">Display Name</label>
                       <input 
                           type="text" 
                           value={displayName}
                           onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                           className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} 
                           placeholder="Your Name" 
                           aria-label="Display Name"
                           title="Your Display Name"
                       />
                   </div>
               )}
               <div className="space-y-2">
                   <label className="text-xs text-gray-500 ml-1">Email</label>
                   <input 
                       type="email" 
                       value={authEmail}
                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthEmail(e.target.value)}
                       className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} 
                       placeholder="user@orbits.app" 
                       aria-label="Email Address"
                       title="Your Email Address"
                   />
               </div>
               <div className="space-y-2">
                   <label className="text-xs text-gray-500 ml-1">Password</label>
                   <input 
                       type="password" 
                       value={authPassword}
                       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthPassword(e.target.value)}
                       className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} 
                       placeholder="••••••••" 
                       aria-label="Password"
                       title="Your Password"
                   />
               </div>
           </div>

           <button 
               onClick={handleAuth}
               disabled={isLoadingAuth}
               className="w-full mt-8 bg-gradient-to-r from-cyan-900 to-blue-900 hover:from-cyan-800 hover:to-blue-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 border border-cyan-500/20"
               aria-label={isSignUp ? 'Register' : 'Login'}
                title={isSignUp ? 'Register for an account' : 'Login to your account'}
            >
                {isLoadingAuth ? <Loader2 className="animate-spin" /> : (isSignUp ? <UserPlus size={20} /> : <Zap size={20} />)}
                <span>{isSignUp ? 'REGISTER ACCOUNT' : 'SECURE LOGIN'}</span>
            </button>

            <div className="my-6 flex items-center gap-4">
                <div className={`h-px flex-1 ${theme.isLight ? 'bg-gray-300' : 'bg-white/10'}`}></div>
                <span className={`text-xs uppercase tracking-widest ${theme.isLight ? 'text-gray-400' : 'text-gray-600'}`}>Or continue with</span>
                <div className={`h-px flex-1 ${theme.isLight ? 'bg-gray-300' : 'bg-white/10'}`}></div>
            </div>

            <button 
                onClick={handleGoogleLogin}
                disabled={isLoadingAuth}
                className={`w-full bg-white text-gray-900 hover:bg-gray-50 font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 border border-gray-200`}
                aria-label="Sign in with Google"
            >
               <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Google</span>
            </button>

           <div className="mt-6 text-center">
               <button 
                   onClick={() => setIsSignUp(!isSignUp)}
                   className="text-gray-500 hover:text-cyan-400 text-sm font-medium transition-colors"
                   aria-label={isSignUp ? 'Login to existing account' : 'Sign up for a new account'}
                   title={isSignUp ? 'Login to existing account' : 'Sign up for a new account'}
               >
                   {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
               </button>
           </div>
      </GlassPanel>
  );

  const renderSettings = (inCall: boolean = false) => (
      <GlassPanel className={`w-full max-w-2xl relative ${theme.panel} backdrop-blur-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]`}>
          <div className="flex items-center justify-between mb-8 flex-shrink-0">
             <button onClick={() => inCall ? setShowSettingsInCall(false) : setSetupView('LANDING')} className={`p-2 rounded-full hover:bg-gray-500/10 ${theme.isLight ? 'text-gray-600' : 'text-gray-500 hover:text-white'} transition-colors`} aria-label={inCall ? 'Close Settings' : 'Back to Home'}>
                {inCall ? <X size={24} /> : <ArrowLeft size={24} />}
            </button>
            <div className="text-center">
                <h2 className={`text-3xl font-bold mb-1`}>Settings</h2>
                <p className="text-gray-500 text-xs tracking-widest uppercase">System Configuration</p>
            </div>
            {/* If logged in, show logout button */}
            {session ? (
                 <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full" title="Logout" aria-label="Logout">
                     <LogOut size={20} />
                 </button>
            ) : <div className="w-10"></div>}
          </div>

          <div className="space-y-8 overflow-y-auto pr-2 flex-1 custom-scrollbar">
              
              {/* Profile Section */}
              <section className="space-y-4">
                  <h3 className="text-sm uppercase tracking-widest font-bold text-gray-500 border-b border-gray-700/50 pb-2">Profile</h3>
                  {!session && (
                      <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-sm mb-4 flex items-center gap-2">
                          <AlertCircle size={16} />
                          <span>Log in to save your profile to the cloud.</span>
                      </div>
                  )}
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                     {/* Avatar Edit */}
                     <div className="relative group cursor-pointer self-center md:self-start" onClick={() => fileInputRef.current?.click()}>
                         <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 p-1">
                             <div className={`w-full h-full rounded-full ${theme.isLight ? 'bg-gray-100' : 'bg-black'} flex items-center justify-center overflow-hidden`}>
                                 {userAvatar ? (
                                     <img src={userAvatar} alt="User Avatar" className="w-full h-full object-cover" />
                                 ) : (
                                     <User size={40} className={theme.isLight ? 'text-gray-400' : 'text-gray-600'} />
                                 )}
                             </div>
                         </div>
                         <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <Camera size={24} className="text-white" />
                         </div>
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleAvatarUpload}
                            aria-label="Upload Avatar"
                            title="Upload Avatar"
                         />
                     </div>

                     <div className="flex-1 grid grid-cols-1 gap-4 w-full">
                        <div className="space-y-2">
                            <label className="text-xs text-gray-500 ml-1">Display Name</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={displayName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                                    className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} 
                                    placeholder="Your Name" 
                                />
                                <Edit2 size={14} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-gray-500 ml-1">Email Address</label>
                            <input 
                                type="email" 
                                value={session?.user?.email || ''} 
                                disabled
                                className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none opacity-50 cursor-not-allowed`} 
                                placeholder="Not Logged In" 
                            />
                        </div>
                     </div>
                  </div>
              </section>

              {/* Preferences Section */}
              <section className="space-y-4">
                  <h3 className="text-sm uppercase tracking-widest font-bold text-gray-500 border-b border-gray-700/50 pb-2">Preferences</h3>
                  
                  {/* Theme */}
                  <div className="space-y-2">
                      <label className="text-xs text-gray-500 ml-1">Appearance</label>
                      <div className="grid grid-cols-3 gap-3">
                          {Object.values(AppTheme).map((t) => (
                              <button
                                  key={t}
                                  onClick={() => setSettings((s: AppSettings) => ({...s, theme: t}))}
                                  className={`py-3 px-3 rounded-xl text-sm font-medium transition-all border ${settings.theme === t ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg' : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'}`}
                              >
                                  {t}
                              </button>
                          ))}
                      </div>
                  </div>

                  {/* Font */}
                  <div className="space-y-2">
                      <label className="text-xs text-gray-500 ml-1">Typography</label>
                      <select 
                          className={`w-full ${theme.input} rounded-xl p-3 appearance-none focus:outline-none`}
                          value={settings.font}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSettings((s: AppSettings) => ({...s, font: e.target.value as AppFont}))}
                          aria-label="Select Typography"
                          title="Select Typography"
                      >
                          {Object.values(AppFont).map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                  </div>

                  {/* Instant Join Toggle */}
                  <div className={`flex items-center justify-between p-4 rounded-xl border ${theme.isLight ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/5'}`}>
                      <div className="flex flex-col">
                          <span className="font-semibold">Instant Join</span>
                          <span className="text-xs text-gray-500">Skip waiting room for guests</span>
                      </div>
                      <button 
                          onClick={() => {
                              const currentVal = roomId ? roomAllowInstantJoin : settings.allowInstantJoin;
                              const newVal = !currentVal;
                              if (roomId && isHost) {
                                  setRoomAllowInstantJoin(newVal);
                                  SignalingService.updateRoomSettings(roomId, { allow_instant_join: newVal });
                              } else {
                                  setSettings((s: AppSettings) => ({...s, allowInstantJoin: newVal}));
                              }
                          }}
                          className={`w-12 h-6 rounded-full p-1 transition-colors ${(roomId ? roomAllowInstantJoin : settings.allowInstantJoin) ? 'bg-cyan-600' : 'bg-gray-600'} ${roomId && !isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label={(roomId ? roomAllowInstantJoin : settings.allowInstantJoin) ? "Disable Instant Join" : "Enable Instant Join"}
                          title={roomId && !isHost ? "Only host can change Instant Join" : ((roomId ? roomAllowInstantJoin : settings.allowInstantJoin) ? "Disable Instant Join" : "Enable Instant Join")}
                          disabled={Boolean(roomId) && !isHost}
                      >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${(roomId ? roomAllowInstantJoin : settings.allowInstantJoin) ? 'translate-x-6' : 'translate-x-0'}`}></div>
                      </button>
                  </div>
              </section>

              {/* Security Section */}
              <section className="space-y-4">
                  <h3 className="text-sm uppercase tracking-widest font-bold text-gray-500 border-b border-gray-700/50 pb-2">Security</h3>
                  <div className="space-y-3">
                      <label className="text-xs text-gray-500 ml-1">Change Password</label>
                      <input type="password" className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} placeholder="Current Password" />
                      <div className="grid grid-cols-2 gap-3">
                         <input type="password" className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} placeholder="New Password" />
                         <input type="password" className={`w-full ${theme.input} rounded-xl p-3 focus:outline-none`} placeholder="Confirm New Password" />
                      </div>
                  </div>
              </section>
          </div>

          <div className="flex gap-4 mt-8 pt-4 border-t border-gray-700/30 flex-shrink-0">
              <button 
                  onClick={resetSettings}
                  className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 font-semibold flex items-center justify-center gap-2"
              >
                  <RotateCcw size={16} />
                  <span>Reset</span>
              </button>
              <button 
                  onClick={() => session ? saveToCloud() : inCall ? setShowSettingsInCall(false) : setSetupView('LANDING')}
                  className="flex-[2] bg-cyan-700 hover:bg-cyan-600 text-white font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2"
              >
                  {session ? <UploadCloud size={18} /> : <Check size={18} />}
                  <span>{session ? 'Save to Cloud' : 'Close'}</span>
              </button>
          </div>
      </GlassPanel>
  );



  const renderHostSetup = () => (
    <GlassPanel className={`w-full max-w-lg relative ${theme.panel} backdrop-blur-3xl mx-4`}>
      <button onClick={() => setSetupView('LANDING')} className={`absolute top-6 left-6 ${theme.isLight ? 'text-gray-600' : 'text-gray-500 hover:text-white'} transition-colors`} aria-label="Back to Landing" title="Back to Landing">
        <ArrowLeft size={24} />
      </button>
      
      <div className="mt-8 mb-8 text-center">
        <h2 className={`text-3xl font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'} mb-2`}>Session Configuration</h2>
        <p className="text-gray-500 text-xs tracking-widest uppercase">Initializing Secure Host</p>
      </div>

      <div className="space-y-4 mb-8">
        <LanguageSelector label="I want to listen in:" value={config.target} onChange={(v) => setConfig({ ...config, target: v, source: Language.AUTO })} />
      </div>

      <button 
        onClick={startLivePipeline}
        className="w-full bg-gradient-to-r from-cyan-900 to-blue-900 hover:from-cyan-800 hover:to-blue-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2 border border-cyan-500/20"
        aria-label="Start Meeting"
        title="Start Meeting"
      >
        <Zap size={20} className="text-cyan-200" />
        <span>START MEETING</span>
      </button>
    </GlassPanel>
  );

  const renderJoinSetup = () => (
    <GlassPanel className={`w-full max-w-lg relative ${theme.panel} backdrop-blur-3xl mx-4`}>
      <button onClick={() => setSetupView('LANDING')} className={`absolute top-6 left-6 ${theme.isLight ? 'text-gray-600' : 'text-gray-500 hover:text-white'} transition-colors`} aria-label="Back to Landing" title="Back to Landing">
        <ArrowLeft size={24} />
      </button>
      
      <div className="mt-8 mb-8 text-center">
        <h2 className={`text-3xl font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'} mb-2`}>Secure Handshake</h2>
        <p className="text-gray-500 text-xs tracking-widest uppercase">Join Existing Channel</p>
      </div>

      <div className="space-y-4 mb-8">
        <div className="space-y-2">
           <label className="text-xs text-gray-500 uppercase tracking-widest font-bold ml-1">Orbit ID</label>
           <input 
             type="text" 
             className={`w-full ${theme.input} rounded-xl p-4 font-mono placeholder-gray-500 focus:border-purple-800 focus:outline-none transition-colors`}
             placeholder="XXX-XXX-XXX"
             value={joinId}
             onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinId(e.target.value)}
           />
        </div>
        
        <div className="space-y-2">
           <label className="text-xs text-gray-500 uppercase tracking-widest font-bold ml-1">Secure Key (Password)</label>
           <input 
             type="password" 
             className={`w-full ${theme.input} rounded-xl p-4 font-mono placeholder-gray-500 focus:border-purple-800 focus:outline-none transition-colors`}
             placeholder="••••••••"
             value={joinPass}
             onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinPass(e.target.value)}
           />
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <LanguageSelector label="I want to listen in:" value={config.target} onChange={(v) => setConfig({ ...config, target: v, source: Language.AUTO })} />
      </div>

      <button 
        onClick={async () => {
            if (joinId && joinPass) {
                const authed = await ensureMeetingAuth();
                if (!authed) return;

                // Join logic
                const result = await SignalingService.joinRoom(
                    joinId,
                    joinPass,
                    'audience',
                    'en',
                    config.target,
                    true
                );
                if (result) {
                    setSessionId(joinId);
                    setSessionPass(joinPass);
                    setRoomId(result.room_id);
                    setParticipantId(result.participant_id);

                    const roomSettings = await SignalingService.getRoomSettings(result.room_id);
                    if (roomSettings) {
                        setRoomAllowInstantJoin(Boolean(roomSettings.allow_instant_join));
                    }

                    if (result.status === 'active') {
                        startLivePipeline();
                    } else if (result.status === 'waiting') {
                        setMode(AppMode.WAITING_ROOM);
                    } else {
                        showToast("Access Denied");
                    }
                } else {
                    showToast("Failed to join room");
                }
            } else {
                showToast("Please enter ID and Password");
            }
        }}
        className="w-full bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2 border border-purple-500/20"
        aria-label="Establish Connection"
        title="Establish Connection"
      >
        <Activity size={20} className="text-purple-200" />
        <span>ESTABLISH CONNECTION</span>
      </button>
    </GlassPanel>
  );

  const renderWaitingRoom = () => (
    <div className={`min-h-screen flex flex-col items-center justify-center ${theme.bg} relative p-6`}>
        <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute bottom-0 left-[-20%] right-[-20%] h-[60vh] bg-gradient-to-t ${theme.isLight ? 'from-gray-300 via-gray-200/40' : 'from-gray-900 via-gray-900/40'} to-transparent blur-[100px] animate-subtle-wave`}></div>
        </div>
        
        <GlassPanel className={`max-w-md w-full text-center relative z-10 ${theme.panel}`}>
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                <Clock size={40} className="text-cyan-400" />
            </div>
            <h2 className={`text-2xl font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'} mb-2`}>Waiting for Host</h2>
            <p className="text-gray-400 mb-8">The host has let you in the waiting room. Please wait to be admitted.</p>
            
            <div className={`p-4 ${theme.isLight ? 'bg-gray-100 border-gray-300' : 'bg-black/40 border-white/5'} rounded-lg border mb-6`}>
                 <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Meeting ID</p>
                 <p className={`font-mono ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>{sessionId || 'CONNECTING...'}</p>
            </div>

            <button 
                onClick={endCall} 
                className="text-red-500 hover:text-red-400 text-sm font-semibold transition-colors"
            >
                Leave Waiting Room
            </button>
        </GlassPanel>
    </div>
  );

  if (setupView === 'LANDING') {
      return (
        <>
          <LandingView 
              onNewMeeting={() => {
                  vibrate(20);
                  setShowConsentDialog(true);
                  setIsHost(true); // User is creating a meeting
              }}
              onJoinMeeting={() => {
                  vibrate(20);
                  setSetupView('JOIN'); // Show join flow
              }}
              onSchedule={() => {
                  vibrate(20);
                  // TODO: Future feature - calendar integration
                  showToast("Calendar integration coming soon");
                  // setSetupView('HOME'); // Removed fallback to home
              }}
              isLight={theme.isLight} 
          />
          
          {/* Consent Dialog with Language Selection */}
          <ConsentDialog 
            isOpen={showConsentDialog}
            onAccept={() => {
              setConsentState({
                granted: true,
                timestamp: Date.now(),
                region: 'Global'
              });
              setShowConsentDialog(false);
              // Skip HOME view, go straight to HOST setup with languages
              setSetupView('HOST');
              vibrate([10, 20, 10]);
            }}
            onDecline={() => {
              setShowConsentDialog(false);
              setIsHost(false);
              vibrate(50);
            }}
            isLight={theme.isLight}
          />
        </>
      );
  }

  // --- Main Render ---

  if (mode === AppMode.IDLE || mode === AppMode.SETUP) {
    return (
      <div className={`min-h-screen ${theme.bg} ${fontClass} transition-colors duration-500 overflow-x-hidden ambient-wave`}>
        {/* Decorative Background Elements */}
        {!theme.isLight && (
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px] animate-pulse-slow"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/10 rounded-full blur-[120px] animate-pulse-slow delay-1000"></div>
            </div>
        )}
        {/* Brand Header */}
        <div className="absolute top-12 text-center z-10 flex flex-col items-center">
          <div className={`inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full ${theme.isLight ? 'bg-white/80 border-gray-300' : 'bg-white/5 border-white/10'} backdrop-blur-sm border`}>
             <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-pulse"></span>
             <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Neural Net Online</span>
          </div>
          <img src="https://orbitzzz.vercel.app/icons/logo.png" alt="ORBITS" className={`h-24 md:h-32 w-auto object-contain ${theme.isLight ? 'invert opacity-80' : 'drop-shadow-[0_0_25px_rgba(6,182,212,0.2)]'}`} />
        </div>

        {/* Content Switcher */}
        <div className="z-20 w-full flex justify-center items-center mt-12">

          {setupView === 'HOST' && renderHostSetup()}
          {setupView === 'JOIN' && renderJoinSetup()}
          {setupView === 'SETTINGS' && renderSettings()}
          {setupView === 'AUTH' && renderAuth()}
        </div>
      </div>
    );
  }

  if (mode === AppMode.WAITING_ROOM) {
      return renderWaitingRoom();
  }

  // --- ACTIVE CALL VIEW ---
  
  const waitingParticipants = participants.filter((p: Participant) => p.status === 'waiting');
  const activeParticipants = participants.filter((p: Participant) => p.status === 'active');

  return (
    <div className={`h-screen w-full ${theme.bg} ${fontClass} flex flex-col relative overflow-hidden transition-colors duration-300`}>
      
      {/* Background Lighting for Call Mode */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div className={`absolute inset-0 ${theme.isLight ? 'bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200' : 'bg-gradient-to-br from-[#050505] via-[#0a0a0a] to-black'}`}></div>
          <div className={`absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-10 ${theme.isLight ? 'bg-cyan-400' : 'bg-cyan-700'}`}></div>
          <div className={`absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-10 ${theme.isLight ? 'bg-purple-400' : 'bg-purple-700'}`}></div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
          <div className="absolute top-24 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full border border-white/20 shadow-xl z-[70] animate-float-up text-center w-max max-w-[90%]">
              {toastMessage}
          </div>
      )}

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Recording Indicator - Persistent when consent granted and in call */}


      {/* 1. TOP HEADER (Brand + Settings) */}
      <div className={`absolute top-0 left-0 right-0 z-40 h-20 px-6 flex items-center justify-between pointer-events-none transition-colors duration-500 ${theme.isLight ? 'bg-gradient-to-b from-white/90 via-white/50 to-transparent' : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent'}`}>
          {/* Brand - Pointer events auto to allow interaction if needed */}
          <div className="flex items-center gap-3 pointer-events-auto">
               <img src="https://orbitzzz.vercel.app/icons/logo.png" alt="ORBITS" className="h-6 md:h-8 w-auto object-contain opacity-80" />
               <Tooltip text="Click to Copy Link">
                <div className="flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 group cursor-pointer hover:bg-white/10" onClick={copyInvite}>
                    <LinkIcon size={12} className="text-cyan-400" />
                    <span className="text-xs font-mono text-gray-400 group-hover:text-white transition-colors">{getMeetingLink()}</span>
                    <Copy size={12} className="text-gray-500 group-hover:text-white ml-2" />
                </div>
               </Tooltip>
               {isRecording && (
                   <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 animate-pulse">
                       <div className="w-2 h-2 rounded-full bg-red-500"></div>
                       <span className="text-[10px] font-bold text-red-400 tracking-wider">REC</span>
                   </div>
               )}
          </div>
          
          <div className="flex items-center gap-3 pointer-events-auto">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-900/20 border border-purple-500/20">
                  <BrainCircuit size={12} className="text-purple-400 animate-pulse" />
                  <span className="text-[10px] text-purple-300 font-bold tracking-wider">NEURAL LEARNING</span>
              </div>

              {/* Translation Target Badge */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-900/20 border border-cyan-500/20">
                  <span className="text-[10px] text-cyan-400 font-bold tracking-wider uppercase">Listening:</span>
                  <span className="text-xs text-white font-bold">{config.target}</span>
              </div>
              
              {/* Captions Toggle */}
              <Tooltip text={showCaptions ? "Hide Captions" : "Show Captions"}>
                  <button 
                      onClick={() => setShowCaptions(!showCaptions)}
                      className={`p-2 rounded-full hover:bg-white/10 transition-colors ${showCaptions ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}
                      aria-label={showCaptions ? "Hide Captions" : "Show Captions"}
                      title={showCaptions ? "Hide Captions" : "Show Captions"}
                  >
                      <Captions size={20} />
                  </button>
              </Tooltip>

              {/* Real-Time Translator Toggle */}
              <Tooltip text="Real-Time Translator">
                <button 
                    onClick={() => setShowRealtimeTranslator(!showRealtimeTranslator)}
                    className={`p-2 rounded-full hover:bg-white/10 transition-colors ${showRealtimeTranslator ? 'text-purple-400' : 'text-gray-400 hover:text-white'}`}
                    aria-label="Real-Time Translator"
                    title="Real-Time Translator"
                >
                    <Languages size={20} />
                </button>
              </Tooltip>

              {/* Settings Icon In Call */}
              <Tooltip text="Settings">
                <button 
                    onClick={() => setShowFullScreenSettings(true)}
                    className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    aria-label="Settings"
                    title="Settings"
                >
                    <SettingsIcon size={20} />
                </button>
              </Tooltip>

              <Tooltip text="Change Layout">
                <button 
                    onClick={() => setMainLayout((prev) => prev === 'FOCUS' ? 'GRID' : 'FOCUS')}
                    className={`p-2 rounded-full hover:bg-white/10 transition-colors ${mainLayout === 'GRID' ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}
                    aria-label="Change Layout"
                    title={mainLayout === 'GRID' ? "Focus View" : "Grid View"}
                >
                    <LayoutGrid size={20} />
                </button>
              </Tooltip>
          </div>
      </div>

      {/* 2. MAIN STAGE (Video + Sidebar) */}
      <div className="flex-1 flex relative overflow-hidden">
          
          {/* VIDEO GRID */}
          <div className={`flex-1 relative bg-transparent flex items-center justify-center transition-all duration-300 z-0`}>
             
             {/* Main Feed */}
             <div className="relative w-full h-full flex items-center justify-center p-0 md:p-4">
                 {mainLayout === 'GRID' ? (
                     <div className="w-full h-full flex items-center justify-center">
                         <div
                             className="grid gap-3 w-full h-full p-3"
                             style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
                         >
                             {/* Local Tile */}
                             <div
                                 onClick={() => {
                                     setPinnedUser('me');
                                     setMainLayout('FOCUS');
                                 }}
                                 onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                                     if (e.key === 'Enter' || e.key === ' ') {
                                         setPinnedUser('me');
                                         setMainLayout('FOCUS');
                                     }
                                 }}
                                 className={`relative overflow-hidden rounded-2xl cursor-pointer ${theme.isLight ? 'bg-white/60 border-gray-200' : 'bg-gray-900/50 border-white/10'} border`}
                                 role="button"
                                 tabIndex={0}
                             >
                                 <video
                                     ref={(el) => {
                                         if (!el) return;
                                         const localStream = isScreenSharing ? screenStreamRef.current : streamRef.current;
                                         el.srcObject = localStream || null;
                                     }}
                                     autoPlay
                                     muted
                                     playsInline
                                     className={`w-full h-full object-cover ${!isCamOn && !isScreenSharing ? 'hidden' : 'block'}`}
                                 />
                                 {(!isCamOn && !isScreenSharing) && (
                                     <div className="absolute inset-0 flex flex-col items-center justify-center">
                                         <div className={`w-24 h-24 rounded-full ${theme.isLight ? 'bg-white border-gray-200' : 'bg-white/5 border-white/5'} border flex items-center justify-center overflow-hidden`}>
                                             {userAvatar ? (
                                                 <img src={userAvatar} alt="Me" className="w-full h-full object-cover" />
                                             ) : (
                                                 <div className={`text-2xl font-bold ${theme.isLight ? 'text-gray-400' : 'text-gray-500'}`}>YOU</div>
                                             )}
                                         </div>
                                     </div>
                                 )}
                                 <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/50 backdrop-blur-sm text-xs font-medium text-white">
                                     You {isScreenSharing ? '(Screen)' : ''}
                                 </div>
                             </div>

                             {/* Remote Tiles */}
                             {activeParticipants.map((p: Participant) => {
                                 const stream = p.userId ? remoteStreams[p.userId] : null;
                                 return (
                                     <div
                                         key={p.id}
                                         onClick={() => {
                                             setPinnedUser(p.id);
                                             setMainLayout('FOCUS');
                                         }}
                                         onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                                             if (e.key === 'Enter' || e.key === ' ') {
                                                 setPinnedUser(p.id);
                                                 setMainLayout('FOCUS');
                                             }
                                         }}
                                         className={`relative overflow-hidden rounded-2xl cursor-pointer ${theme.isLight ? 'bg-gray-200/60 border-gray-200' : 'bg-gray-900/50 border-white/10'} border`}
                                         role="button"
                                         tabIndex={0}
                                     >
                                         {stream ? (
                                             <video
                                                 ref={(el) => {
                                                     if (!el) return;
                                                     el.srcObject = stream;
                                                 }}
                                                 autoPlay
                                                 muted
                                                 playsInline
                                                 className="w-full h-full object-cover"
                                             />
                                         ) : (
                                             <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                 <div className={`w-24 h-24 rounded-full ${theme.isLight ? 'bg-gray-300 text-gray-500' : 'bg-gray-800 text-gray-600'} flex items-center justify-center text-2xl font-bold`}>
                                                     {p.name.charAt(0)}
                                                 </div>
                                             </div>
                                         )}
                                         <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/50 backdrop-blur-sm text-xs font-medium text-white">
                                             {p.name}
                                         </div>
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                 ) : (
                 pinnedUser === 'me' ? (
                     <div className={`relative w-full h-full overflow-hidden ${theme.isLight ? 'bg-white/50 border-gray-300' : 'bg-gray-900/50 border-white/5'} md:rounded-3xl md:border shadow-2xl backdrop-blur-sm transition-all duration-500`}>
                         <video 
                            ref={videoRef} 
                            autoPlay 
                            muted 
                            playsInline 
                            className={`w-full h-full object-cover ${!isCamOn && !isScreenSharing ? 'hidden' : 'block'}`} 
                         />
                         {(!isCamOn && !isScreenSharing) && (
                            <div className={`absolute inset-0 flex flex-col items-center justify-center`}>
                                <div className={`w-32 h-32 rounded-full ${theme.isLight ? 'bg-white border-gray-200' : 'bg-white/5 border-white/5'} border flex items-center justify-center mb-4 overflow-hidden`}>
                                    {userAvatar ? (
                                        <img src={userAvatar} alt="Me" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className={`text-4xl font-bold ${theme.isLight ? 'text-gray-400' : 'text-gray-500'}`}>YOU</div>
                                    )}
                                </div>
                            </div>
                         )}
                         <div className="absolute bottom-4 left-4 px-3 py-1 rounded bg-black/50 backdrop-blur-sm text-sm font-medium text-white">
                             You {isScreenSharing ? '(Screen)' : ''}
                         </div>
                     </div>
                 ) : (
                     <div className={`w-full h-full ${theme.isLight ? 'bg-gray-200/50 border-gray-300' : 'bg-gray-900/50 border-white/5'} flex flex-col items-center justify-center md:rounded-2xl md:border md:m-4 md:aspect-video md:h-auto backdrop-blur-sm relative overflow-hidden`}>
                        {(() => {
                            const pinnedParticipant = participants.find((p: Participant) => p.id === pinnedUser);
                            const pinnedStream = pinnedParticipant?.userId ? remoteStreams[pinnedParticipant.userId] : null;
                            if (pinnedStream) {
                                return (
                                    <video
                                        ref={remoteVideoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                );
                            }
                            return (
                                <>
                                  <div className={`w-32 h-32 rounded-full ${theme.isLight ? 'bg-gray-300 text-gray-500' : 'bg-gray-800 text-gray-600'} flex items-center justify-center text-4xl font-bold mb-4`}>
                                      {pinnedParticipant?.name?.charAt(0) || '?'}
                                  </div>
                                  <p className="text-gray-500 font-sans tracking-widest">{pinnedParticipant?.name}</p>
                                </>
                            );
                        })()}
                     </div>
                 )
                 )}
                 
                 {/* Reaction Bubbles Overlay */}
                 {activeReactions.map((r: {id: number, emoji: string}) => (
                     <ReactionBubble key={r.id} emoji={r.emoji} onComplete={() => setActiveReactions((prev: {id: number, emoji: string}[]) => prev.filter((p: {id: number, emoji: string}) => p.id !== r.id))} />
                 ))}

                 {/* Settings Modal Overlay in Call */}
                 {showSettingsInCall && (
                     <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                         {renderSettings(true)}
                     </div>
                 )}
             </div>

             {/* Orbit Indicator (Floating) */}
             <div className="absolute bottom-20 right-8 transform scale-75 z-30">
                <OrbitRing 
                    state={pipelineState} 
                    size="sm" 
                    isActive={isAIActive}
                    onToggle={() => {
                        const newState = !isAIActive;
                        setIsAIActive(newState);
                        showToast(newState ? "AI Assistant Activated" : "AI Assistant Muted");
                    }}
                />
             </div>

             {/* Subtitle Overlay */}
             <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-30 px-4">
                 <div className={`transition-all duration-700 transform ${showCaptions && (subtitle.original || subtitle.translation) ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                     <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 text-center max-w-4xl shadow-2xl">
                         {subtitle.original && (
                            <p className="text-gray-400 text-xs md:text-sm font-mono mb-1 tracking-wide flex items-center justify-center gap-2">
                                <Mic size={12} className="text-gray-500" />
                                {subtitle.original}
                            </p>
                         )}
                         {subtitle.translation && (
                            <div className="flex items-center justify-center gap-2">
                                <Sparkles size={16} className="text-cyan-300 animate-pulse" />
                                <p className="text-white text-lg md:text-2xl font-semibold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-blue-200">
                                    {subtitle.translation}
                                </p>
                            </div>
                         )}
                     </div>
                 </div>
             </div>
          </div>

          {/* RIGHT SIDEBAR - Overlays on Mobile, Sits side-by-side on Desktop */}
          {activeSidebar !== 'NONE' && (
              <div className={`absolute inset-0 md:static md:w-80 ${theme.isLight ? 'bg-white border-l border-gray-200' : 'bg-[#0a0a0a] border-l border-white/10'} flex flex-col shadow-2xl z-50 animate-slide-in`}>
                  
                  {/* Sidebar Header */}
                  <div className={`h-16 flex items-center justify-between px-6 border-b ${theme.isLight ? 'border-gray-200 bg-gray-50' : 'border-white/5 bg-black/20'}`}>
                      <h3 className={`font-bold text-lg ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>
                          {activeSidebar === 'PARTICIPANTS' ? `Participants (${participants.length + 1})` : 'Meeting Chat'}
                      </h3>
                      {activeSidebar === 'PARTICIPANTS' && (
                          <div className="flex gap-1 ml-auto mr-2">
                              <button 
                                onClick={() => setParticipantViewMode('LIST')}
                                className={`p-1 rounded ${participantViewMode === 'LIST' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                                aria-label="List View"
                                title="List View"
                              >
                                  <List size={16} />
                              </button>
                              <button 
                                onClick={() => setParticipantViewMode('GRID')}
                                className={`p-1 rounded ${participantViewMode === 'GRID' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                                aria-label="Grid View"
                                title="Grid View"
                              >
                                  <Grid size={16} />
                              </button>
                          </div>
                      )}
                      <button onClick={() => setActiveSidebar('NONE')} className="text-gray-500 hover:text-white p-2" aria-label="Close Sidebar" title="Close Sidebar">
                          <X size={18} />
                      </button>
                  </div>

                  {/* Sidebar Content */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-24 md:pb-4 relative custom-scrollbar" onClick={() => setActiveParticipantMenu(null)}>
                      {activeSidebar === 'PARTICIPANTS' ? (
                          <>
                             {/* WAITING ROOM SECTION */}
                             {waitingParticipants.length > 0 && isHost && (
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <span className="text-xs font-bold text-gray-500 uppercase">Waiting Room ({waitingParticipants.length})</span>
                                        <button onClick={admitAllParticipants} className="text-xs text-cyan-400 hover:text-cyan-300">Admit All</button>
                                    </div>
                                    <div className="space-y-2">
                                        {waitingParticipants.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-200">{p.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => admitParticipant(p.id)} className="text-cyan-400 hover:text-cyan-300 p-1" title="Admit"><Check size={16} /></button>
                                                    <button onClick={() => removeParticipant(p.id)} className="text-red-400 hover:text-red-300 p-1" title="Remove"><X size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="h-px bg-white/10 my-4"></div>
                                </div>
                             )}

                             {/* IN MEETING SECTION */}
                             <div className="mb-2 px-1">
                                 <span className="text-xs font-bold text-gray-500 uppercase">In Meeting ({activeParticipants.length + 1})</span>
                             </div>

                             {/* LIST VIEW RENDERER */}
                             {participantViewMode === 'LIST' && (
                                 <div className="space-y-2">
                                    {/* Me */}
                                    <div className={`flex items-center justify-between p-3 rounded-lg ${theme.isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'} group`}>
                                        <div className="flex items-center gap-3">
                                            {userAvatar ? (
                                                <img src={userAvatar} className="w-8 h-8 rounded-full object-cover border border-cyan-500/30" alt="User Avatar" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-cyan-900/50 flex items-center justify-center text-xs font-bold text-cyan-200 border border-cyan-500/30">YOU</div>
                                            )}
                                            <div className="flex flex-col">
                                                <span className={`text-sm ${theme.isLight ? 'text-gray-900' : 'text-gray-200'} font-medium`}>{displayName || 'You'} (Host)</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!isMicOn && <MicOff size={14} className="text-red-500" />}
                                            {!isCamOn && <VideoOff size={14} className="text-red-500" />}
                                        </div>
                                    </div>
                                    
                                    {/* Others */}
                                    {activeParticipants.map(p => (
                                        <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg ${theme.isLight ? 'hover:bg-gray-100' : 'hover:bg-white/5'} group relative`} onClick={() => togglePin(p.id)}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full ${theme.isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-800 text-gray-400 border border-white/10'} flex items-center justify-center text-xs font-bold`}>
                                                    {p.name.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className={`text-sm ${theme.isLight ? 'text-gray-900' : 'text-gray-200'} font-medium`}>{p.name}</span>
                                                    <span className="text-[10px] text-gray-500">{p.role}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {p.isMuted && <MicOff size={14} className="text-red-500 mr-1" />}
                                                {!p.isCamOn && <VideoOff size={14} className="text-red-500 mr-1" />}
                                                
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveParticipantMenu(activeParticipantMenu === p.id ? null : p.id);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-gray-700/50 text-gray-400 hover:text-white"
                                                    aria-label="Participant Options"
                                                    title="Participant Options"
                                                >
                                                    <MoreVertical size={16} />
                                                </button>

                                                {/* Dropdown Menu */}
                                                {activeParticipantMenu === p.id && (
                                                    <div className={`absolute right-10 top-8 w-40 ${theme.isLight ? 'bg-white border-gray-200' : 'bg-[#151515] border-white/10'} border rounded-lg shadow-2xl z-50 overflow-hidden`}>
                                                        <button onClick={(e) => { e.stopPropagation(); toggleParticipantMute(p.id); }} className={`w-full text-left px-4 py-2 text-xs ${theme.isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/10'}`}>
                                                            {p.isMuted ? 'Ask to Unmute' : 'Mute'}
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); toggleParticipantVideo(p.id); }} className={`w-full text-left px-4 py-2 text-xs ${theme.isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/10'}`}>
                                                            {p.isCamOn ? 'Stop Video' : 'Ask to Start Video'}
                                                        </button>
                                                        {isHost && (
                                                            <>
                                                                <div className="h-px bg-white/10 my-1"></div>
                                                                <button onClick={(e) => { e.stopPropagation(); makeHost(p.id); }} className={`w-full text-left px-4 py-2 text-xs ${theme.isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/10'} flex items-center gap-2`}>
                                                                    <BadgeCheck size={12} /> Make Host
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); removeParticipant(p.id); }} className={`w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2`}>
                                                                    <Trash2 size={12} /> Remove
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                 </div>
                             )}

                             {/* GRID VIEW RENDERER */}
                             {participantViewMode === 'GRID' && (
                                 <div className="grid grid-cols-2 gap-2">
                                     <div className={`aspect-square rounded-xl ${theme.isLight ? 'bg-gray-200' : 'bg-gray-800'} flex flex-col items-center justify-center relative overflow-hidden group`}>
                                         {isCamOn ? (
                                             <div className="w-full h-full bg-black flex items-center justify-center">
                                                 <span className="text-xs text-gray-500">Video Feed</span>
                                             </div>
                                         ) : (
                                              userAvatar ? <img src={userAvatar} className="w-12 h-12 rounded-full object-cover" alt="User Avatar" /> :
                                             <div className="w-12 h-12 rounded-full bg-cyan-900/50 flex items-center justify-center text-sm font-bold text-cyan-200">YOU</div>
                                         )}
                                         <div className="absolute bottom-2 left-2 text-xs font-bold text-white drop-shadow-md">You</div>
                                         {!isMicOn && <div className="absolute top-2 right-2 bg-red-500/80 p-1 rounded-full"><MicOff size={10} className="text-white"/></div>}
                                     </div>
                                     {activeParticipants.map(p => (
                                         <div key={p.id} className={`aspect-square rounded-xl ${theme.isLight ? 'bg-gray-200' : 'bg-gray-800'} flex flex-col items-center justify-center relative overflow-hidden group`} onClick={() => togglePin(p.id)}>
                                             <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold text-gray-300">
                                                 {p.name.charAt(0)}
                                             </div>
                                             <div className="absolute bottom-2 left-2 text-xs font-bold text-white drop-shadow-md">{p.name}</div>
                                             {p.isMuted && <div className="absolute top-2 right-2 bg-red-500/80 p-1 rounded-full"><MicOff size={10} className="text-white"/></div>}
                                             
                                             {/* Mini Menu Trigger */}
                                              <button 
                                                 onClick={(e) => { e.stopPropagation(); setActiveParticipantMenu(activeParticipantMenu === p.id ? null : p.id); }}
                                                 className="absolute top-2 right-8 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-black/50 rounded-full"
                                                 aria-label="Participant Options"
                                                 title="Participant Options"
                                              >
                                                  <MoreHorizontal size={12} className="text-white" />
                                              </button>
                                         </div>
                                     ))}
                                 </div>
                             )}

                          </>
                      ) : (
                          <>
                             {/* Chat Messages */}
                             <div className="flex flex-col gap-4 min-h-0">
                                 {chatMessages.map((msg) => (
                                     <div key={msg.id} className={`flex flex-col ${msg.senderId === 'me' ? 'items-end' : 'items-start'}`}>
                                         <div className="flex items-baseline gap-2 mb-1">
                                             <span className="text-xs font-bold text-gray-400">{msg.senderName}</span>
                                             <span className="text-[10px] text-gray-600">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                         </div>
                                         <div className={`px-3 py-2 rounded-lg max-w-[90%] text-sm ${
                                             msg.isSystem ? 'bg-blue-900/20 text-blue-300 border border-blue-500/20 w-full text-center' :
                                             msg.senderId === 'me' ? 'bg-cyan-900/30 text-cyan-100 border border-cyan-500/30 rounded-tr-none' : 
                                             (theme.isLight ? 'bg-gray-200 text-gray-900' : 'bg-[#1a1a1a] text-gray-300 border border-white/10') + ' rounded-tl-none'
                                         }`}>
                                             {msg.text}
                                         </div>
                                     </div>
                                 ))}
                                 <div ref={chatEndRef} />
                             </div>
                          </>
                      )}
                  </div>

                  {/* Sidebar Footer (Chat Input) */}
                  {activeSidebar === 'CHAT' && (
                      <div className={`p-4 border-t ${theme.isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/40'}`}>
                          <div className="relative">
                              <input 
                                  type="text" 
                                  value={newMessage}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
                                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && sendChatMessage()}
                                  className={`w-full ${theme.input} rounded-lg pl-3 pr-10 py-3 text-sm focus:border-cyan-500/50 focus:outline-none`}
                                  placeholder="Type message..."
                              />
                              <button 
                                                  onClick={sendChatMessage}
                                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cyan-500 hover:text-cyan-400 p-1"
                                                  aria-label="Send Message"
                                                  title="Send Message"
                                              >
                                                  <Send size={16} />
                                              </button>
                          </div>
                      </div>
                  )}
                  {activeSidebar === 'PARTICIPANTS' && isHost && (
                      <div className={`p-4 border-t ${theme.isLight ? 'border-gray-200 bg-white' : 'border-white/10 bg-black/40'} flex justify-between gap-2`}>
                          <button className={`flex-1 py-2 ${theme.isLight ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'} rounded text-xs font-medium transition-colors`}>Mute All</button>
                          <button onClick={copyInvite} className={`flex-1 py-2 ${theme.isLight ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'} rounded text-xs font-medium transition-colors`}>Invite</button>
                      </div>
                  )}
              </div>
          )}
      </div>

      {/* 3. ZOOM-STYLE BOTTOM CONTROL DOCK */}
      <div className={`h-20 ${theme.isLight ? 'bg-white/90 border-gray-200' : 'bg-[#0a0a0a]/90 border-white/10'} backdrop-blur-md border-t flex items-center justify-between px-2 md:px-8 z-50`}>
          
          {/* LEFT: AV Controls */}
          <div className="flex items-center gap-1 md:gap-4 flex-shrink-0">
              {/* Audio */}
              <Tooltip text={isMicOn ? "Mute Microphone" : "Unmute Microphone"}>
                  <div className="flex flex-col items-center gap-1 group">
                      <div className={`flex items-center rounded-lg ${theme.isLight ? 'bg-gray-100 border-gray-200' : 'bg-[#151515] border-white/5'} overflow-hidden border group-hover:border-opacity-50 transition-colors`}>
                          <button 
                              onClick={() => setIsMicOn(!isMicOn)}
                              className={`p-2.5 ${isMicOn ? (theme.isLight ? 'text-gray-900 hover:bg-gray-200' : 'text-white hover:bg-white/10') : 'text-red-500 hover:bg-red-500/10'}`}
                          >
                              {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                          </button>
                          <button className={`p-1 border-l ${theme.isLight ? 'border-gray-200 hover:bg-gray-200 text-gray-500' : 'border-white/5 hover:bg-white/10 text-gray-500'} hidden md:block`} aria-label="Microphone Options" title="Microphone Options">
                              <ChevronUp size={12} />
                          </button>
                      </div>
                      <span className="text-[10px] font-medium text-gray-400 group-hover:text-gray-300 hidden md:block">
                          {isMicOn ? 'Mute' : 'Unmute'}
                      </span>
                  </div>
              </Tooltip>

              {/* Video */}
              <Tooltip text={isCamOn ? "Stop Camera" : "Start Camera"}>
                  <div className="flex flex-col items-center gap-1 group">
                      <div className={`flex items-center rounded-lg ${theme.isLight ? 'bg-gray-100 border-gray-200' : 'bg-[#151515] border-white/5'} overflow-hidden border group-hover:border-opacity-50 transition-colors`}>
                          <button 
                              onClick={() => setIsCamOn(!isCamOn)}
                              className={`p-2.5 ${isCamOn ? (theme.isLight ? 'text-gray-900 hover:bg-gray-200' : 'text-white hover:bg-white/10') : 'text-red-500 hover:bg-red-500/10'}`}
                              aria-label={isCamOn ? "Stop Camera" : "Start Camera"}
                              title={isCamOn ? "Stop Camera" : "Start Camera"}
                          >
                              {isCamOn ? <VideoIcon size={20} /> : <VideoOff size={20} />}
                          </button>
                          <button className={`p-1 border-l ${theme.isLight ? 'border-gray-200 hover:bg-gray-200 text-gray-500' : 'border-white/5 hover:bg-white/10 text-gray-500'} hidden md:block`} aria-label="Camera Options" title="Camera Options">
                              <ChevronUp size={12} />
                          </button>
                  </div>
                  <span className="text-[10px] font-medium text-gray-400 group-hover:text-gray-300 hidden md:block">
                      {isCamOn ? 'Stop Video' : 'Start Video'}
                  </span>
                  </div>
              </Tooltip>
          </div>

          {/* CENTER: Meeting Controls */}
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0 mx-2">
              
              {/* Security */}
              <Tooltip text="Security Options">
                  <div className="relative">
                      <button 
                          onClick={() => setShowSecurityMenu(!showSecurityMenu)}
                          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${showSecurityMenu ? 'text-green-400 bg-white/5' : 'text-gray-400'}`}
                          aria-label="Security Options"
                          title="Security Options"
                      >
                          <Shield size={20} />
                          <span className="text-[10px] font-medium hidden md:block">Security</span>
                      </button>
                      {showSecurityMenu && (
                          <div className={`absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-56 ${theme.isLight ? 'bg-white border-gray-200' : 'bg-[#151515] border-white/10'} border rounded-xl shadow-2xl py-1 z-[60]`}>
                              <button 
                                  onClick={() => setIsMeetingLocked(!isMeetingLocked)}
                                  className={`w-full text-left px-4 py-3 text-sm ${theme.isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/5'} flex items-center justify-between`}
                              >
                                  <span>Lock Meeting</span>
                                  {isMeetingLocked && <Lock size={14} className="text-green-400" />}
                              </button>
                              <div className={`h-px ${theme.isLight ? 'bg-gray-200' : 'bg-white/5'} my-1`}></div>
                              <button 
                                  onClick={() => {
                                      const currentVal = roomId ? roomAllowInstantJoin : settings.allowInstantJoin;
                                      const newVal = !currentVal;
                                      if (roomId && isHost) {
                                          setRoomAllowInstantJoin(newVal);
                                          SignalingService.updateRoomSettings(roomId, { allow_instant_join: newVal });
                                      } else {
                                          setSettings(s => ({...s, allowInstantJoin: newVal}));
                                      }
                                  }}
                                  className={`w-full text-left px-4 py-3 text-sm ${theme.isLight ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-white/5'} flex items-center justify-between ${roomId && !isHost ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  disabled={Boolean(roomId) && !isHost}
                              >
                                  <span>Enable Instant Join</span>
                                  {(roomId ? roomAllowInstantJoin : settings.allowInstantJoin) && <Check size={14} className="text-green-400" />}
                              </button>
                          </div>
                      )}
                  </div>
              </Tooltip>

              {/* Participants */}
              <Tooltip text="Manage Participants">
                  <button 
                      onClick={() => setActiveSidebar(activeSidebar === 'PARTICIPANTS' ? 'NONE' : 'PARTICIPANTS')}
                      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${activeSidebar === 'PARTICIPANTS' ? 'text-cyan-400 bg-white/5' : 'text-gray-400'}`}
                      aria-label="Manage Participants"
                      title="Manage Participants"
                  >
                      <div className="relative">
                          <Users size={20} />
                          {waitingParticipants.length > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] px-1.5 rounded-full animate-bounce">{waitingParticipants.length}</span>}
                      </div>
                      <span className="text-[10px] font-medium hidden md:block">Participants</span>
                  </button>
              </Tooltip>

              {/* Chat */}
              <Tooltip text="Open Chat">
                  <button 
                      onClick={() => setActiveSidebar(activeSidebar === 'CHAT' ? 'NONE' : 'CHAT')}
                      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${activeSidebar === 'CHAT' ? 'text-cyan-400 bg-white/5' : 'text-gray-400'}`}
                      aria-label="Open Chat"
                      title="Open Chat"
                  >
                       <div className="relative">
                          <MessageSquare size={20} />
                          {chatMessages.length > 1 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
                       </div>
                      <span className="text-[10px] font-medium hidden md:block">Chat</span>
                  </button>
              </Tooltip>

              {/* Screen Share */}
              <Tooltip text={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
                  <button 
                      onClick={toggleScreenShare}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${isScreenSharing ? 'text-green-500' : 'text-gray-400'}`}
                      aria-label={isScreenSharing ? "Stop Sharing" : "Share Screen"}
                      title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
                  >
                      <div className={`p-1 rounded ${isScreenSharing ? 'bg-green-500/20' : ''}`}>
                          <MonitorUp size={20} />
                      </div>
                      <span className="text-[10px] font-medium hidden md:block">Share Screen</span>
                  </button>
              </Tooltip>

              {/* Record */}
              <Tooltip text={isRecording ? "Stop Recording" : "Start Recording"}>
                  <button 
                      onClick={() => setIsRecording(!isRecording)}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${isRecording ? 'text-red-400' : 'text-gray-400'}`}
                      aria-label={isRecording ? "Stop Recording" : "Start Recording"}
                      title={isRecording ? "Stop Recording" : "Start Recording"}
                  >
                      <div className="relative">
                          <Disc size={20} />
                          {isRecording && <span className="absolute inset-0 rounded-full animate-ping bg-red-500/30"></span>}
                      </div>
                      <span className="text-[10px] font-medium hidden md:block">{isRecording ? 'Stop Rec' : 'Record'}</span>
                  </button>
              </Tooltip>

              {/* Reactions */}
              <Tooltip text="Send Reaction">
                  <div className="relative">
                      <button 
                          onClick={() => setShowReactions(!showReactions)}
                          className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${showReactions ? 'text-yellow-400 bg-white/5' : 'text-gray-400'}`}
                          aria-label="Reactions"
                          title="Reactions"
                      >
                          <Smile size={20} />
                          <span className="text-[10px] font-medium hidden md:block">Reactions</span>
                      </button>
                      {showReactions && (
                          <div className={`absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 flex gap-2 p-2 ${theme.isLight ? 'bg-white border-gray-200' : 'bg-[#151515] border-white/10'} border rounded-full shadow-2xl z-[60]`}>
                              {['👏', '👍', '❤️', '😂', '😮', '🎉'].map(emoji => (
                                  <button 
                                      key={emoji}
                                      onClick={() => triggerReaction(emoji)}
                                      className="text-xl hover:scale-125 transition-transform p-1"
                                  >
                                      {emoji}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
              </Tooltip>

              {/* AI Monitor (Orbits Exclusive) */}
              <div className={`w-px h-8 ${theme.isLight ? 'bg-gray-300' : 'bg-white/10'} mx-2 hidden md:block`}></div>
              
              <Tooltip text={monitorAI ? "Mute AI Loopback" : "Hear AI Translation"}>
                  <button 
                    onClick={() => setMonitorAI(!monitorAI)}
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors ${monitorAI ? 'text-purple-400' : 'text-gray-500'}`}
                    aria-label={monitorAI ? "Mute AI Loopback" : "Hear AI Translation"}
                    title={monitorAI ? "Mute AI Loopback" : "Hear AI Translation"}
                  >
                     {monitorAI ? <Volume2 size={20} /> : <VolumeX size={20} />}
                     <span className="text-[10px] font-medium hidden md:block">AI Audio</span>
                  </button>
              </Tooltip>
          </div>

          {/* RIGHT: End Call */}
          <div className="flex items-center flex-shrink-0">
              <button 
                onClick={() => setShowEndCallModal(true)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-lg shadow-red-900/20"
              >
                End
              </button>
          </div>

      </div>
      
      {/* Floating animations style */}
      <style>{`
          @keyframes float-up {
              0% { transform: translateY(0) scale(0.5); opacity: 0; }
              10% { opacity: 1; transform: translateY(-20px) scale(1.2); }
              100% { transform: translateY(-200px) scale(1); opacity: 0; }
          }
          .animate-float-up {
              animation: float-up 2s ease-out forwards;
          }
          @keyframes float-up-sm {
              0% { transform: translateY(4px); opacity: 0; }
              100% { transform: translateY(0); opacity: 1; }
          }
          .animate-float-up-sm {
              animation: float-up-sm 0.2s ease-out forwards;
          }
          @keyframes slide-in {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
          }
          .animate-slide-in {
              animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .custom-scrollbar::-webkit-scrollbar {
              width: 4px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: rgba(255,255,255,0.2);
              border-radius: 4px;
          }
      `}</style>

      {/* End Call Confirmation Modal */}
      {showEndCallModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${theme.isLight ? 'bg-white' : 'bg-[#1a1a1a]'} rounded-2xl p-6 max-w-sm w-full shadow-2xl border ${theme.isLight ? 'border-gray-200' : 'border-white/10'}`}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <PhoneOff size={32} className="text-red-500" />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>End Meeting?</h3>
              <p className="text-gray-500 text-sm">Are you sure you want to leave this meeting?</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndCallModal(false)}
                className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${theme.isLight ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndCallModal(false);
                  endCall();
                }}
                className="flex-1 py-3 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                End Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen Share Menu */}
      {showShareMenu && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`${theme.isLight ? 'bg-white' : 'bg-[#1a1a1a]'} rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl border-t sm:border ${theme.isLight ? 'border-gray-200' : 'border-white/10'}`}>
            <div className="flex justify-between items-center mb-5">
              <h3 className={`text-lg font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Share Your Screen</h3>
                <button onClick={() => setShowShareMenu(false)} className="text-gray-500 hover:text-white p-1" aria-label="Close Share Menu" title="Close Share Menu">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-3">
              <button 
                onClick={() => startScreenShare('screen')}
                className={`w-full p-4 rounded-xl flex items-center gap-4 transition-all active:scale-95 ${theme.isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/5 hover:bg-white/10'}`}
                aria-label="Share Entire Screen"
                title="Share Entire Screen"
              >
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Monitor size={24} className="text-purple-500" />
                </div>
                <div className="text-left">
                  <p className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Entire Screen</p>
                  <p className="text-xs text-gray-500">Share everything on your screen</p>
                </div>
              </button>
              
              <button 
                onClick={() => startScreenShare('window')}
                className={`w-full p-4 rounded-xl flex items-center gap-4 transition-all active:scale-95 ${theme.isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/5 hover:bg-white/10'}`}
                aria-label="Share Window"
                title="Share Window"
              >
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Layout size={24} className="text-blue-500" />
                </div>
                <div className="text-left">
                  <p className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Window</p>
                  <p className="text-xs text-gray-500">Share a specific application window</p>
                </div>
              </button>
              
              <button 
                onClick={() => startScreenShare('tab')}
                className={`w-full p-4 rounded-xl flex items-center gap-4 transition-all active:scale-95 ${theme.isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/5 hover:bg-white/10'}`}
                aria-label="Share Browser Tab"
                title="Share Browser Tab"
              >
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <PlayCircle size={24} className="text-green-500" />
                </div>
                <div className="text-left">
                  <p className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Browser Tab</p>
                  <p className="text-xs text-gray-500">Share tab with audio (for videos)</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Settings */}
      {showFullScreenSettings && (
        <div className="fixed inset-0 bg-black z-50 overflow-y-auto">
          <div className="min-h-screen">
            {/* Header */}
            <div className={`sticky top-0 h-16 flex items-center justify-between px-4 sm:px-6 ${theme.isLight ? 'bg-white border-b border-gray-200' : 'bg-[#0a0a0a] border-b border-white/10'} z-10`}>
              <h2 className={`text-lg font-bold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Settings</h2>
              <button 
                onClick={() => setShowFullScreenSettings(false)}
                className={`p-2 rounded-lg ${theme.isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
                aria-label="Close Settings"
                title="Close Settings"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Content */}
            <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
              
              {/* Audio Input */}
              <div className={`p-4 sm:p-5 rounded-2xl ${theme.isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Mic size={20} className="text-purple-500" />
                  <h3 className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Microphone</h3>
                </div>
                <select 
                  className={`w-full p-2 mb-4 rounded-lg outline-none ${theme.isLight ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'}`}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAudioInput(e.target.value)}
                  value={selectedAudioInput}
                >
                  {audioInputDevices.map((device: MediaDeviceInfo) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId.slice(0,4)}`}</option>
                  ))}
                </select>
              </div>
              
              {/* Audio Output */}
              <div className={`p-4 sm:p-5 rounded-2xl ${theme.isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Volume2 size={20} className="text-blue-500" />
                  <h3 className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Speaker</h3>
                </div>
                <select 
                  value={selectedAudioOutput}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAudioOutput(e.target.value)}
                  className={`w-full p-3 rounded-xl outline-none text-sm ${theme.isLight ? 'bg-white border border-gray-300' : 'bg-black/40 border border-white/10 text-white'}`}
                >
                  {audioOutputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${device.deviceId.slice(0,4)}`}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Camera */}
              <div className={`p-4 sm:p-5 rounded-2xl ${theme.isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Camera size={20} className="text-green-500" />
                  <h3 className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Camera</h3>
                </div>
                <select 
                  value={selectedVideoInput}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedVideoInput(e.target.value)}
                  className={`w-full p-3 rounded-xl outline-none text-sm ${theme.isLight ? 'bg-white border border-gray-300' : 'bg-black/40 border border-white/10 text-white'}`}
                >
                  {videoInputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.slice(0,4)}`}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Language Settings */}
              <div className={`p-4 sm:p-5 rounded-2xl ${theme.isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <Languages size={20} className="text-amber-500" />
                  <h3 className={`font-semibold ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Translation</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Your Language</label>
                    <LanguageSelector value={config.source} onChange={(val: Language) => setConfig((p: LanguageConfig) => ({...p, source: val}))} compact />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Target Language</label>
                    <LanguageSelector value={config.target} onChange={(val: Language) => setConfig((p: LanguageConfig) => ({...p, target: val}))} compact />
                  </div>
                </div>
              </div>
              
              {/* Display Preferences */}
              <div className={`p-4 sm:p-5 rounded-2xl ${theme.isLight ? 'bg-gray-100' : 'bg-white/5'}`}>
                <h3 className={`font-semibold mb-4 ${theme.isLight ? 'text-gray-900' : 'text-white'}`}>Display</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Show Captions</span>
                    <input type="checkbox" checked={showCaptions} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowCaptions(e.target.checked)} className="w-5 h-5 rounded" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Dark Mode</span>
                    <input type="checkbox" checked={settings.theme === AppTheme.DARK} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings((p: AppSettings) => ({...p, theme: e.target.checked ? AppTheme.DARK : AppTheme.LIGHT}))} className="w-5 h-5 rounded" />
                  </label>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* Realtime Translator Modal */}
      <RealtimeTranslator
        isOpen={showRealtimeTranslator}
        onClose={() => setShowRealtimeTranslator(false)}
        isLight={theme.isLight}
        geminiClient={aiRef.current}
        availableLanguages={Object.values(Language).filter(l => typeof l === 'string') as Language[]}
        onError={(err) => showToast(err)}
        userName={displayName || 'User'}
      />
    </div>
  );
};

export default App;
