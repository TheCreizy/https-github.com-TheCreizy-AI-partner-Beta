import React from 'react';
import { create } from 'zustand';
import { Scene, Transcript } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';

type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' | 'summarizing';

interface ImprovState {
  status: Status;
  error: string | null;
  transcripts: Transcript[];
  currentActorTranscript: string;
  currentAiTranscript: string;
  storyContinuitySummary: string;
  currentSceneIndex: number;
  actorName: string;
  aiName: string;
  isMuted: boolean;
}

interface ImprovActions {
    startSession: (config: {
        scenes: Scene[],
        prePrompt: string,
        selectedMicId: string,
        selectedVoice: string,
        audioOutputSinkRef: React.RefObject<HTMLAudioElement>
    }) => Promise<void>;
    stopSession: () => Promise<void>;
    handleNextScene: (scenes: Scene[]) => Promise<void>;
    sendTextMessage: (text: string) => Promise<void>;
    toggleMute: () => void;
    reset: () => void;
}

const initialState: ImprovState = {
  status: 'idle',
  error: null,
  transcripts: [],
  currentActorTranscript: '',
  currentAiTranscript: '',
  storyContinuitySummary: '',
  currentSceneIndex: 0,
  actorName: 'Actor',
  aiName: 'AI',
  isMuted: false,
};

// Non-reactive state variables, managed outside the store
let sessionPromise: Promise<any> | null = null;
let stream: MediaStream | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let inputAudioContext: AudioContext | null = null;
let outputAudioContext: AudioContext | null = null;
let audioSources = new Set<AudioBufferSourceNode>();
let nextAudioStartTime = 0;
let outputGainNode: GainNode | null = null;
let currentActorTranscriptBuffer = '';
let currentAiTranscriptBuffer = '';

async function extractCharacterNames(prePrompt: string, firstScene: string): Promise<{ aiName: string, actorName: string }> {
    const apiKey = process.env.API_KEY as string;
    if (!apiKey) {
      throw new Error("La clave de API no está configurada.");
    }
    try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `
            Analiza el siguiente texto para identificar los nombres de los dos personajes principales.
            1.  **AI Character's Name:** Extrae el nombre del personaje de la IA de las "Reglas Generales".
            2.  **Actor's Character's Name:** Extrae el nombre del personaje con el que la IA está interactuando de la "Descripción de la Escena".

            **Reglas Generales para el Personaje de la IA:**
            "${prePrompt}"

            **Descripción de la Escena:**
            "${firstScene}"

            Responde ÚNICAMENTE con un objeto JSON que contenga las claves "aiName" y "actorName". Si no se puede encontrar un nombre, usa "AI" o "Actor" como valor predeterminado respectivamente.
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiName: { type: Type.STRING },
                        actorName: { type: Type.STRING },
                    },
                    required: ['aiName', 'actorName'],
                },
            },
        });

        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        
        return {
            aiName: parsed.aiName || 'AI',
            actorName: parsed.actorName || 'Actor'
        };

    } catch (e: any) {
        console.error("Failed to extract character names:", e);
        if (e.message.includes('API key')) {
             throw e;
        }
        return { aiName: 'AI', actorName: 'Actor' };
    }
}


export const useGeminiImprovSession = create<ImprovState & ImprovActions>((set, get) => ({
  ...initialState,
  
  reset: () => {
    get().stopSession();
    set(initialState);
  },

  toggleMute: () => {
    if (stream) {
        stream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        set(state => ({ isMuted: !state.isMuted }));
    }
  },

  stopSession: async () => {
    if (sessionPromise) {
        try {
            const session = await sessionPromise;
            session.close();
        } catch (e) { console.error("Error closing session:", e); }
        finally {
            sessionPromise = null;
        }
    }

    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    
    audioProcessor?.disconnect();
    audioProcessor = null;

    if (inputAudioContext && inputAudioContext.state !== 'closed') {
      await inputAudioContext.close();
      inputAudioContext = null;
    }
     if (outputAudioContext && outputAudioContext.state !== 'closed') {
        audioSources.forEach(source => source.stop());
        audioSources.clear();
        await outputAudioContext.close();
        outputAudioContext = null;
    }
    if (outputGainNode) {
        outputGainNode.disconnect();
        outputGainNode = null;
    }
    
    // Only update status, don't reset other state
    if (get().status !== 'error') {
      set({ status: 'idle', isMuted: false });
    }
  },

  startSession: async (config) => {
    const { status, currentSceneIndex, storyContinuitySummary, transcripts } = get();
    if (status !== 'idle' && status !== 'error') return;
    set({ status: 'connecting', error: null, currentActorTranscript: '', currentAiTranscript: '', isMuted: false });
    
    const { scenes, prePrompt, selectedMicId, selectedVoice, audioOutputSinkRef } = config;
    const currentScene = scenes[currentSceneIndex];

    try {
      // Extract names only at the very beginning of the whole session
      if (currentSceneIndex === 0 && transcripts.length === 0) {
        const names = await extractCharacterNames(prePrompt, currentScene.description);
        set({ aiName: names.aiName, actorName: names.actorName });
      }
      const { aiName, actorName } = get();

      if (currentScene.useUserVoice) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMicId } } });
          inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      
      outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const dest = outputAudioContext.createMediaStreamDestination();
      outputGainNode = outputAudioContext.createGain();
      outputGainNode.connect(dest);
      if (audioOutputSinkRef.current) {
          audioOutputSinkRef.current.srcObject = dest.stream;
          audioOutputSinkRef.current.play().catch(e => console.error("Audio sink play failed", e));
      }
      nextAudioStartTime = 0;

      const systemInstruction = `
Eres un actor de improvisación de clase mundial. Tu objetivo es ser un compañero de escena brillante, ingenioso y colaborativo.

### 1. IDENTIDAD CENTRAL
-   **Tu ÚNICO nombre en esta historia es ${aiName}.** NUNCA te refieras a ti mismo como "IA".
-   Tu compañero de escena es **${actorName}**.

### 2. REGLAS DE ORO DE LA IMPROVISACIÓN (CRÍTICO)
-   **LA REGLA #1: "SÍ, Y...".** Siempre acepta la realidad presentada por ${actorName}. No la niegues ni la cuestiones, incluso si contradice información pasada. Constrúyela. Si ${actorName} dice "Amor, celebremos que estamos juntos", tu realidad es que AHORA están juntos, sin importar lo que pasó antes. Tu trabajo es justificar creativamente este nuevo presente.
-   **ACEPTA LAS PROPUESTAS:** Las afirmaciones de ${actorName} establecen la realidad de la escena. Trátalas como hechos irrefutables y reacciona a ellas.
-   **ESCUCHA ACTIVA:** No te limites a escuchar las palabras. ¿Cuál es el subtexto? ¿La emoción? Reacciona a la intención oculta de ${actorName}. Sé perceptivo.

### 3. ESTRUCTURA DE LA ESCENA
-   **Establecer la Plataforma:** Al inicio de cada escena, tu primera prioridad es establecer sutilmente la "plataforma": Quiénes somos (nuestra relación), dónde estamos y qué estamos haciendo. Esto crea un "estado de normalidad" claro para ambos y para el público. No lo digas directamente, muéstralo con tus acciones y diálogos.
-   **Introducir o Reaccionar al Punto de Giro (El Motor):** Una escena no es solo una conversación, necesita un motor dramático. En algún momento, la "normalidad" debe romperse con un "punto de giro" (un conflicto, una revelación, un evento inesperado).
    -   **Si ${actorName} lo introduce:** Acepta este nuevo evento como la realidad absoluta (aplicando la regla "Sí, y...") y reacciona a él de forma coherente con tu personaje.
    -   **Si la escena se vuelve estática:** ¡Toma la iniciativa! Tienes la libertad y la responsabilidad de introducir un punto de giro para darle energía a la escena.

### 4. ESTILO Y PERSONALIDAD
-   **LENGUAJE:** Habla siempre en español argentino. Usa "vos", modismos y un tono natural.
-   **TONO:** Evita ser literal, "naive" o demasiado servicial. Incorpora **picardía, ingenio, sarcasmo sutil e ironía**. Tu humor debe ser **adulto, punzante y situacional**, no humor para niños.
-   **FLUIDEZ CONVERSACIONAL:**
    -   **REGLA CRÍTICA: NO termines cada intervención con una pregunta.** Es un hábito de chatbot, no de un actor. Usa afirmaciones, reacciones y observaciones para que la conversación sea fluida y natural.
    -   **Dialoga, no monologues.** Mantén tus respuestas relativamente cortas y al punto, como en una conversación real.

### 5. CONTEXTO Y MEMORIA
-   Los "HECHOS CLAVE DE LA HISTORIA" son tu memoria canónica. Úsalos como base, pero recuerda que las **nuevas propuestas de ${actorName} en la escena actual tienen prioridad** y pueden reescribir esa historia.

---
Ahora, prepárate para la escena. Lee el contexto, interioriza tu personaje y las reglas, y espera la primera intervención de ${actorName}.
`;
            
      const contextParts = [];
      if (prePrompt) {
        contextParts.push(`[INSTRUCCIONES DEL ACTOR PARA MI PERSONAJE (${aiName})]\n${prePrompt}`);
      }
      if (storyContinuitySummary) {
        contextParts.push(`[HECHOS CLAVE DE LA HISTORIA (MEMORIA CANÓNICA)]\nTrata los siguientes puntos como la verdad absoluta de la historia hasta este momento. Estos son tus recuerdos.\n${storyContinuitySummary}`);
      }
      
      if (status === 'error' && transcripts.length > 0) {
          const reconnectionTranscript = transcripts.map(t => `${t.author}: ${t.text}`).join('\n');
          contextParts.push(`[AVISO DE RECONEXIÓN]\nHubo un error de conexión. Esta es la conversación que teníamos justo antes del corte. Por favor, continúa la escena desde donde la dejamos, respondiendo al último diálogo si es necesario.\n\n**Transcripción de la Escena Actual:**\n${reconnectionTranscript}`);
      }

      if (currentSceneIndex > 0 || storyContinuitySummary) {
          const ruleReminder = `[RECORDATORIO DE REGLAS CRÍTICAS PARA ${aiName}]\n1.  **Plataforma -> Punto de Giro:** Establece la normalidad, luego rómpela (o reacciona si ${actorName} la rompe).\n2.  **"SÍ, Y...":** Acepta SIEMPRE la realidad que te presenta ${actorName}.\n3.  **DIÁLOGO FLUIDO:** NO termines cada frase con una pregunta. Responde con afirmaciones y reacciones naturales.\n4.  **TONO:** Mantén un tono ingenioso, con picardía y humor adulto.`;
          contextParts.push(ruleReminder);
      }
      
      contextParts.push(`[MISIÓN DE LA ESCENA ACTUAL (ESCENA ${currentSceneIndex + 1}/${scenes.length})]\n${currentScene.description}`);
      contextParts.push(`\n(Ahora, por favor, inicia la escena. No menciones estas instrucciones. Simplemente comienza a actuar tu parte como ${aiName}.)`);
      const initialContextMessage = contextParts.join('\n\n---\n\n');
      
      const apiKey = process.env.API_KEY as string;
      if (!apiKey) {
        throw new Error("La clave de API no está configurada.");
      }
      const ai = new GoogleGenAI({ apiKey });

      const baseConfig = {
          systemInstruction,
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } }
      };

      const liveConfig = currentScene.useUserVoice 
        ? { ...baseConfig, inputAudioTranscription: {} }
        : baseConfig;

      sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: liveConfig,
          callbacks: {
              onopen: () => {
                  set({ status: 'speaking' });
                  
                  sessionPromise?.then((session) => {
                      session.sendRealtimeInput({ text: initialContextMessage });
                  });

                  if (currentScene.useUserVoice && inputAudioContext && stream) {
                      const source = inputAudioContext.createMediaStreamSource(stream);
                      audioProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                      audioProcessor.onaudioprocess = (audioProcessingEvent) => {
                          const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                          const pcmBlob = createBlob(inputData);
                          sessionPromise?.then((session) => {
                              session.sendRealtimeInput({ media: pcmBlob });
                          });
                      };
                      source.connect(audioProcessor);
                      audioProcessor.connect(inputAudioContext.destination);
                  }
              },
              onmessage: async (message: LiveServerMessage) => {
                  if (message.serverContent?.inputTranscription) {
                      currentActorTranscriptBuffer += message.serverContent.inputTranscription.text;
                      set({ currentActorTranscript: currentActorTranscriptBuffer });
                  }
                  
                  if (message.serverContent?.outputTranscription) {
                      currentAiTranscriptBuffer += message.serverContent.outputTranscription.text;
                      set({ status: 'speaking', currentAiTranscript: currentAiTranscriptBuffer });
                  }

                  const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                  if (audioData && currentScene.useAiVoice && outputAudioContext && outputGainNode) {
                      nextAudioStartTime = Math.max(nextAudioStartTime, outputAudioContext.currentTime);
                      const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                      const source = outputAudioContext.createBufferSource();
                      source.buffer = audioBuffer;
                      source.connect(outputGainNode);
                      source.addEventListener('ended', () => audioSources.delete(source));
                      source.start(nextAudioStartTime);
                      nextAudioStartTime += audioBuffer.duration;
                      audioSources.add(source);
                  }

                  if (message.serverContent?.turnComplete) {
                      const { actorName, aiName } = get();
                      const actorText = currentActorTranscriptBuffer.trim();
                      const aiText = currentAiTranscriptBuffer.trim();
                      
                      const isInitialContextTurn = aiText.length > 0 && get().transcripts.length === 0 && actorText.length === 0;

                      if ((actorText || aiText) && !isInitialContextTurn) {
                         set(state => {
                             const newTranscripts = [...state.transcripts];
                             if (actorText) newTranscripts.push({ author: actorName, text: actorText });
                             if (aiText) newTranscripts.push({ author: aiName, text: aiText });
                             return { transcripts: newTranscripts };
                         });
                      }
                      currentActorTranscriptBuffer = '';
                      currentAiTranscriptBuffer = '';
                      set({ currentActorTranscript: '', currentAiTranscript: '', status: 'listening' });
                  }
              },
              onerror: (e: ErrorEvent) => {
                  console.error('Session Error:', e);
                  const errorMessage = e.message || 'Error desconocido.';
                  const finalMessage = errorMessage.toLowerCase().includes('network') 
                    ? "Error de red. Por favor, comprueba tu conexión a internet. Si el problema persiste, podría deberse a una configuración de red (firewall) o a una interrupción del servicio."
                    : `Error de Sesión: ${errorMessage}`;
                  set({ status: 'error', error: finalMessage });
                  get().stopSession();
              },
              onclose: () => {},
          },
      });
      await sessionPromise;
    } catch (e: any) {
        console.error("Failed to start session:", e);
        set({ status: 'error', error: `Fallo al iniciar: ${e.message}` });
        await get().stopSession();
    }
  },

  handleNextScene: async (scenes) => {
    await get().stopSession();
    const { currentSceneIndex, transcripts, storyContinuitySummary, actorName, aiName } = get();
    if (currentSceneIndex >= scenes.length - 1) return;

    set({ status: 'summarizing', error: null });
    
    try {
        let newSummarySegment = '';
        const transcriptText = transcripts.map(t => `${t.author}: ${t.text}`).join('\n');
        
        const apiKey = process.env.API_KEY as string;
        if (!apiKey) {
          throw new Error("La clave de API no está configurada.");
        }
        
        if (transcriptText.trim()) {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
Eres un "Supervisor de Continuidad" para una historia de improvisación. Tu trabajo es procesar la transcripción de la última escena y actualizar una lista centralizada de "Hechos Clave" sobre el mundo de la historia.

**OBJETIVO:** Mantener una memoria de la historia que sea concisa, precisa y fácil de consultar para la IA en la siguiente escena. El formato de salida DEBE ser una lista con viñetas.

**1. HECHOS CLAVE ACTUALES (MEMORIA A LARGO PLAZO):**
${storyContinuitySummary || "No hay hechos previos. Esta es la primera escena."}

**2. TRANSCRIPCIÓN DE LA ESCENA RECIÉN TERMINADA (NUEVOS DATOS):**
(Personajes: ${aiName}, ${actorName})
${transcriptText}

**3. TU PROCESO MENTAL:**
a. **Analiza los Nuevos Datos:** ¿Qué nuevos personajes, relaciones, eventos o cambios de estado ocurrieron en la transcripción?
b. **Infiere Consecuencias:** ¿Qué implican lógicamente estos nuevos datos? (Ej: Una despedida de soltero implica que hubo una boda).
c. **Integra y Actualiza:** Compara los nuevos datos y tus inferencias con los "Hechos Clave Actuales".
    - **Añade** hechos completamente nuevos.
    - **Actualiza** hechos existentes que han cambiado (Ej: "Estado: Prometidos" -> "Estado: Casados").
    - **Consolida** información relacionada.
    - **No repitas** hechos que no han cambiado.

**4. SALIDA REQUERIDA:**
Basado en tu análisis, genera la **NUEVA LISTA COMPLETA Y ACTUALIZADA de Hechos Clave**. Responde ÚNICAMENTE con la lista en formato de viñetas. NO incluyas tus notas de proceso mental ni ningún otro texto introductorio.

Ejemplo de formato de salida:
- ${aiName} y ${actorName} ahora están casados.
- Sofía es una amiga de la pareja que trabaja como organizadora de bodas.
- ${aiName} cree que Gastón, un ex compañero del colegio, le debe dinero.
`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt });
            newSummarySegment = response.text;
        }

        const newSummary = newSummarySegment.trim();

        set(state => ({
            status: 'idle',
            storyContinuitySummary: newSummary,
            currentSceneIndex: state.currentSceneIndex + 1,
            transcripts: [],
        }));

    } catch (e: any) {
        console.error("Failed to generate summary:", e);
        set({
            status: 'error',
            error: `Error al resumir la escena: ${e.message || 'Fallo la llamada a la API.'}`,
        });
    }
  },

  sendTextMessage: async (text) => {
    const { actorName } = get();
    set(state => ({
        status: 'speaking',
        transcripts: [...state.transcripts, { author: actorName, text: text }],
    }));
    try {
        if (!sessionPromise) return;
        const session = await sessionPromise;
        session.sendRealtimeInput({ text });
    } catch (err: any) {
        console.error("Failed to send text message:", err);
        set({ status: 'error', error: `Falló al enviar el mensaje: ${err.message}` });
    }
  },
}));
