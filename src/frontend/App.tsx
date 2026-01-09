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
    
    // Detener monitoreo y proxy de forma completa
    try {
      console.log('🔄 Usuario presiono regresar, limpiando sistema...');
      
      // Detener monitoreo si está activo
      await window.api.stopMonitoring().catch(err => {
        console.warn('⚠️ Error deteniendo monitoreo:', err);
      });
      
      // Detener proxy (esto también detiene el monitor)
      await window.api.stopProxy().catch((err: any) => {
        console.warn('⚠️ Error deteniendo proxy:', err);
      });
      
      // Desactivar proxy del sistema
      await window.api.unsetProxySettings();
      
      console.log('✅ Sistema limpiado correctamente');
    } catch (error) {
      console.error('❌ Error en limpieza:', error);
    }
    
    // Volver al formulario principal
    setEventKey("");
    setShowConsent(false);
    setConsentData(null);
    setIsExiting(false);
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
