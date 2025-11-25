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
  const chunksRef = useRef<Blob[]>([]);

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

  const toggleRecording = async () => {
    if (!mediaRecorder) {
      console.error("MediaRecorder not initialized");
      return;
    }

    if (isRecording) {
      // Stop capture first and wait until the onstop handler (which uploads media)
      // completes. Only then notify backend to stop monitoring so the final
      // media upload is accepted.
      try {
        // Stop creating new logs locally
        window.api.stopCaptureInterval();

        // Wrap the existing onstop to detect upload completion
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
          mediaRecorder.stop();
        });

        // Ahora que el upload (si hubo) terminó, avisar al backend para finalizar sesión
        try {
          await window.api.stopMonitoring();
        } catch (err) {
          console.error("Failed to stop monitoring:", err);
        }
      } catch (err) {
        console.error('Error stopping capture:', err);
      }

      setIsRecording(false);
    } else {
      // Start monitoring on the backend so logs are accepted and timer begins
      try {
        await window.api.startMonitoring();
      } catch (err) {
        console.error("Failed to start monitoring:", err);
        // Continue locally but server may reject logs until monitoring is started
      }

      window.api.startCaptureInterval();
      chunksRef.current = [];
      mediaRecorder.start(1000);
      setIsRecording(true);
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

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const arrayBuffer = await blobToArrayBuffer(blob);
          await window.api.uploadMedia(arrayBuffer);
          chunksRef.current = [];
        }
      };

      setMediaRecorder(recorder);
      
      // Como ya tenemos el stream activo, marcamos como disponible
      setHasCameraAccess(true);
      setHasMicrophoneAccess(true);
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

    checkMediaAccess();
    setupPermissions();
    startMediaCapture();

    return () => {
      mediaRecorder?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      cameraPermissionStatus?.onchange &&
        (cameraPermissionStatus.onchange = null);
      microphonePermissionStatus?.onchange &&
        (microphonePermissionStatus.onchange = null);
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
    onExit();
    window.api.stopProxy();
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
                !hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess || eventStatus.status === "No tracking"
              }
              className={`w-full rounded-md py-2 px-3 text-sm font-semibold transition-all transform flex items-center justify-center gap-2 shadow-lg ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700 hover:scale-105"
                  : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105"
              } ${(!hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess || eventStatus.status === "No tracking") && "cursor-not-allowed opacity-50 hover:scale-100"}`}
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
