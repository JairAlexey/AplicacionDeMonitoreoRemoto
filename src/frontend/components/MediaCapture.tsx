import React, { useEffect, useRef, useState } from "react";
import {
  FaCheckCircle,
  FaDesktop,
  FaMicrophone,
  FaTimesCircle,
  FaVideo,
  FaInfoCircle,
  FaRegPlayCircle,
  FaBackspace,
  FaTimes,
  FaSyncAlt,
} from "react-icons/fa";
import CustomTitleBar from "./ui/CustomTitleBar";
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

const MediaCapture: React.FC<JoinEventFormProps> = ({ eventKey, onExit }) => {
  // Refs and state for media capture
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const [showEventDetails, setShowEventDetails] = useState(false);

  // Shared state
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState(false);
  const [hasScreenAccess, setHasScreenAccess] = useState(false);
  const [displayCount, setDisplayCount] = useState(0);

  // Event state
  const [eventStatus, setEventStatus] = useState<EventStatus>({
    name: undefined,
    status: "Loading...",
    user: undefined,
  });





  // Initial event and proxy verification
  useEffect(() => {
    const initializeProxy = async () => {
      try {
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
          

        }
      } catch (error) {
        setEventStatus({
          name: "Unknown Event",
          status: "No tracking",
          user: undefined,
        });
      }
    };

    initializeProxy();
  }, [eventKey]);



  // Device and permission verification
  const checkMediaAccess = async () => {
    try {
      // Si ya tenemos un stream activo y funcionando, verificar su estado
      if (streamRef.current && streamRef.current.active) {
        const videoTracks = streamRef.current.getVideoTracks();
        const audioTracks = streamRef.current.getAudioTracks();
        
        setHasCameraAccess(videoTracks.length > 0 && videoTracks[0]?.readyState === "live");
        setHasMicrophoneAccess(audioTracks.length > 0 && audioTracks[0]?.readyState === "live");
      } else {
        // No hay stream activo, intentar crear uno de prueba para verificar disponibilidad real
        let testStream: MediaStream | null = null;
        try {
          // Intentar acceder a los dispositivos
          testStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          // Si llegamos aquí, los dispositivos están disponibles y no están siendo usados
          setHasCameraAccess(true);
          setHasMicrophoneAccess(true);

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
    if (!mediaRecorder || !isRecording) {
      return;
    }

    try {
      // Stop creating new logs locally
      window.api.stopCaptureInterval();

      // Si tiene la función personalizada de cleanup, usarla
      if ((mediaRecorder as any).stopAndUpload) {
        await (mediaRecorder as any).stopAndUpload();
      } else {
        // Fallback al comportamiento original
        await new Promise<void>((resolve) => {
          const originalOnStop = mediaRecorder.onstop;
          mediaRecorder.onstop = async (e: any) => {
            try {
              if (originalOnStop) await (originalOnStop as any)(e);
            } catch (err) {
              console.error('Error in original onstop:', err);
            } finally {
              resolve();
            }
          };
          
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          } else {
            resolve();
          }
        });
      }

      // Ahora que el upload terminó, avisar al backend para finalizar sesión
      try {
        await window.api.stopMonitoring();
      } catch (err) {
        console.error("Failed to stop monitoring:", err);
      }
    } catch (err) {
      console.error('Error stopping capture:', err);
    }

    setIsRecording(false);
  };

  const toggleRecording = async () => {
    if (!mediaRecorder) {
      console.error("MediaRecorder not initialized");
      return;
    }

    if (isRecording) {
      await stopRecording();
    } else {
      // Iniciar monitoreo primero, luego la grabación
      try {
        const monitoringStarted = await window.api.startMonitoring();
        
        if (monitoringStarted) {
          window.api.startCaptureInterval();
          
          // Solo iniciar grabación si el monitoreo se inició correctamente
          if ((mediaRecorder as any).startCustomRecording) {
            (mediaRecorder as any).startCustomRecording();
          }
          
          // IMPORTANTE: Actualizar el estado visual
          setIsRecording(true);
          console.log("Monitoreo y grabación iniciados correctamente");
        } else {
          console.error("Failed to start monitoring - backend returned false");
          alert("Error: No se pudo iniciar el monitoreo en el servidor");
        }
      } catch (err) {
        console.error("Failed to start monitoring:", err);
        alert("Error: Falló al iniciar el monitoreo");
      }
    }
  };

  const startMediaCapture = async () => {
    try {
      const mimeType = MediaRecorder.isTypeSupported("video/webm; codecs=vp9")
        ? "video/webm; codecs=vp9"
        : "video/webm";

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Monitorear el estado de los tracks en tiempo real
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      // Listener para detectar cuando se detiene el video
      videoTracks.forEach(track => {
        track.onended = async () => {
          console.warn("Video track terminado - cámara desconectada o en uso");
          setHasCameraAccess(false);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onmute = async () => {
          console.warn("Video track muteado");
          setHasCameraAccess(false);
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
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onmute = async () => {
          console.warn("Audio track muteado");
          setHasMicrophoneAccess(false);
          // Detener monitoreo si estaba activo
          await stopRecording();
        };
        
        track.onunmute = () => {
          console.log("Audio track desmuteado");
          setHasMicrophoneAccess(true);
        };
      });

      let currentRecorder = new MediaRecorder(stream, { mimeType });
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
          currentRecorder = new MediaRecorder(stream, { mimeType });
          currentRecorder.start();
          console.log(`[VIDEO] Nueva grabación iniciada #${uploadCounter + 1}`);
        }
      };
      
      // Función para manejar el ciclo de grabaciones cada 5 minutos
      const scheduleNextRecording = () => {
        recordingTimer = setTimeout(async () => {
          await finishCurrentRecording();
          startNewRecording();
          scheduleNextRecording(); // Programar la siguiente
        }, 5 * 60 * 1000); // 5 minutos
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
          console.log('[VIDEO] Primera grabación iniciada, ciclo cada 5 minutos');
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
        
        const cameraActive = videoTracks.length > 0 && videoTracks[0]?.readyState === "live";
        const micActive = audioTracks.length > 0 && audioTracks[0]?.readyState === "live";

        // Si alguno de los permisos se perdió, detener el monitoreo
        if (!cameraActive || !micActive) {
          console.warn("Permisos perdidos durante la grabación - deteniendo monitoreo");
          setHasCameraAccess(cameraActive);
          setHasMicrophoneAccess(micActive);
          await stopRecording();
        }
      }
    }, 500); // Verificar cada 500ms

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

    // Listener para el cierre de la aplicación - NO HACE NADA
    // El cleanup se maneja en el main process
    const handleAppClosing = () => {
      console.log("[RENDERER] App closing signal recibido");
      // El main process ya se encarga de todo el cleanup
    };

    if (window.api.onAppClosing) {
      window.api.onAppClosing(handleAppClosing);
    }

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
  const handleExitActivity = () => {
    // Llamar directamente a onExit que ahora es simple y rapido
    onExit();
  };

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

            {/* Top-left info button */}
            <div className="absolute top-2 left-2 z-10">
              <button
                onClick={() => setShowEventDetails(!showEventDetails)}
                className="rounded-full border border-gray-600 bg-gray-800/80 p-1.5 text-white backdrop-blur-sm transition-all hover:bg-gray-700/90 hover:scale-110"
              >
                <FaInfoCircle size={12} />
              </button>
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
              disabled={
                // Solo deshabilitar para EMPEZAR si no hay permisos, pero siempre permitir DETENER
                !isRecording && (!hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess || eventStatus.status === "No tracking")
              }
              className={`w-full rounded-md py-2 px-3 text-sm font-semibold transition-all transform flex items-center justify-center gap-2 shadow-lg ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700 hover:scale-105"
                  : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105"
              } ${(!isRecording && (!hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess || eventStatus.status === "No tracking")) && "cursor-not-allowed opacity-50 hover:scale-100"}`}
            >
              {isRecording ? (
                <>
                  <FaTimesCircle size={14} />
                  Detener monitoreo
                </>
              ) : (
                <>
                  <FaRegPlayCircle size={14} />
                  Empezar monitoreo
                </>
              )}
            </button>
            <button
              onClick={handleExitActivity}
              disabled={isRecording}
              className={`w-full rounded-md py-2 px-3 text-sm font-semibold transition-all transform flex items-center justify-center gap-2 shadow-lg
                ${isRecording ? "bg-gray-500 cursor-not-allowed opacity-50" : "bg-gray-600 text-white hover:bg-gray-700 hover:scale-105"}
                `}
            >
              <FaBackspace size={14} />
              Regresar
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
export default MediaCapture;
