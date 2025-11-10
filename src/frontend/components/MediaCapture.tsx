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
} from "react-icons/fa";

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
      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameraPermission = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      const hasCamera =
        cameraPermission.state === "granted" &&
        devices.some((d) => d.kind === "videoinput" && d.label !== "");

      const micPermission = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      const hasMic =
        micPermission.state === "granted" &&
        devices.some((d) => d.kind === "audioinput" && d.label !== "");

      const screenInfo = await window.api.getScreenInfo();
      setDisplayCount(screenInfo.displayCount);
      setHasScreenAccess(screenInfo.hasPermission);

      setHasCameraAccess(hasCamera);
      setHasMicrophoneAccess(hasMic);
    } catch (error) {
      console.error("Error verificando dispositivos:", error);
      setHasCameraAccess(false);
      setHasMicrophoneAccess(false);
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
        window.api.unregisterAllKeys();
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
      window.api.registerAllKeys();
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
      await checkMediaAccess();
    } catch (error) {
      console.error("Error accessing devices:", error);
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
    <div className="mt-4 bg-gray-800">
      <div className="flex h-screen w-full items-center justify-center">
        {/* Unified main container */}
        <div className="w-full max-w-2xl">
          <div className="relative inline-block">
            {/* Centered label */}
            <div className="absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-gray-600 bg-gray-800 px-3 py-1 text-xs whitespace-nowrap text-white">
              <span>{eventStatus.name || "Event Loading..."}</span>
              {renderStatusIcon(eventStatus?.status || "")}
            </div>

            {/* Event details overlay */}
            {showEventDetails && (
              <div className="absolute top-0 left-0 z-20 h-full w-full rounded-xl bg-gray-800/90 p-4 backdrop-blur-sm">
                <div className="relative h-full text-xs text-white">
                  <button
                    onClick={() => setShowEventDetails(false)}
                    className="absolute top-2 right-2 rounded-full p-1 hover:bg-gray-700"
                  >
                    <FaTimes size={16} />
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

            <div className="rounded-xl border-2 border-gray-600">
              <video ref={videoRef} autoPlay muted className="rounded-xl" />
            </div>

            {/* Top-left info button */}
            <div className="absolute top-3 left-2 z-10">
              <button
                onClick={() => setShowEventDetails(!showEventDetails)}
                className="rounded-full border border-gray-600 bg-gray-800/80 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-gray-700/90"
              >
                <FaInfoCircle size={14} />
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
          <div className="mt-6 flex w-full gap-2">
            <button
              onClick={handleExitActivity}
              className="flex w-full items-center justify-center rounded-lg bg-red-500 py-2 text-xs text-white transition-colors hover:bg-red-600"
            >
              <FaBackspace className="mr-2" size={15} />
              Regresar
            </button>
            <button
              onClick={toggleRecording}
              disabled={
                !hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess
              }
              className={`w-full rounded-lg py-2 text-xs transition-colors ${
                isRecording
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              } ${(!hasCameraAccess || !hasMicrophoneAccess || !hasScreenAccess) && "cursor-not-allowed opacity-50"}`}
            >
              {isRecording ? (
                <>
                  <FaTimesCircle className="mr-2 inline-block" size={15} />
                  Stop
                </>
              ) : (
                <>
                  <FaRegPlayCircle className="mr-2 inline-block" size={15} />
                  Empezar monitoreo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MediaCapture;
