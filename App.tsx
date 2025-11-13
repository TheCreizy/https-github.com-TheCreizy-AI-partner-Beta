import React, { useState, useCallback } from 'react';
import { Scene } from './types';
import ConfigurationScreen from './components/ConfigurationScreen';
import ImprovScreen from './components/ImprovScreen';
import { useGeminiImprovSession } from './hooks/useGeminiImprovSession';

const App: React.FC = () => {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [prePrompt, setPrePrompt] = useState<string>('');

  const handleStartImprov = useCallback((
    configuredScenes: Scene[], 
    configuredPrePrompt: string
  ) => {
    setScenes(configuredScenes);
    setPrePrompt(configuredPrePrompt);
  }, []);

  const handleEndImprov = useCallback(() => {
    useGeminiImprovSession.getState().reset();
    setScenes(null);
    setPrePrompt('');
  }, []);

  return (
    <div className="text-slate-100 min-h-screen flex flex-col items-center justify-center p-4 selection:bg-purple-500/30">
      <div className="w-full max-w-7xl mx-auto">
        <header className="text-center mb-6">
          <div className="flex items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-purple-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.375a6 6 0 0 0 6-6 6 6 0 0 0-6-6s-4.25 6-6 6a6 6 0 0 0 6 6Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.375a6 6 0 0 1-6-6 6 6 0 0 1 6-6s4.25 6 6 6a6 6 0 0 1-6 6Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.375v1.5M12 19.875v1.5M4.875 6.375 6 7.5M18 16.5l1.125 1.125M6 16.5l-1.125 1.125M19.125 6.375 18 7.5" />
            </svg>

            <h1 className="text-4xl md:text-5xl font-bold text-purple-400 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
              Companero de Impro IA
            </h1>
          </div>
          <p className="text-slate-400 mt-2 text-lg">
            Tu colaborador creativo en tiempo real, impulsado por Gemini.
          </p>
        </header>
        <main className="bg-slate-800/50 rounded-lg shadow-2xl p-4 md:p-8 backdrop-blur-sm border border-slate-700">
          {scenes ? (
            <ImprovScreen 
              scenes={scenes} 
              prePrompt={prePrompt} 
              onEnd={handleEndImprov} 
            />
          ) : (
            <ConfigurationScreen onStart={handleStartImprov} />
          )}
        </main>
        <footer className="text-center mt-8 text-slate-500 text-sm">
          <p>Creado para la narracion interactiva en vivo.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;