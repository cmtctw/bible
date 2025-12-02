import React, { useState, useEffect, useCallback } from 'react';
import { Mic, X, Square, AlertCircle } from 'lucide-react';
import { liveService } from '../services/liveService';
import { LiveStatus } from '../types';
import Visualizer from './Visualizer';

const VoiceAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<LiveStatus>('disconnected');
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    liveService.onStatusChange = (newStatus) => setStatus(newStatus);
    liveService.onAudioLevel = (level) => setAudioLevel(level);

    return () => {
      // Cleanup handled in service mostly, but we could add disconnect on unmount if desired
    };
  }, []);

  const toggleSession = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') {
      await liveService.disconnect();
    } else {
      await liveService.connect();
    }
  }, [status]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-bible-gold text-white rounded-full shadow-lg hover:bg-yellow-700 transition-all hover:scale-105 z-50 flex items-center gap-2"
        aria-label="Open Voice Assistant"
      >
        <Mic className="w-6 h-6" />
        <span className="font-sans font-medium hidden md:inline">聖經助手</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-bible-accent overflow-hidden z-50 flex flex-col animate-fade-in-up">
      {/* Header */}
      <div className="p-4 bg-bible-paper border-b border-bible-accent flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <h3 className="font-serif font-bold text-bible-text text-lg">AI 聖經助手</h3>
        </div>
        <button 
            onClick={() => {
                liveService.disconnect();
                setIsOpen(false);
            }}
            className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col items-center justify-center min-h-[200px] bg-gradient-to-b from-bible-paper to-white">
        
        {status === 'error' && (
             <div className="text-bible-red mb-4 flex items-center gap-2 text-sm bg-red-50 p-2 rounded">
                <AlertCircle size={16} /> Connection failed
            </div>
        )}

        {status === 'disconnected' && (
          <p className="text-gray-500 text-center mb-6 font-sans text-sm">
            點擊下方按鈕開始對話。<br/>您可以詢問經文含義、背景或尋求禱告。
          </p>
        )}

        {status === 'connecting' && (
             <p className="text-bible-gold animate-pulse mb-6 font-sans text-sm">正在連接...</p>
        )}

        <div className="h-20 w-full flex items-center justify-center mb-6">
            <Visualizer isActive={status === 'connected'} level={audioLevel} />
        </div>

        <button
          onClick={toggleSession}
          disabled={status === 'connecting'}
          className={`
            w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-md
            ${status === 'connected' 
              ? 'bg-bible-red hover:bg-red-700 text-white' 
              : 'bg-bible-gold hover:bg-yellow-700 text-white'}
            ${status === 'connecting' ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {status === 'connected' ? (
            <Square className="w-6 h-6 fill-current" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </button>
        
        <p className="mt-4 text-xs text-gray-400 font-sans">Gemini 2.5 Live API</p>
      </div>
    </div>
  );
};

export default VoiceAssistant;
