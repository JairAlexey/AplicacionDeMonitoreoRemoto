import React, { useState, useEffect } from "react";
import "./index.css";
import JoinEventForm from "./components/JoinEventForm";
import MediaCapture from "./components/MediaCapture";

const App = () => {
  const [eventKey, setEventKey] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  // Notificar a Electron que React está listo
  useEffect(() => {
    window.api.appReady();
  }, []);

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
    setIsExiting(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-800 p-6">
      {!eventKey ? (
        <JoinEventForm onJoined={setEventKey} />
      ) : (
        <MediaCapture eventKey={eventKey} onExit={handleExit} />
      )}
    </div>
  );
};

export default App;
