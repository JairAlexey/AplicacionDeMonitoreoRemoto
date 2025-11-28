import React, { useState } from "react";
import "./index.css";
import JoinEventForm from "./components/JoinEventForm";
import MediaCapture from "./components/MediaCapture";

const App = () => {
  const [eventKey, setEventKey] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  const handleExit = async () => {
    // Evitar múltiples ejecuciones
    if (isExiting) {
      console.log('🔄 Ya saliendo, evitando duplicacion...');
      return;
    }
    
    setIsExiting(true);
    
    // Limpiar proxy de forma simple y directa
    try {
      console.log('🔄 Usuario presiono regresar, desactivando proxy...');
      await window.api.unsetProxySettings();
      console.log('✅ Proxy desactivado correctamente');
    } catch (error) {
      console.error('❌ Error desactivando proxy:', error);
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
