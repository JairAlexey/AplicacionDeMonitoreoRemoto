import React, { useState, useEffect } from "react";
import "./index.css";
import JoinEventForm from "./components/JoinEventForm";
import MediaCapture from "./components/MediaCapture";
import ConsentForm from "./components/ConsentForm";

const App = () => {
  const [eventKey, setEventKey] = useState("");
  const [tempEventKey, setTempEventKey] = useState("");
  const [isExiting, setIsExiting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [consentData, setConsentData] = useState<{
    eventName: string;
    eventDescription: string;
    participantName: string;
  } | null>(null);

  // Notificar a Electron que React está listo
  useEffect(() => {
    window.api.appReady();
  }, []);

  const handleConsentRequired = (data: { eventName: string; eventDescription: string; participantName: string }, key: string) => {
    setConsentData(data);
    setTempEventKey(key);
    setShowConsent(true);
  };

  const handleConsentAccepted = async () => {
    if (!tempEventKey) return;
    
    try {
      // Registrar el consentimiento en el backend
      const result = await window.api.registerConsent(tempEventKey);
      
      if (result.success) {
        // Consentimiento registrado exitosamente
        await window.api.joinEvent(tempEventKey);
        setEventKey(tempEventKey);
        setShowConsent(false);
        setTempEventKey("");
      } else {
        throw new Error(result.error || 'Error al registrar consentimiento');
      }
    } catch (error) {
      console.error('Error registrando consentimiento:', error);
      throw error;
    }
  };

  const handleConsentDeclined = () => {
    setShowConsent(false);
    setEventKey("");
    setTempEventKey("");
    setConsentData(null);
  };

  const handleExit = async () => {
    // Evitar múltiples ejecuciones
    if (isExiting) {
      console.log('🔄 Ya saliendo, evitando duplicacion...');
      return;
    }
    
    setIsExiting(true);
    
    try {
      console.log('🔄 Usuario presiono regresar, limpiando sistema...');
      
      // OPTIMIZACIÓN: Ejecutar limpieza con timeouts para no bloquear UI
      const cleanupWithTimeout = async () => {
        // 1. Detener monitoreo (timeout de 2s)
        try {
          await Promise.race([
            window.api.stopMonitoring(),
            new Promise((resolve) => setTimeout(resolve, 2000))
          ]);
          console.log('✅ Monitoreo detenido');
        } catch (err) {
          console.warn('⚠️ Timeout deteniendo monitoreo:', err);
        }
        
        // 2. Detener proxy (timeout de 2s)
        try {
          await Promise.race([
            window.api.stopProxy(),
            new Promise((resolve) => setTimeout(resolve, 2000))
          ]);
          console.log('✅ Proxy detenido');
        } catch (err) {
          console.warn('⚠️ Timeout deteniendo proxy:', err);
        }
        
        // 3. Limpiar configuración del sistema (timeout de 1s)
        try {
          await Promise.race([
            window.api.unsetProxySettings(),
            new Promise((resolve) => setTimeout(resolve, 1000))
          ]);
          console.log('✅ Configuración limpiada');
        } catch (err) {
          console.warn('⚠️ Timeout limpiando configuración:', err);
        }
      };
      
      // Ejecutar limpieza completa con timeout global de 5s
      await Promise.race([
        cleanupWithTimeout(),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);
      
      console.log('✅ Sistema limpiado correctamente');
    } catch (error) {
      console.error('❌ Error en limpieza:', error);
    } finally {
      // SIEMPRE volver al formulario principal
      setEventKey("");
      setShowConsent(false);
      setConsentData(null);
      setIsExiting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-800 p-6">
      {showConsent && consentData ? (
        <ConsentForm
          eventName={consentData.eventName}
          eventDescription={consentData.eventDescription}
          participantName={consentData.participantName}
          onAccept={handleConsentAccepted}
          onDecline={handleConsentDeclined}
        />
      ) : !eventKey ? (
        <JoinEventForm 
          onJoined={setEventKey}
          onConsentRequired={handleConsentRequired}
        />
      ) : (
        <MediaCapture eventKey={eventKey} onExit={handleExit} />
      )}
    </div>
  );
};

export default App;
