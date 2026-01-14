
import React, { useEffect, useRef, useState } from "react";
import {
  FaDesktop,
  FaMicrophone,
  FaTimesCircle,
  FaVideo,
  FaInfoCircle,
  FaRegPlayCircle,
  FaBackspace,
  FaTimes,
  FaSyncAlt,
  FaCheckCircle,
} from "react-icons/fa";
import CustomTitleBar from "./ui/CustomTitleBar";
import Toast from "./ui/ToastNotification";
import guiaRostro from '../assets/images/guia.png';

type JoinEventFormProps = {
  eventKey: string;
  onExit: () => void;
};

type EventStatus = {
  name: string | undefined;
  status: string;
  user?:
    | {
        name: string;
        email: string;
      }
    | undefined;
  event?: {
    name: string;
  };
  
};

// Utilidad para formatear segundos a mm:ss
function formatSecondsToMMSS(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const MediaCapture: React.FC<JoinEventFormProps> = ({ eventKey, onExit }) => {
  // Refs and state for media capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false); // Estado para indicar que está deteniendo
  const [isExiting, setIsExiting] = useState(false); // Estado para indicar que está regresando
  const streamRef = useRef<MediaStream | null>(null);
  const isAppClosingRef = useRef(false);
  const mediaConstraints: MediaStreamConstraints = {
    video: {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: true,
  };

  const [showEventDetails, setShowEventDetails] = useState(false);

  // Shared state
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState(false);
  const [hasScreenAccess, setHasScreenAccess] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);
  const [isProxyValid, setIsProxyValid] = useState(true);

  // Toast notifications
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Event state
  const [eventStatus, setEventStatus] = useState<EventStatus>({
    name: undefined,
    status: "Loading...",
    user: undefined,
  });

  // Cronómetro: tiempo restante en segundos
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const eventDurationRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMonitoringActiveRef = useRef<boolean>(false);
  const proxyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Función para obtener y calcular el tiempo restante desde el backend
  const fetchAndUpdateRemainingTime = async () => {
    try {
      const verification = await window.api.verifyEventKey(eventKey);
      if (verification && verification.event && verification.participant) {
        const durationMinutes = verification.event.duration || 0;
        eventDurationRef.current = durationMinutes * 60; // Guardar duración total en segundos
        
        // Priorizar el tiempo total calculado por el backend (incluye sesión actual)
        // Si no existe (versión vieja del backend), usar el campo raw
        const monitoringTotalSeconds = verification.connectionInfo?.totalTimeSeconds ?? 
                                     verification.participant.monitoring_total_duration ?? 0;
                                     
        const totalSeconds = Math.max(eventDurationRef.current - monitoringTotalSeconds, 0);
        setRemainingSeconds(totalSeconds);
      }
    } catch (err) {
      // Si falla, no actualiza el cronómetro
    }
  };

  // Función para iniciar el contador local (se decrementa cada segundo)
  const startLocalTimer = () => {
    // Limpiar cualquier intervalo previo
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    isMonitoringActiveRef.current = true;

    // Decrementar cada segundo mientras está en monitoreo
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev === null) return null;
        
        // Si llega a 0, detener todo automáticamente
        if (prev <= 1) {
          // Usar setTimeout para evitar conflictos de estado dentro del render
          setTimeout(() => {
            // Usar la referencia para evitar problemas de clausura (stale closure)
            if (isMonitoringActiveRef.current) {
              console.log("⏳ Tiempo agotado - Deteniendo monitoreo automáticamente");
              stopRecording();
              setToastMessage("⏳ Tiempo del evento finalizado");
              setShowToast(true);
            }
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Función para detener el contador local y sincronizar con backend
  const stopLocalTimer = async () => {
    isMonitoringActiveRef.current = false;
    
    // Detener el intervalo
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Esperar un momento para que el backend procese el stop_monitoring
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Sincronizar con el backend para obtener el valor real actualizado
    await fetchAndUpdateRemainingTime();
  };

  // Efecto para inicializar el cronómetro (solo una vez al cargar)
  useEffect(() => {
    fetchAndUpdateRemainingTime();
    
    // Limpiar intervalo al desmontar
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [eventKey]);

  // Renderizar el cronómetro compacto (para al lado del botón)
  const renderCompactTimer = () => {
    if (remainingSeconds === null) return null;
    return (
      <div className="rounded-full border border-gray-600 bg-white px-2 py-1 text-xs font-mono text-gray-800">
        {formatSecondsToMMSS(remainingSeconds)}
      </div>
    );
  };

  // Renderizar el cronómetro en el modal
  const renderTimerInModal = () => {
    if (remainingSeconds === null) return null;
    return (
      <div className="flex items-center">
        <span className="mr-2 w-20">Tiempo restante:</span>
        <span className="text-gray-400 font-mono">{formatSecondsToMMSS(remainingSeconds)}</span>
      </div>
    );
  };





  // Initial event and proxy verification
  useEffect(() => {
    const initializeProxy = async () => {
      try {
        const verification = await window.api.verifyEventKey(eventKey);

        if (verification) {
          await window.api.startProxy();
          const isProxyConnected = await window.api.isProxySetup();

          setIsProxyValid(isProxyConnected);
          setEventStatus({
            name: verification.event.name || "Unknown Event",
            status: isProxyConnected ? "Tracking" : "No tracking",
            user: {
              email: verification.participant.email,
              name: verification.participant.name,
            },
          });
        }
      } catch (error) {
        setIsProxyValid(false);
        setEventStatus({
          name: "Unknown Event",
          status: "No tracking",
          user: undefined,
        });
        return undefined;
      }
    };

    // Función para verificar el estado del proxy y bloqueo periódicamente
    const checkProxyAndBlockStatus = async () => {
      try {
        // OPTIMIZACIÓN: Una sola petición al backend para verificar todo
        // verifyEventKey ya valida: evento activo, participante válido, y estado de bloqueo
        let isBlocked = false;
        let isProxyConnected = false;
        
        try {
          const verification = await window.api.verifyEventKey(eventKey);
          const isExplicitlyBlocked =
            typeof verification?.error === "string" &&
            verification.error.toLowerCase().includes("bloqueado por el administrador");
          
          if (!verification || !verification.isValid) {
            isBlocked = isExplicitlyBlocked;
            isProxyConnected = false;
          } else {
            // Si la verificación es exitosa, el proxy está funcionando
            isProxyConnected = true;
          }
        } catch (error) {
          // Si hay error en la verificación, asumir problema de conexión
          console.error('Error verificando estado:', error);
          isBlocked = false;
          isProxyConnected = false;
        }
        
        // Si el participante fue bloqueado
        if (isBlocked && isProxyValid) {
          console.warn('⚠️ Participante bloqueado por el administrador');
          
          // Detener monitoreo si está activo
          if (isRecording) {
            await stopRecording();
          }
          
          // Actualizar estados
          setIsProxyValid(false);
          setIsRecording(false);
          setEventStatus(prev => ({
            ...prev,
            status: "No tracking"
          }));
          
          // Mostrar notificación
          setToastMessage("🔒 Acceso bloqueado por el administrador");
          setShowToast(true);
          
          return; // No continuar con otras verificaciones
        }
        
        // Verificación normal del proxy (solo si no está bloqueado)
        if (!isProxyConnected && isProxyValid) {
          // Proxy se desconectó
          setIsProxyValid(false);
          setEventStatus(prev => ({
            ...prev,
            status: "No tracking"
          }));
          setToastMessage("⚠️ Proxy desactivado");
          setShowToast(true);

          // CRÍTICO: Si estamos grabando y el proxy se cae, detener inmediatamente
          // Esto cubre el caso donde el monitor del backend falla o tarda en detectar
          if (isRecording) {
            console.warn("⚠️ Proxy desconectado durante grabación - Deteniendo...");
            stopRecording();
          }
        } else if (isProxyConnected && !isProxyValid && !isBlocked) {
          // Proxy se reconectó (y no está bloqueado)
          setIsProxyValid(true);
          setEventStatus(prev => ({
            ...prev,
            status: "Tracking"
          }));
          setToastMessage("✅ Proxy reconectado");
          setShowToast(true);
        }
      } catch (error) {
        console.error('Error verificando estado:', error);
      }
    };

    initializeProxy();
    
    // Verificar proxy y bloqueo cada 10 segundos (reducido de 5 para menos carga)
    proxyCheckIntervalRef.current = setInterval(checkProxyAndBlockStatus, 10000);

    // IMPORTANTE: Listener para detectar manipulación del proxy
    const handleProxyTampering = (data: { reason: string; timestamp: string }) => {
      console.error('🚨 Proxy tampering detected in UI:', data);
      
      // Detener grabación inmediatamente
      if (isRecording) {
        stopRecording();
      }
      
      // Actualizar estado visual
      setIsRecording(false);
      setIsProxyValid(false);
      
      // Detener el timer local
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      isMonitoringActiveRef.current = false;
      
      // Mostrar toast corto
      setToastMessage("⚠️ Monitoreo detenido - Proxy modificado");
      setShowToast(true);
      
      // Actualizar estado del evento
      setEventStatus(prev => ({
        ...prev,
        status: "No tracking"
      }));
    };

    // Registrar el listener usando la API expuesta
    if (window.api?.onProxyTampering) {
      window.api.onProxyTampering(handleProxyTampering);
    }
    
    // Cleanup al desmontar - siempre retornar función de cleanup
    return () => {
      if (window.api?.removeProxyTamperingListener) {
        window.api.removeProxyTamperingListener();
      }
      
      // Limpiar intervalo de verificación del proxy
      if (proxyCheckIntervalRef.current) {
        clearInterval(proxyCheckIntervalRef.current);
        proxyCheckIntervalRef.current = null;
      }
    };
  }, [eventKey, isRecording, isProxyValid]);

  useEffect(() => {
    if (!window.api?.onAppClosing) return;

    const handleAppClosing = async () => {
      if (isAppClosingRef.current) return;
      isAppClosingRef.current = true;

      try {
        if (isRecording || isMonitoringActiveRef.current) {
          await stopRecording();
        }
      } catch (error) {
        console.error("Error during app closing cleanup:", error);
      } finally {
        window.api?.notifyAppClosingComplete?.();
      }
    };

    window.api.onAppClosing(handleAppClosing);

    return () => {
      window.api?.removeAppClosingListener?.();
    };
  }, [isRecording, mediaRecorder]);



  // Device and permission verification
  const checkMediaAccess = async () => {
    try {
      // Si ya tenemos un stream activo y funcionando, verificar su estado
      if (streamRef.current && streamRef.current.active) {
        const videoTracks = streamRef.current.getVideoTracks();
        const audioTracks = streamRef.current.getAudioTracks();
        
        // Verificar readyState, enabled y muted
        const videoTrack = videoTracks[0];
        const isCameraWorking = videoTrack !== undefined && 
                               videoTrack.readyState === "live" && 
                               videoTrack.enabled && 
                               !videoTrack.muted;
                               
        const audioTrack = audioTracks[0];
        const isMicWorking = audioTrack !== undefined && 
                            audioTrack.readyState === "live" && 
                            audioTrack.enabled && 
                            !audioTrack.muted;

        setHasCameraAccess(isCameraWorking);
        setHasMicrophoneAccess(isMicWorking);
      } else {
        // No hay stream activo, intentar crear uno de prueba para verificar disponibilidad real
        let testStream: MediaStream | null = null;
        try {
          // Intentar acceder a los dispositivos
          testStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

          const videoTracks = testStream.getVideoTracks();
          const audioTracks = testStream.getAudioTracks();

          // Verificar estado inicial de los tracks
          const videoTrack = videoTracks[0];
          const isCameraWorking = videoTrack !== undefined && 
                                 videoTrack.readyState === "live" && 
                                 !videoTrack.muted;
                                 
          const audioTrack = audioTracks[0];
          const isMicWorking = audioTrack !== undefined && 
                              audioTrack.readyState === "live" && 
                              !audioTrack.muted;

          setHasCameraAccess(isCameraWorking);
          setHasMicrophoneAccess(isMicWorking);

          if (!isMicWorking) {
             console.warn("Micrófono detectado pero está silenciado (muted)");
          }

          // Liberar el stream de prueba inmediatamente
          testStream.getTracks().forEach((track) => track.stop());
        } catch (deviceError: any) {
          console.error("Error accediendo a dispositivos:", deviceError);
          
          // Verificar el tipo de error
          if (deviceError.name === "NotReadableError" || 
              deviceError.name === "TrackStartError" ||
              deviceError.message?.includes("Could not start video source") ||
              deviceError.message?.includes("requested device not found")) {
            // La cámara/micrófono está siendo usada por otra aplicación o no está disponible
            console.warn("Dispositivos en uso por otra aplicación o no disponibles");
            setHasCameraAccess(false);
            setHasMicrophoneAccess(false);
          } else if (deviceError.name === "NotAllowedError" || deviceError.name === "PermissionDeniedError") {
            // Permiso denegado
            console.warn("Permiso de dispositivos denegado");
            setHasCameraAccess(false);
            setHasMicrophoneAccess(false);
          } else {
            // Otro tipo de error - asumir que no están disponibles
            console.warn("Error desconocido al acceder a dispositivos:", deviceError.name);
            setHasCameraAccess(false);
            setHasMicrophoneAccess(false);
          }

          // Limpiar si hay algún track
          if (testStream) {
            testStream.getTracks().forEach((track) => track.stop());
          }
        }
      }

      // Verificar pantalla
      const screenInfo = await window.api.getScreenInfo();
      setDisplayCount(screenInfo.displayCount);
      setHasScreenAccess(screenInfo.hasPermission);

    } catch (error) {
      console.error("Error verificando dispositivos:", error);
      setHasCameraAccess(false);
      setHasMicrophoneAccess(false);
    }
  };

  // Recargar y verificar todo: permisos y conexión proxy
  const handleReload = async () => {
    try {
      // Mostrar estado de carga
      setEventStatus(prev => ({
        ...prev,
        status: "Loading..."
      }));

      // Detener stream actual si existe
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Verificar permisos de medios
      await checkMediaAccess();

      // Reiniciar captura de medios para mostrar el video nuevamente
      await startMediaCapture();

      // Reintentar conexión del proxy
      const verification = await window.api.verifyEventKey(eventKey);
      
      if (verification) {
        await window.api.startProxy();
        const isProxyConnected = await window.api.isProxySetup();

        setEventStatus({
          name: verification.event.name || "Unknown Event",
          status: isProxyConnected ? "Tracking" : "No tracking",
          user: {
            email: verification.participant.email,
            name: verification.participant.name,
          },
        });
      } else {
        setEventStatus({
          name: "Unknown Event",
          status: "No tracking",
          user: undefined,
        });
      }
    } catch (error) {
      console.error("Error recargando estado:", error);
      setEventStatus({
        name: "Unknown Event",
        status: "No tracking",
        user: undefined,
      });
    }
  };

  const blobToArrayBuffer = async (blob: Blob): Promise<ArrayBuffer> => {
    return await blob.arrayBuffer();
  };

  // Función compartida para detener el monitoreo (usada tanto manualmente como automáticamente)
  const stopRecording = async () => {
    // Verificar tanto el estado como la referencia para evitar problemas de clausura
    if (!mediaRecorder || (!isRecording && !isMonitoringActiveRef.current)) {
      return;
    }

    // Prevenir múltiples clicks - si ya está deteniendo, retornar inmediatamente
    if (isStopping) {
      console.log('⏸️ Ya está deteniendo, ignorando click adicional');
      return;
    }

    try {
      // ✅ MARCAR COMO "DETENIENDO" INMEDIATAMENTE (antes de cualquier operación)
      setIsStopping(true);

      // Stop local timer immediately so countdown pauses while uploads finish
      isMonitoringActiveRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      // Stop creating new logs locally
      window.api.stopCaptureInterval();

      // Usar la función personalizada de cleanup
      if (mediaRecorder && typeof (mediaRecorder as any).stopAndUpload === 'function') {
        await (mediaRecorder as any).stopAndUpload();
      }

      // Ahora que el upload terminó, avisar al backend para finalizar sesión
      try {
        await window.api.stopMonitoring();
      } catch (err) {
        console.error("Failed to stop monitoring:", err);
      }

      // DESPUÉS de que el backend actualizó, sincronizar el timer
      await stopLocalTimer();
    } catch (err) {
      console.error('Error stopping capture:', err);
    } finally {
      // ✅ SIEMPRE limpiar los estados al final
      setIsRecording(false);
      setIsStopping(false);
    }
  };

  const toggleRecording = async () => {
    if (!mediaRecorder) {
      console.error("MediaRecorder not initialized");
      return;
    }

    if (isRecording) {
      await stopRecording();
    } else {
      // Validar permisos y proxy antes de iniciar
      if (!hasCameraAccess || !hasMicrophoneAccess) {
        setToastMessage("⚠️ Verifica permisos de cámara y micrófono");
        setShowToast(true);
        return;
      }

      if (!isProxyValid) {
        setToastMessage("⚠️ Proxy no válido - Reinicia la aplicación");
        setShowToast(true);
        return;
      }

      // Iniciar monitoreo primero, luego la grabación
      try {
        console.log("🔍 Verificando proxy antes de iniciar monitoreo...");
        
        const monitoringStarted = await window.api.startMonitoring();
        
        if (monitoringStarted) {
          window.api.startCaptureInterval();
          
          // Iniciar el contador local del timer
          startLocalTimer();
          
          // Solo iniciar grabación si el monitoreo se inició correctamente
          if (typeof (mediaRecorder as any).startCustomRecording === 'function') {
            (mediaRecorder as any).startCustomRecording();
          }
          
          // IMPORTANTE: Actualizar el estado visual
          setIsRecording(true);
          console.log("✅ Monitoreo y grabación iniciados correctamente");
        } else {
          console.error("❌ Failed to start monitoring - backend returned false");
          setIsProxyValid(false);
          setToastMessage("⚠️ No se puede iniciar - Proxy no válido");
          setShowToast(true);
        }
      } catch (err) {
        console.error("❌ Failed to start monitoring:", err);
        setToastMessage("⚠️ Error de conexión con el servidor");
        setShowToast(true);
      }
    }
  };

  const startMediaCapture = async () => {
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm; codecs=vp9")
        ? "video/webm; codecs=vp9"
        : "video/webm";

      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Monitorear el estado de los tracks en tiempo real
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      // Verificación inicial inmediata del estado de los tracks
      const videoTrack = videoTracks[0];
      const isCameraWorking = videoTrack !== undefined && 
                             videoTrack.readyState === "live" && 
                             !videoTrack.muted;
                             
      const audioTrack = audioTracks[0];
      const isMicWorking = audioTrack !== undefined && 
                          audioTrack.readyState === "live" && 
                          !audioTrack.muted;

      setHasCameraAccess(isCameraWorking);
      setHasMicrophoneAccess(isMicWorking);

      if (!isMicWorking) {
        console.warn("Micrófono iniciado pero está silenciado (muted)");
        setToastMessage("⚠️ Tu micrófono está silenciado o en uso");
        setShowToast(true);
      }

      // Listener para detectar cuando se detiene el video
      videoTracks.forEach(track => {
        track.onended = async () => {
          console.warn("Video track terminado - cámara desconectada o en uso");
          setHasCameraAccess(false);
          setToastMessage("⚠️ Cámara desconectada");
          setShowToast(true);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onmute = async () => {
          console.warn("Video track muteado");
          setHasCameraAccess(false);
          setToastMessage("⚠️ Cámara en uso por otra aplicación");
          setShowToast(true);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onunmute = () => {
          console.log("Video track desmuteado");
          setHasCameraAccess(true);
        };
      });

      // Listener para detectar cuando se detiene el audio
      audioTracks.forEach(track => {
        track.onended = async () => {
          console.warn("Audio track terminado - micrófono desconectado o en uso");
          setHasMicrophoneAccess(false);
          setToastMessage("⚠️ Micrófono desconectado");
          setShowToast(true);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onmute = async () => {
          console.warn("Audio track muteado");
          setHasMicrophoneAccess(false);
          setToastMessage("⚠️ Micrófono en uso por otra aplicación");
          setShowToast(true);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onunmute = () => {
          console.log("Audio track desmuteado");
          setHasMicrophoneAccess(true);
        };
      });

      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      };

      let currentRecorder = new MediaRecorder(stream, recorderOptions);
      let uploadCounter = 0;
      let recordingTimer: NodeJS.Timeout | null = null;
      
      // Función para finalizar grabación actual y subir video
      const finishCurrentRecording = async () => {
        return new Promise<void>((resolve) => {
          if (!currentRecorder || currentRecorder.state === 'inactive') {
            resolve();
            return;
          }
          
          uploadCounter++;
          const currentUpload = uploadCounter;
          console.log(`[VIDEO] Finalizando grabación #${currentUpload}`);
          
          // Listener para cuando se complete la grabación
          const handleDataAvailable = async (e: BlobEvent) => {
            currentRecorder.removeEventListener('dataavailable', handleDataAvailable);
            
            if (e.data.size > 0) {
              try {
                console.log(`[VIDEO] Video #${currentUpload} generado: ${(e.data.size / 1024).toFixed(2)} KB`);
                
                const arrayBuffer = await blobToArrayBuffer(e.data);
                await window.api.uploadMedia(arrayBuffer);
                
                console.log(`[VIDEO] Upload #${currentUpload} completado exitosamente`);
              } catch (error) {
                console.error(`[VIDEO] Error en upload #${currentUpload}:`, error);
              }
            }
            resolve();
          };
          
          currentRecorder.addEventListener('dataavailable', handleDataAvailable);
          currentRecorder.stop();
        });
      };
      
      // Función para iniciar nueva grabación
      const startNewRecording = () => {
        if (stream.active) {
          currentRecorder = new MediaRecorder(stream, recorderOptions);
          currentRecorder.start();
          console.log(`[VIDEO] Nueva grabación iniciada #${uploadCounter + 1}`);
        }
      };
      
      // Funcion para manejar el ciclo de grabaciones cada 3 minutos
      const scheduleNextRecording = () => {
        recordingTimer = setTimeout(async () => {
          await finishCurrentRecording();
          startNewRecording();
          scheduleNextRecording(); // Programar la siguiente
        }, 3 * 60 * 1000); // 3 minutos
      };
      
      // Manejar finalización del monitoreo
      const handleMonitoringStop = async () => {
        console.log('[VIDEO] Deteniendo monitoreo...');
        
        // Cancelar timer de grabaciones futuras
        if (recordingTimer) {
          clearTimeout(recordingTimer);
          recordingTimer = null;
        }
        
        // Finalizar grabación actual
        await finishCurrentRecording();
        console.log('[VIDEO] Monitoreo detenido completamente');
      };
      
      // Función para iniciar el ciclo de grabación (se llamará desde toggleRecording)
      (currentRecorder as any).startCustomRecording = () => {
        if (stream.active) {
          currentRecorder.start();
          console.log('[VIDEO] Primera grabacion iniciada, ciclo cada 3 minutos');
          scheduleNextRecording();
          setIsRecording(true);
        }
      };

      // Guardar referencia para cleanup con función personalizada
      (currentRecorder as any).stopAndUpload = handleMonitoringStop;
      setMediaRecorder(currentRecorder);
      
      // Como ya tenemos el stream activo, marcamos como disponible
      setHasCameraAccess(true);
      setHasMicrophoneAccess(true);
      console.log("MediaCapture initialized, ready to start recording");
    } catch (error: any) {
      console.error("Error accessing devices:", error);
      
      // Determinar el motivo del error y mostrar mensaje apropiado
      if (error.name === "NotReadableError" || 
          error.name === "TrackStartError" ||
          error.message?.includes("Could not start video source") ||
          error.message?.includes("requested device not found")) {
        console.error("Dispositivos en uso por otra aplicación o no disponibles");
      } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        console.error("Permiso de dispositivos denegado por el usuario");
      } else {
        console.error("Error desconocido:", error.name, error.message);
      }
      
      setHasCameraAccess(false);
      setHasMicrophoneAccess(false);
    }
  };

  // Efecto para monitorear permisos constantemente durante la grabación
  useEffect(() => {
    if (!isRecording) return;

    const monitorInterval = setInterval(async () => {
      // Verificar el estado actual de los tracks del stream
      if (streamRef.current && streamRef.current.active) {
        const videoTracks = streamRef.current.getVideoTracks();
        const audioTracks = streamRef.current.getAudioTracks();
        
        // Verificar readyState, enabled y muted (consistente con checkMediaAccess)
        const videoTrack = videoTracks[0];
        const cameraActive = videoTrack !== undefined && 
                            videoTrack.readyState === "live" && 
                            videoTrack.enabled && 
                            !videoTrack.muted;
                            
        const audioTrack = audioTracks[0];
        const micActive = audioTrack !== undefined && 
                         audioTrack.readyState === "live" && 
                         audioTrack.enabled && 
                         !audioTrack.muted;

        // Si alguno de los permisos se perdió, detener el monitoreo
        if (!cameraActive || !micActive) {
          console.warn(`Dispositivos perdidos durante grabación: Cam=${cameraActive}, Mic=${micActive}`);
          setHasCameraAccess(cameraActive);
          setHasMicrophoneAccess(micActive);
          
          if (!micActive) setToastMessage("⚠️ Micrófono silenciado o desconectado");
          else if (!cameraActive) setToastMessage("⚠️ Cámara desconectada o en uso");
          
          setShowToast(true);
          await stopRecording();
        }
      }
    }, 1000); // Verificar cada 1s (menos agresivo que 500ms)

    return () => {
      clearInterval(monitorInterval);
    };
  }, [isRecording, mediaRecorder]);

  useEffect(() => {
    let cameraPermissionStatus: PermissionStatus;
    let microphonePermissionStatus: PermissionStatus;

    const setupPermissions = async () => {
      try {
        cameraPermissionStatus = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });
        microphonePermissionStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });

        cameraPermissionStatus.onchange = checkMediaAccess;
        microphonePermissionStatus.onchange = checkMediaAccess;
      } catch (error) {
        console.error("Error configurando listeners de permisos:", error);
      }
    };

    // Listener para detectar cuando se conectan/desconectan dispositivos
    const handleDeviceChange = async () => {
      console.log("Cambio en dispositivos detectado");
      await checkMediaAccess();
    };

    // Agregar listener de cambios en dispositivos
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    checkMediaAccess();
    setupPermissions();
    startMediaCapture();

    return () => {
      // Cleanup al desmontar el componente
      if (mediaRecorder) {
        try {
          window.api.stopCaptureInterval();
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        } catch (err) {
          console.error("Error en cleanup:", err);
        }
      }
      
      streamRef.current?.getTracks().forEach((track) => track.stop());
      
      cameraPermissionStatus?.onchange &&
        (cameraPermissionStatus.onchange = null);
      microphonePermissionStatus?.onchange &&
        (microphonePermissionStatus.onchange = null);
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  // Rendering status icons
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case "Tracking":
        return <FaCheckCircle className="text-green-500" />;
      case "No tracking":
        return <FaTimesCircle className="text-red-500" />;
      case "Loading...":
        return (
          <div className="h-4 w-4 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        );
      default:
        return null;
    }
  };

  // Handle activity exit
  const handleExitActivity = async () => {
    if (isExiting) {
      console.log('⏸️ Ya está regresando, ignorando click adicional');
      return;
    }

    try {
      // ✅ Marcar como "regresando" inmediatamente
      setIsExiting(true);
      
      // Llamar a onExit (puede tomar 3-5 segundos)
      await onExit();
    } catch (error) {
      console.error('Error al regresar:', error);
      // En caso de error, igual volver al estado normal
      setIsExiting(false);
    }
    // No necesitamos finally aquí porque onExit cambia de página
  };

  const isTimeExhausted = remainingSeconds !== null && remainingSeconds <= 0;
  const isStartDisabled = !isRecording && (
    !hasCameraAccess || 
    !hasMicrophoneAccess || 
    !hasScreenAccess || 
    !isProxyValid || 
    eventStatus.status === "No tracking" ||
    isTimeExhausted
  );
  
  // Deshabilitar el botón de detener si ya está en proceso de detención
  const isStopDisabled = isStopping;
  
  // Deshabilitar el botón de regresar si está en proceso
  const isExitDisabled = isExiting || isRecording || isStopping;

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col bg-gray-800">
      <CustomTitleBar title="Sistema de Monitoreo - Captura de Medios" />
      <div className="flex-1 overflow-auto">
        <div className="flex h-full w-full items-center justify-center p-4">
          {/* Unified main container */}
          <div className="w-full max-w-[260px] mx-auto">
          <div className="relative w-full">
            {/* Centered label */}
            <div className="absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-gray-600 bg-gray-800 px-3 py-1 text-xs whitespace-nowrap text-white z-30">
              <span>{eventStatus.name || "Event Loading..."}</span>
              {renderStatusIcon(eventStatus?.status || "")}
            </div>

            {/* Event details overlay */}
            {showEventDetails && (
              <div className="absolute top-0 left-0 z-20 h-full w-full rounded-xl bg-gray-800/95 p-3 backdrop-blur-sm">
                <div className="relative h-full text-xs text-white">
                  <button
                    onClick={() => setShowEventDetails(false)}
                    className="absolute top-1 right-1 rounded-full p-1.5 hover:bg-gray-700 transition-colors"
                  >
                    <FaTimes size={14} />
                  </button>
                  <h2 className="mb-4 text-center">Event Details</h2>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <span className="mr-2 w-20">Status:</span>
                      <div className="flex items-center">
                        <span className="mr-2 text-gray-400">
                          {eventStatus?.status}
                        </span>
                        {renderStatusIcon(eventStatus?.status || "")}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="mr-2 w-20">Username:</span>
                      <span className="text-gray-400">
                        {eventStatus.user?.name || "Loading..."}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="mr-2 w-20">Email:</span>
                      <span className="text-gray-400">
                        {eventStatus.user?.email || "Loading..."}
                      </span>
                    </div>
                    {renderTimerInModal()}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border-2 border-gray-600 overflow-hidden relative">
              <video ref={videoRef} autoPlay muted className="rounded-xl w-full h-auto" />
              
              {/* Guía de rostro superpuesta */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img 
                  src={guiaRostro} 
                  alt="Guía de posicionamiento" 
                  className="w-[90%] h-[90%] object-contain opacity-40"
                />
              </div>
            </div>

            {/* Top-left info button and timer */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              <button
                onClick={() => setShowEventDetails(!showEventDetails)}
                className="rounded-full border border-gray-600 bg-gray-800/80 p-1.5 text-white backdrop-blur-sm transition-all hover:bg-gray-700/90 hover:scale-110"
              >
                <FaInfoCircle size={12} />
              </button>
              {renderCompactTimer()}
            </div>

            {/* Top-right reload button */}
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={handleReload}
                className="rounded-full border border-gray-600 bg-gray-800/80 p-1.5 text-white backdrop-blur-sm transition-all hover:bg-gray-700/90 hover:scale-110"
              >
                <FaSyncAlt size={12} />
              </button>
            </div>

            {/* Bottom floating button container */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-gray-600 bg-gray-800/80 px-1 py-2 backdrop-blur-sm">
              <div className="flex gap-2">
                <div
                  className={`rounded-full border-2 p-2 ${
                    hasMicrophoneAccess
                      ? "border-green-500 text-green-500"
                      : "border-red-500 text-red-500"
                  }`}
                >
                  <FaMicrophone size={10} />
                </div>

                <div
                  className={`rounded-full border-2 p-2 ${
                    hasCameraAccess
                      ? "border-green-500 text-green-500"
                      : "border-red-500 text-red-500"
                  }`}
                >
                  <FaVideo size={10} />
                </div>

                <div
                  className={`relative rounded-full border-2 p-2 ${
                    hasScreenAccess
                      ? "border-green-500 text-green-500"
                      : "border-red-500 text-red-500"
                  }`}
                >
                  <FaDesktop size={10} />
                  {displayCount > 0 && (
                    <span className="absolute -top-2 -right-2 rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-white">
                      {displayCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex w-full flex-col gap-2">
            <button
              onClick={toggleRecording}
              disabled={isStartDisabled || isStopDisabled}
              className={`w-full rounded-md py-2 px-3 text-sm font-semibold transition-all transform flex items-center justify-center gap-2 shadow-lg ${
                isRecording
                  ? isStopping
                    ? "bg-orange-600 text-white cursor-wait"
                    : "bg-red-600 text-white hover:bg-red-700 hover:scale-105"
                  : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105"
              } ${(isStartDisabled || isStopDisabled) && "cursor-not-allowed opacity-50 hover:scale-100"}`}
            >
              {isRecording ? (
                isStopping ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Deteniendo...
                  </>
                ) : (
                  <>
                    <FaTimesCircle size={14} />
                    Detener monitoreo
                  </>
                )
              ) : (
                <>
                  <FaRegPlayCircle size={14} />
                  {isTimeExhausted ? "Tiempo Agotado" : "Empezar monitoreo"}
                </>
              )}
            </button>
            <button
              onClick={handleExitActivity}
              disabled={isExitDisabled}
              className={`w-full rounded-md py-2 px-3 text-sm font-semibold transition-all transform flex items-center justify-center gap-2 shadow-lg
                ${isExiting 
                  ? "bg-orange-600 text-white cursor-wait" 
                  : (isRecording || isStopping) 
                    ? "bg-gray-500 cursor-not-allowed opacity-50" 
                    : "bg-gray-600 text-white hover:bg-gray-700 hover:scale-105"
                }
                ${isExitDisabled && "cursor-not-allowed opacity-50 hover:scale-100"}
                `}
            >
              {isExiting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Regresando...
                </>
              ) : (
                <>
                  <FaBackspace size={14} />
                  Regresar
                </>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={toastMessage}
          onClose={() => setShowToast(false)}
          duration={3000}
        />
      )}
    </div>
  );
};
export default MediaCapture;
