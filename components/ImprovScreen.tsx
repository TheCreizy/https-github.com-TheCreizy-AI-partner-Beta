import React, { useState, useEffect, useRef } from 'react';
import { Scene } from '../types';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useGeminiImprovSession } from '../hooks/useGeminiImprovSession';
import CharacterPortrait from './CharacterPortrait';

interface ImprovScreenProps {
  scenes: Scene[];
  prePrompt: string;
  onEnd: () => void;
}

const availableVoices = [
    { name: 'Zephyr', gender: 'Female' },
    { name: 'Kore', gender: 'Female' },
    { name: 'Puck', gender: 'Male' },
    { name: 'Charon', gender: 'Male' },
    { name: 'Fenrir', gender: 'Male' },
];

const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
    // FIX: Replaced JSX.Element with React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
    const statusInfo: { [key: string]: { text: string; color: string; icon: React.ReactElement} } = {
        idle: { text: "Listo para Empezar", color: "text-slate-400", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" /></svg> },
        connecting: { text: "Conectando...", color: "text-yellow-400", icon: <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> },
        listening: { text: "Escuchando...", color: "text-green-400", icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" /><path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.75 6.75 0 1 1-13.5 0v-1.5A.75.75 0 0 1 6 10.5Z" /></svg> },
        speaking: { text: "La IA está Hablando...", color: "text-cyan-400", icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M5.478 5.558A1.5 1.5 0 0 1 6.75 4.5h10.5a1.5 1.5 0 0 1 1.272 1.058l3 6a1.5 1.5 0 0 1 0 1.884l-3 6A1.5 1.5 0 0 1 17.25 21H6.75a1.5 1.5 0 0 1-1.272-1.058l-3-6a1.5 1.5 0 0 1 0-1.884l3-6ZM9 12.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg> },
        summarizing: { text: "Resumiendo escena...", color: "text-purple-400", icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 animate-pulse"><path fillRule="evenodd" d="M2.25 4.5A.75.75 0 0 1 3 3.75h14.25a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75ZM2.25 9A.75.75 0 0 1 3 8.25h9.75a.75.75 0 0 1 0 1.5H3A.75.75 0 0 1 2.25 9Zm0 4.5A.75.75 0 0 1 3 12.75h9.75a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75ZM2.25 18A.75.75 0 0 1 3 17.25h14.25a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" /></svg>},
        error: { text: "Error", color: "text-red-400", icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg> },
    };
    const { text, color, icon } = statusInfo[status] || statusInfo.idle;
    return (
        <div className={`flex items-center justify-center space-x-2 ${color} transition-colors`}>
            {icon}
            <span className="font-medium">{text}</span>
        </div>
    );
};

const baseSelectClasses = "custom-select w-full bg-slate-700/50 border border-slate-600 rounded-md px-3 py-2 text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50 transition";
const baseButtonClasses = "font-bold py-3 px-4 rounded-lg transition-all transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed";

const ImprovScreen: React.FC<ImprovScreenProps> = ({ scenes, prePrompt, onEnd }) => {
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('default');
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const [userTextInput, setUserTextInput] = useState('');
  
  const audioOutputSinkRef = useRef<HTMLAudioElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  const {
    status,
    error,
    transcripts,
    currentActorTranscript,
    currentAiTranscript,
    storyContinuitySummary,
    currentSceneIndex,
    actorName,
    aiName,
    isMuted,
    startSession,
    stopSession,
    handleNextScene,
    sendTextMessage,
    toggleMute,
  } = useGeminiImprovSession(state => state);

  const currentScene = scenes[currentSceneIndex];
  const useUserVoice = currentScene.useUserVoice;
  const useAiVoice = currentScene.useAiVoice;

  const { audioInputDevices, audioOutputDevices, deviceError } = useMediaDevices(useUserVoice, useAiVoice);

  useEffect(() => {
    const audioEl = audioOutputSinkRef.current;
    if (audioEl && typeof audioEl.setSinkId === 'function' && selectedSpeakerId) {
        audioEl.setSinkId(selectedSpeakerId)
            .catch(e => console.error("Failed to set sinkId", e));
    }
  }, [selectedSpeakerId]);
  
  useEffect(() => {
    return () => {
        stopSession();
    }
  }, [stopSession]);
  
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTo({
        top: transcriptContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [transcripts, currentActorTranscript, currentAiTranscript]);

  const handleStartStop = () => {
    if (status === 'idle' || status === 'error') {
        startSession({
            scenes,
            prePrompt,
            selectedMicId,
            selectedVoice,
            audioOutputSinkRef,
        });
    } else {
        stopSession();
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = userTextInput.trim();
    if (!textToSend) return;
    sendTextMessage(textToSend);
    setUserTextInput('');
  };

  const isLastScene = currentSceneIndex === scenes.length - 1;
  const sessionActive = status !== 'idle' && status !== 'error' && status !== 'summarizing';
  const finalError = error || deviceError;
  
  const getStartButtonText = () => {
      if (status === 'error' && transcripts.length > 0) {
          return 'Reconectar';
      }
      return 'Iniciar Escena';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[75vh]">
        <div className="lg:col-span-2 flex flex-col h-full">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 flex-shrink-0">
                {useUserVoice && (
                    <div className="flex-1">
                        <label htmlFor="mic-select" className="block text-sm font-medium text-slate-400 mb-1">Micrófono</label>
                        <select id="mic-select" value={selectedMicId} onChange={e => setSelectedMicId(e.target.value)} disabled={sessionActive} className={baseSelectClasses}>
                            {audioInputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                        </select>
                    </div>
                )}
                {useAiVoice && (
                    <>
                    <div className="flex-1">
                        <label htmlFor="speaker-select" className="block text-sm font-medium text-slate-400 mb-1">Altavoces</label>
                        <select id="speaker-select" value={selectedSpeakerId} onChange={e => setSelectedSpeakerId(e.target.value)} disabled={sessionActive} className={baseSelectClasses}>
                            {audioOutputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                        </select>
                    </div>
                     <div className="flex-1">
                        <label htmlFor="voice-select" className="block text-sm font-medium text-slate-400 mb-1">Voz de IA</label>
                        <select id="voice-select" value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} disabled={sessionActive} className={baseSelectClasses}>
                            {availableVoices.map(v => <option key={v.name} value={v.name}>{`${v.name} (${v.gender})`}</option>)}
                        </select>
                    </div>
                    </>
                )}
            </div>

            <div className="text-center mb-4 p-4 bg-slate-900/30 rounded-lg flex-shrink-0 border border-slate-700">
                <h3 className="text-xl font-bold text-purple-300">Escena {currentSceneIndex + 1} / {scenes.length}</h3>
                <p className="text-slate-300 italic mt-1">{currentScene.description}</p>
            </div>

            {storyContinuitySummary && (
                <details className="mb-4 bg-slate-900/30 rounded-lg border border-slate-700 flex-shrink-0">
                    <summary className="p-3 cursor-pointer text-purple-300 font-semibold">La Historia Hasta Ahora...</summary>
                    <div className="p-3 border-t border-slate-700">
                        <p className="text-slate-300 whitespace-pre-wrap text-sm">{storyContinuitySummary}</p>
                    </div>
                </details>
            )}

            <div ref={transcriptContainerRef} className="flex-grow bg-slate-900/50 rounded-lg p-4 overflow-y-auto mb-4 space-y-4 border border-slate-700">
                {transcripts.map((t, i) => (
                    <div key={i} className={`flex items-end gap-2 ${t.author === actorName ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 ${t.author === actorName ? 'bg-purple-600 rounded-b-xl rounded-tl-xl' : 'bg-slate-600 rounded-b-xl rounded-tr-xl'}`}>
                            <p className="font-bold text-sm mb-1">{t.author}</p>
                            <p className="text-white">{t.text}</p>
                        </div>
                    </div>
                ))}
                {currentActorTranscript && (
                    <div className="flex justify-end opacity-70">
                        <div className="max-w-xs md:max-w-md lg:max-w-lg p-3 bg-purple-600 rounded-b-xl rounded-tl-xl">
                            <p className="font-bold text-sm mb-1">{actorName}</p>
                            <p>{currentActorTranscript}...</p>
                        </div>
                    </div>
                )}
                 {currentAiTranscript && (
                    <div className="flex justify-start opacity-70">
                        <div className="max-w-xs md:max-w-md lg:max-w-lg p-3 bg-slate-600 rounded-b-xl rounded-tr-xl">
                            <p className="font-bold text-sm mb-1">{aiName}</p>
                            <p>{currentAiTranscript}...</p>
                        </div>
                    </div>
                )}
            </div>

            {!useUserVoice && sessionActive && (
                <form onSubmit={handleSendText} className="mb-4 flex gap-2 flex-shrink-0">
                    <input
                        type="text" value={userTextInput} onChange={(e) => setUserTextInput(e.target.value)} placeholder="Escribe tu diálogo aquí..."
                        className="flex-grow bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                        disabled={status !== 'listening'}
                    />
                    <button type="submit" className={`${baseButtonClasses} bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-500 disabled:bg-slate-500`} disabled={status !== 'listening'}>Enviar</button>
                </form>
            )}

            <div className="flex-shrink-0 space-y-4">
                <div className="h-8 flex items-center justify-center">
                    {finalError ? <p className="text-red-400 text-center font-medium flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" /></svg>{finalError}</p> : <StatusIndicator status={status} />}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                    <button onClick={onEnd} className={`${baseButtonClasses} bg-slate-600 hover:bg-slate-700 text-slate-100 focus:ring-slate-500`}>Terminar y Reconfigurar</button>
                    
                    <div className="flex items-center justify-center gap-2">
                      {useUserVoice && sessionActive && (
                        <button 
                          onClick={toggleMute}
                          title={isMuted ? "Reactivar micrófono" : "Silenciar micrófono"}
                          className={`${baseButtonClasses} !p-3 ${isMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-slate-600 hover:bg-slate-700'}`}
                        >
                          {isMuted ? 
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.945.945 2.56.276 2.56-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L19.5 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L19.5 10.94l-1.72-1.72Z" /></svg>
                            : 
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" /><path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.75 6.75 0 1 1-13.5 0v-1.5A.75.75 0 0 1 6 10.5Z" /></svg>
                          }
                        </button>
                      )}
                      <button onClick={handleStartStop} className={`${baseButtonClasses} text-white focus:ring-green-500 w-full ${!sessionActive ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                          {!sessionActive ? getStartButtonText() : 'Detener Escena'}
                      </button>
                    </div>

                    <button 
                      onClick={() => handleNextScene(scenes)} 
                      disabled={isLastScene || sessionActive || status === 'summarizing' || transcripts.length === 0}
                      className={`${baseButtonClasses} bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-500 disabled:bg-slate-500`}
                    >
                        {status === 'summarizing' ? 'Preparando...' : 'Siguiente Escena'}
                    </button>
                </div>
            </div>
        </div>

        <CharacterPortrait 
            scenes={scenes}
            prePrompt={prePrompt}
            currentSceneIndex={currentSceneIndex}
            storyContinuitySummary={storyContinuitySummary}
        />
        
        <audio ref={audioOutputSinkRef} playsInline style={{ display: 'none' }} />
    </div>
  );
};

export default ImprovScreen;
