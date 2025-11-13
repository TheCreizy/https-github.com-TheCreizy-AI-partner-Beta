import { useState, useEffect } from 'react';

export const useMediaDevices = (needsInput: boolean, needsOutput: boolean) => {
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  useEffect(() => {
    const getDevices = async () => {
      if (!needsInput && !needsOutput) return;
      
      try {
        // We need to request user media to get device labels
        if (needsInput) {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop tracks immediately, we only needed permission
            tempStream.getTracks().forEach(track => track.stop());
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        
        if (needsInput) {
            const inputs = devices.filter(d => d.kind === 'audioinput');
            if (inputs.length > 0) {
                setAudioInputDevices(inputs);
            } else {
                setDeviceError("No se encontraron micrófonos.");
            }
        }
        if (needsOutput) {
            const outputs = devices.filter(d => d.kind === 'audiooutput');
             if (outputs.length > 0) {
                setAudioOutputDevices(outputs);
            } else {
                // This is common in some browsers like Firefox
                console.warn("No se encontraron dispositivos de salida de audio explícitos.");
                // Provide a default option as the browser will handle it
                setAudioOutputDevices([{ deviceId: 'default', kind: 'audiooutput', label: 'Altavoz por Defecto', groupId: '' } as MediaDeviceInfo]);
            }
        }
      } catch (e) {
        console.error("Could not enumerate devices:", e);
        setDeviceError("No se pudo acceder a los dispositivos de audio. Por favor, otorga permiso.");
      }
    };

    getDevices();
  }, [needsInput, needsOutput]);

  return { audioInputDevices, audioOutputDevices, deviceError };
};
