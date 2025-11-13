import React, { useState, useEffect } from 'react';
import { Scene } from '../types';
import { GoogleGenAI, Modality } from "@google/genai";

// Declare gifshot for TypeScript
declare const gifshot: any;

interface CharacterPortraitProps {
    scenes: Scene[];
    prePrompt: string;
    currentSceneIndex: number;
    storyContinuitySummary: string;
}

const GRID_SIZE = 4;
const FRAME_COUNT = GRID_SIZE * GRID_SIZE; // 16 frames

const SVGIcon: React.FC<{ path: string, className?: string }> = ({ path, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className || "w-6 h-6"}>
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
);

const CharacterPortrait: React.FC<CharacterPortraitProps> = ({ scenes, prePrompt, currentSceneIndex, storyContinuitySummary }) => {
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [spriteSheetUrl, setSpriteSheetUrl] = useState<string | null>(null);
    const [frameDuration, setFrameDuration] = useState<number | null>(null);
    const [currentFrame, setCurrentFrame] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusText, setStatusText] = useState('');
    
    const [isEditing, setIsEditing] = useState(false);
    const [editPrompt, setEditPrompt] = useState('');
    const [animationPrompt, setAnimationPrompt] = useState('Haz que esta imagen cobre vida');

    useEffect(() => {
        if (!spriteSheetUrl || !frameDuration) return;

        const animationInterval = setInterval(() => {
            setCurrentFrame(prev => (prev + 1) % FRAME_COUNT);
        }, frameDuration);

        return () => clearInterval(animationInterval);
    }, [spriteSheetUrl, frameDuration]);

    const generateImagePrompt = async (): Promise<string> => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const allSceneDescriptions = scenes.slice(0, currentSceneIndex + 1)
            .map((s, i) => `Detalles de Escena ${i + 1}: ${s.description}`)
            .join('\n');

        const promptForPrompter = `
            Eres un ingeniero de prompts experto para una IA de generación de imágenes fotorrealistas. Tu tarea es crear un prompt de imagen detallado basado en el contexto proporcionado sobre un personaje de IA en una escena de improvisación.
            **Instrucciones:**
            1. Lee todo el contexto proporcionado: las reglas generales del personaje, las descripciones de las escenas y el resumen de la historia.
            2. Sintetiza esta información para construir una descripción visual clara del **personaje de IA ÚNICAMENTE**.
            3. El resultado final debe ser un único párrafo descriptivo.
            4. El prompt debe describir una **fotografía de retrato realista, fotorrealista y en primer plano** del personaje. No incluyas otros personajes ni fondos complejos. Enfócate en la cara y la parte superior del cuerpo.
            **Contexto Proporcionado:**
            *   **Personaje de IA / Reglas Generales:** ${prePrompt || 'No se proporcionaron reglas generales.'}
            *   **Descripciones de Escenas (hasta la escena actual):** ${allSceneDescriptions}
            *   **Historia Hasta Ahora (Resumen de escenas anteriores):** ${storyContinuitySummary || 'Aún no hay resumen.'}
            Ahora, basándote en todo el contexto, genera el prompt de imagen detallado.`;

        const prompterResponse = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: promptForPrompter,
        });
        return prompterResponse.text;
    };

    const handleGenerateImage = async () => {
        setIsLoading(true);
        setError(null);
        setSpriteSheetUrl(null);
        setFrameDuration(null);
        setStatusText('1/2: Creando prompt de imagen detallado...');
        
        try {
          const imagePrompt = await generateImagePrompt();
          setStatusText('2/2: Generando retrato con Imagen...');
          
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
          const imageResponse = await ai.models.generateImages({
              model: 'imagen-4.0-generate-001',
              prompt: imagePrompt,
              config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' },
          });

          if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
              const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
              setGeneratedImageUrl(`data:image/jpeg;base64,${base64ImageBytes}`);
          } else {
              throw new Error("Imagen failed to return an image.");
          }
        } catch (e: any) {
            console.error("Image generation failed:", e);
            setError("Lo sentimos, el retrato del personaje no pudo ser creado.");
        } finally {
            setIsLoading(false);
            setStatusText('');
        }
    };

    const handleEditImage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editPrompt.trim() || !generatedImageUrl) return;

        setIsLoading(true);
        setError(null);
        setStatusText('Editando imagen con tus instrucciones...');
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const base64ImageData = generatedImageUrl.split(',')[1];
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [
                    { inlineData: { data: base64ImageData, mimeType: 'image/jpeg' } },
                    { text: editPrompt }
                ]},
                config: { responseModalities: [Modality.IMAGE] },
            });

            const newImagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (newImagePart?.inlineData) {
                const newBase64 = newImagePart.inlineData.data;
                setGeneratedImageUrl(`data:image/png;base64,${newBase64}`);
                setSpriteSheetUrl(null);
                setFrameDuration(null);
                setIsEditing(false);
                setEditPrompt('');
            } else {
                throw new Error("Nano Banana did not return an edited image.");
            }
        } catch (e: any) {
            console.error("Image editing failed:", e);
            setError("Lo sentimos, la imagen no pudo ser editada.");
        } finally {
            setIsLoading(false);
            setStatusText('');
        }
    };
    
    const generateAnimationMasterPrompt = (animationCreativeDirection: string): string => {
        const allSceneDescriptions = scenes.slice(0, currentSceneIndex + 1)
            .map((s, i) => `Detalles de Escena ${i + 1}: ${s.description}`)
            .join('\n');
    
        const creativeDirection = `
Anima al personaje en la imagen proporcionada.

**Petición de Animación:**
"${animationCreativeDirection}"

**Contexto del Personaje (para referencia):**
*   **Reglas del Personaje:** ${prePrompt || 'No se proporcionaron reglas generales.'}
*   **Descripciones de Escenas:** ${allSceneDescriptions}
*   **Historia Hasta Ahora:** ${storyContinuitySummary || 'Aún no hay resumen.'}
`;
    
        return `PRIMARY GOAL: Generate a single animated sprite sheet image and its corresponding animation speed.

You are an expert animator. Your task is to create a ${FRAME_COUNT}-frame animated sprite sheet based on the user's request.

---
CREATIVE DIRECTION:
${creativeDirection}

ANIMATION REQUIREMENTS:
- **SUBTLETY IS KEY:** The goal is to create a "living portrait" with subtle, natural micro-animations. The changes between each frame MUST be minimal and gradual.
- **FOCUS ON SMALL GESTURES:** Animate small gestures like a slow blink, a slight head tilt, a gentle breath, or a subtle shift in facial expression. AVOID large, fast, or exaggerated movements.
- **SMOOTH & SEAMLESS LOOP:** The movement must be extremely smooth, and the last frame must loop back perfectly to the first frame.
- **MAINTAIN IDENTITY (CRITICAL):** It is crucial that the subject's identity, face, and core features remain perfectly consistent across all ${FRAME_COUNT} frames. The character must be clearly recognizable from one frame to the next.
- **STABLE SUBJECT:** The subject's core position and scale MUST remain fixed. Imagine a static camera. Only the parts of the subject being animated should move, not the entire character's position within its frame.
- The animation must contain exactly ${FRAME_COUNT} frames.

FRAME DURATION LOGIC:
Based on the creative direction, you must determine an optimal frame duration for a natural, subtle animation.
- The animation should feel calm and realistic, like a "living photo".
- **Choose a duration between 200 and 800 milliseconds per frame.** A longer duration (e.g., 400ms) will result in a slower, more thoughtful animation, which is generally preferred.
- Avoid durations under 200ms unless the prompt explicitly calls for a very specific fast action.

---
REQUIRED RESPONSE FORMAT:

Your response MUST be structured into two distinct parts in the following order:

PART 1: JSON Data
A single, valid JSON object containing one key: "frameDuration". The value must be a number representing the milliseconds per frame you decided on. Do not add any other text or markdown formatting (like \`\`\`json) around the JSON.
Example:
{"frameDuration": 400}

PART 2: Image Data
The ${FRAME_COUNT}-frame sprite sheet image itself. This image MUST adhere to the following technical specifications.

IMAGE OUTPUT REQUIREMENTS:
- The output MUST be a single, square image file.
- The image MUST be precisely 1024x1024 pixels.
- The image must contain the ${FRAME_COUNT} animation frames arranged perfectly in a ${GRID_SIZE}x${GRID_SIZE} grid (${GRID_SIZE} rows, ${GRID_SIZE} columns).
- Do not add numbers, labels, or borders to the individual frames within the image.`;
    };

    const handleGenerateAnimation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!animationPrompt.trim() || !generatedImageUrl) return;

        setIsLoading(true);
        setError(null);
        setSpriteSheetUrl(null);
        setStatusText('Generando animación fluida...');

        try {
            const masterPrompt = generateAnimationMasterPrompt(animationPrompt);
            const base64ImageData = generatedImageUrl.split(',')[1];
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [
                    { inlineData: { data: base64ImageData, mimeType: 'image/jpeg' } },
                    { text: masterPrompt }
                ]},
                config: { responseModalities: [Modality.IMAGE] },
            });

            let parsedFrameDuration = 100; // default
            let newSpriteSheetUrl: string | null = null;
            const parts = response.candidates?.[0]?.content?.parts;

            if (parts && parts.length > 0) {
                for (const part of parts) {
                    if (part.text) {
                        try {
                            const cleanJson = part.text.replace(/^```json/, '').replace(/```$/, '').trim();
                            const jsonData = JSON.parse(cleanJson);
                            if (jsonData.frameDuration && typeof jsonData.frameDuration === 'number') {
                                parsedFrameDuration = jsonData.frameDuration;
                            }
                        } catch (e) {
                            console.warn("Failed to parse frameDuration JSON:", part.text, e);
                        }
                    } else if (part.inlineData) {
                        newSpriteSheetUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
            }
            
            if (newSpriteSheetUrl) {
                setSpriteSheetUrl(newSpriteSheetUrl);
                setFrameDuration(parsedFrameDuration);
            } else {
                throw new Error("Gemini no devolvió una imagen de hoja de sprites.");
            }

        } catch (e: any) {
            console.error("Animation generation failed:", e);
            setError(`La animación falló: ${e.message}`);
        } finally {
            setIsLoading(false);
            setStatusText('');
        }
    };

    const handleExportGif = () => {
        if (!spriteSheetUrl || !frameDuration) return;
        setIsLoading(true);
        setStatusText('Exportando GIF...');
    
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const frameSize = img.width / GRID_SIZE;
            const frames: string[] = [];
    
            const canvas = document.createElement('canvas');
            canvas.width = frameSize;
            canvas.height = frameSize;
            const ctx = canvas.getContext('2d');
    
            if (!ctx) {
                 setError('No se pudo crear el canvas para exportar.');
                 setIsLoading(false);
                 return;
            }
    
            for (let i = 0; i < FRAME_COUNT; i++) {
                const row = Math.floor(i / GRID_SIZE);
                const col = i % GRID_SIZE;
                ctx.clearRect(0, 0, frameSize, frameSize);
                ctx.drawImage(img, col * frameSize, row * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize);
                frames.push(canvas.toDataURL('image/jpeg'));
            }
    
            gifshot.createGIF({
                images: frames,
                gifWidth: frameSize,
                gifHeight: frameSize,
                frameDuration: frameDuration / 1000, // gifshot wants seconds
            }, (obj: { error: boolean; image: string; }) => {
                if (!obj.error) {
                    const link = document.createElement('a');
                    link.href = obj.image;
                    link.download = 'improv-animation.gif';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                } else {
                    console.error('GIFshot error:', obj);
                    setError('No se pudo crear el GIF.');
                }
                setIsLoading(false);
                setStatusText('');
            });
        };
        img.onerror = () => {
            setError('No se pudo cargar la imagen para exportar.');
            setIsLoading(false);
        };
        img.src = spriteSheetUrl;
    };

    const baseInputClasses = "flex-grow bg-slate-700/80 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder:text-slate-400";
    const baseButtonClasses = "bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors";
    const iconButtonClasses = "p-2 bg-slate-700 hover:bg-slate-600 rounded-full text-slate-200 transition-colors";

    return (
        <div className="lg:col-span-1 bg-slate-900/50 rounded-lg p-4 flex flex-col border border-slate-700">
            <h3 className="text-xl font-bold text-center text-purple-300 mb-4">Retrato Animado del Personaje</h3>
            <div className="w-full aspect-square bg-slate-700/50 rounded-md flex items-center justify-center relative overflow-hidden border border-slate-700">
                {!generatedImageUrl && !isLoading && (
                    <button onClick={handleGenerateImage} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105">
                        Generar Retrato
                    </button>
                )}
                {isLoading && <div className="text-center p-4 flex flex-col items-center gap-4">
                    <svg className="animate-spin h-8 w-8 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-slate-300">{statusText || 'Generando...'}</p>
                </div>}
                {error && <p className="text-red-400 text-center p-4">{error}</p>}

                {spriteSheetUrl && !isLoading && (
                     <div className="w-full h-full" style={{
                        backgroundImage: `url(${spriteSheetUrl})`,
                        backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
                        backgroundPosition: `${-(currentFrame % GRID_SIZE) * 100}% ${-Math.floor(currentFrame / GRID_SIZE) * 100}%`,
                        imageRendering: 'pixelated',
                     }}/>
                )}
                
                {generatedImageUrl && !spriteSheetUrl && !isLoading && (
                    <img src={generatedImageUrl} alt="Personaje de IA Generado" className="w-full h-full object-cover" />
                )}
            </div>

            {generatedImageUrl && !isLoading && (
                <div className="mt-4 space-y-4">
                    <div className="flex justify-center gap-4">
                        <button onClick={handleGenerateImage} title="Regenerar Imagen" className={iconButtonClasses}>
                            <SVGIcon path="M16.023 9.348h4.992v-.001a.75.75 0 0 1 .727.727l-.443 4.425a.75.75 0 0 1-1.455-.145l.23-2.305h-4.283a5.25 5.25 0 0 1-10.456 0H4.5A2.25 2.25 0 0 0 2.25 12v.001a2.25 2.25 0 0 0 2.25 2.25h1.5a.75.75 0 0 1 0 1.5h-1.5A3.75 3.75 0 0 1 0 12v-.001A3.75 3.75 0 0 1 3.75 8.25h4.283a5.25 5.25 0 0 1 10.456 0Zm-12.023 2.895a.75.75 0 0 1 .727-.727l.443-4.425a.75.75 0 0 1 1.455.145l-.23 2.305h4.283a5.25 5.25 0 0 1 10.456 0h4.5a2.25 2.25 0 0 0 2.25-2.25v-.001a2.25 2.25 0 0 0-2.25-2.25h-1.5a.75.75 0 0 1 0-1.5h1.5a3.75 3.75 0 0 1 3.75 3.75v.001A3.75 3.75 0 0 1 20.25 15h-4.283a5.25 5.25 0 0 1-10.456 0H4.5a.75.75 0 0 1-.727.727Z" />
                        </button>
                        <button onClick={() => setIsEditing(!isEditing)} title="Editar Imagen" className={iconButtonClasses}>
                            <SVGIcon path="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
                        </button>
                        {spriteSheetUrl && <button onClick={handleExportGif} title="Exportar GIF" className={iconButtonClasses}>
                            <SVGIcon path="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </button>}
                    </div>

                    {isEditing && (
                        <form onSubmit={handleEditImage} className="flex gap-2">
                            <input
                                type="text" value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                                placeholder="Ej: haz que parezca mayor" className={baseInputClasses} />
                            <button type="submit" className={baseButtonClasses}>Aplicar</button>
                        </form>
                    )}

                    {!spriteSheetUrl && (
                        <form onSubmit={handleGenerateAnimation} className="flex flex-col gap-2">
                            <input
                                type="text" value={animationPrompt} onChange={e => setAnimationPrompt(e.target.value)}
                                className={baseInputClasses} />
                            <button type="submit" className={`${baseButtonClasses} w-full`}>✨ Animar</button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
};

export default CharacterPortrait;