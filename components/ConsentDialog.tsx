import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

interface ConsentDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isLight?: boolean;
}

const ConsentDialog: React.FC<ConsentDialogProps> = ({ 
  isOpen, 
  onAccept, 
  onDecline,
  isLight = false 
}) => {
  if (!isOpen) return null;

  const bgClass = isLight ? 'bg-white/95' : 'bg-[#0A0A0A]/95';
  const panelClass = isLight 
    ? 'bg-white border-gray-200 text-gray-900' 
    : 'bg-[#0F0F0F] border-white/10 text-white';
  const textMuted = isLight ? 'text-gray-600' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <div className={`absolute inset-0 ${bgClass}`} onClick={onDecline} />
      
      <div className={`relative max-w-md w-full ${panelClass} rounded-t-3xl sm:rounded-2xl border border-t sm:border p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto`}>
        {/* Icon */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-purple-500/10 rounded-full flex items-center justify-center">
            <AlertCircle size={24} className="text-purple-500 sm:w-8 sm:h-8" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-bold text-center mb-3 sm:mb-4">
          Privacy & Recording Consent
        </h2>

        {/* Content */}
        <div className={`space-y-3 sm:space-y-4 mb-5 sm:mb-6 ${textMuted} text-xs sm:text-sm`}>
          <p>
            This meeting will use AI-powered transcription and translation services. By joining, you consent to:
          </p>

          <ul className="space-y-2">
            <li className="flex items-start gap-2 sm:gap-3">
              <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0 sm:w-[18px] sm:h-[18px]" />
              <span>Real-time audio processing and transcription</span>
            </li>
            <li className="flex items-start gap-2 sm:gap-3">
              <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0 sm:w-[18px] sm:h-[18px]" />
              <span>AI translation of your speech to other participants' languages</span>
            </li>
            <li className="flex items-start gap-2 sm:gap-3">
              <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0 sm:w-[18px] sm:h-[18px]" />
              <span>Temporary storage of transcripts for session duration</span>
            </li>
          </ul>

          <div className={`p-3 sm:p-4 rounded-xl ${isLight ? 'bg-amber-50 border border-amber-200' : 'bg-amber-900/10 border border-amber-500/20'} mt-3 sm:mt-4`}>
            <p className={`text-[11px] sm:text-xs ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
              <strong>Important:</strong> A "Recording" indicator will be visible throughout the meeting. 
              Do not share sensitive personal information.
            </p>
          </div>

          <p className="text-[11px] sm:text-xs">
            By clicking "Accept", you confirm that you have permission to record and translate 
            conversations with all participants.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onDecline}
            className={`flex-1 px-4 sm:px-6 py-3 sm:py-3 rounded-xl font-semibold border transition-all active:scale-95 ${
              isLight 
                ? 'border-gray-300 hover:bg-gray-50 text-gray-700' 
                : 'border-white/10 hover:bg-white/5 text-white'
            }`}
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 px-4 sm:px-6 py-3 sm:py-3 rounded-xl font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition-all shadow-lg shadow-purple-600/20 active:scale-95"
          >
            Accept & Continue
          </button>
        </div>

        {/* Region Notice */}
        <p className={`text-center text-[10px] sm:text-xs mt-3 sm:mt-4 ${textMuted}`}>
          Service region: Global • Data retention: Session only
        </p>
      </div>
    </div>
  );
};

export default ConsentDialog;
