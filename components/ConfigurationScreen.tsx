import React, { useState, useEffect } from 'react';
import { Scene } from '../types';

interface ConfigurationScreenProps {
  onStart: (scenes: Scene[], prePrompt: string) => void;
}

const ToggleSwitch: React.FC<{ label: string; enabled: boolean; onChange: (enabled: boolean) => void;}> = ({ label, enabled, onChange }) => (
  <label className="flex items-center justify-start gap-4 cursor-pointer group">
    <span className="text-slate-300 text-sm group-hover:text-slate-100 transition-colors">{label}</span>
    <div className="relative">
      <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      <div className="block w-12 h-6 rounded-full bg-slate-600 peer-checked:bg-purple-600 transition"></div>
      <div className="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform transform peer-checked:translate-x-6"></div>
    </div>
  </label>
);

const IconButton: React.FC<{ onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="p-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded-md text-slate-200 transition-colors"
  >
    {children}
  </button>
);


const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({ onStart }) => {
  const [sceneCount, setSceneCount] = useState(1);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [prePrompt, setPrePrompt] = useState('Tu nombre es Ramiro. Sos un hombre.');

  const generatePlaceholder = (index: number): string => {
    const placeholders = [
      "Tenes 17 años de edad. Estas en con Ana en el recreo del colegio.",
      "Tenes 25 años de edad. Estas en con Gaston, ex compañero del colegio, en un bar.",
      "Tenes 45 años de edad. Estas en con Ana en un festejo navideño.",
      "Tenes años de edad. Estas en con.",
      "Tenes años de edad. Estas en con.."
    ];
    return placeholders[index % placeholders.length];
  }

  useEffect(() => {
    setScenes(prevScenes => {
      const newScenes = Array.from({ length: sceneCount }, (_, i) => 
        prevScenes[i] || { description: generatePlaceholder(i), useUserVoice: true, useAiVoice: true }
      );
      return newScenes.slice(0, sceneCount);
    });
  }, [sceneCount]);

  const handleSceneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = Math.max(1, Math.min(10, Number(e.target.value)));
    setSceneCount(count);
  };
  
  const handleDecrementScenes = () => setSceneCount(c => Math.max(1, c - 1));
  const handleIncrementScenes = () => setSceneCount(c => Math.min(10, c + 1));

  const handleSceneChange = (index: number, field: keyof Scene, value: string | boolean) => {
    const newScenes = [...scenes];
    (newScenes[index] as any)[field] = value;
    setScenes(newScenes);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scenes.every(s => s.description.trim() !== '')) {
      onStart(scenes, prePrompt);
    } else {
      alert('Por favor, proporciona una descripción para cada escena.');
    }
  };
  
  const baseInputClasses = "w-full bg-slate-700/50 border border-slate-600 rounded-md px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition";

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-semibold text-center text-purple-300 mb-6">Configuracion de la Historia</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="sceneCount" className="block text-sm font-medium text-slate-300 mb-2">
              Numero de Escenas
            </label>
            <div className="flex items-center gap-2">
              <IconButton onClick={handleDecrementScenes} disabled={sceneCount <= 1}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
              </IconButton>
              <input
                type="number"
                id="sceneCount"
                value={sceneCount}
                onChange={handleSceneCountChange}
                min="1"
                max="10"
                className={`${baseInputClasses} w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
              <IconButton onClick={handleIncrementScenes} disabled={sceneCount >= 10}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              </IconButton>
            </div>
          </div>

          <div className="md:col-span-2">
              <label htmlFor="prePrompt" className="block text-sm font-medium text-slate-300 mb-2">
                  Personaje de IA / Reglas Generales (Opcional)
              </label>
              <textarea
                  id="prePrompt"
                  rows={3}
                  value={prePrompt}
                  onChange={(e) => setPrePrompt(e.target.value)}
                  className={`${baseInputClasses} resize-y`}
              />
          </div>
        </div>

        <div className="space-y-4">
          {scenes.map((scene, index) => (
            <div key={index} className="p-4 bg-slate-900/30 border border-slate-700 rounded-lg space-y-4">
              <label htmlFor={`scene-${index}`} className="block text-sm font-medium text-slate-300">
                Detalles de la Escena {index + 1}
              </label>
              <textarea
                id={`scene-${index}`}
                rows={3}
                value={scene.description}
                onChange={(e) => handleSceneChange(index, 'description', e.target.value)}
                className={`${baseInputClasses} resize-none`}
                required
              />
              <div className="grid grid-cols-2 gap-4 pt-2">
                <ToggleSwitch label="Usar Mi Voz" enabled={scene.useUserVoice} onChange={(val) => handleSceneChange(index, 'useUserVoice', val)} />
                <ToggleSwitch label="Usar Voz de IA" enabled={scene.useAiVoice} onChange={(val) => handleSceneChange(index, 'useAiVoice', val)} />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-all transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500 shadow-lg shadow-purple-600/20"
          >
            Iniciar Sesion de Improvisacion
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConfigurationScreen;