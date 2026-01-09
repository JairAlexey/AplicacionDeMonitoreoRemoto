import React, { useState } from "react";
import { FaSignInAlt } from "react-icons/fa";
import Toast from "./ui/ToastNotification";
import CustomTitleBar from "./ui/CustomTitleBar";
import logo from '../assets/images/logo.png';

const JoinEventForm = ({
  onJoined,
  onConsentRequired,
}: {
  onJoined: (eventKey: string) => void;
  onConsentRequired: (data: { eventName: string; eventDescription: string; participantName: string }, eventKey: string) => void;
}) => {
  const [eventKey, setEventKey] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleJoin = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      const verification = await window.api.verifyEventKey(eventKey);
      
      if (verification.isValid && verification.dateIsValid) {
        // Verificar si se requiere consentimiento
        if (verification.consentRequired === true) {
          // Mostrar formulario de consentimiento, pasando el eventKey
          onConsentRequired({
            eventName: verification.event.name,
            eventDescription: verification.event.description || '',
            participantName: verification.participant.name,
          }, eventKey);
          
          // El flujo continuará cuando el usuario acepte en ConsentForm
          setIsProcessing(false);
          return;
        }
        
        // No se requiere consentimiento, proceder normalmente
        window.api.joinEvent(eventKey);
        onJoined(eventKey);
      } else {
        setShowToast(true);
        // Usar el mensaje específico del backend si está disponible
        if (verification.error && verification.specificError) {
          setToastMessage(verification.error);
        } else if (verification.isValid) {
          setToastMessage("El evento no está activo en este momento");
        } else {
          setToastMessage("Clave de evento inválida");
        }
      }
    } catch (err) {
      setShowToast(true);
      setToastMessage("Error de conexión con el servidor");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col bg-gray-800">
      <CustomTitleBar title="Sistema de Monitoreo - Iniciar Sesión" />
      
      <div className="flex-1 flex flex-col justify-center p-4">
        {/* Logo y título */}
        <div className="text-center mb-4">
          <div className="w-24 h-24 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg">
            <img src={logo} alt="Logo" className="w-18 h-18 object-contain" />
          </div>
            <h1 className="text-lg font-bold text-white mb-1">Acceso al Sistema</h1>
            <p className="text-xs text-gray-300">Monitoreo de Evaluaciones Técnicas</p>
        </div>

        {/* Campo de Event Key */}
        <div className="mb-4">
            <label htmlFor="eventKey" className="block text-xs font-medium text-gray-200 mb-1">
            Clave del Evento
          </label>
          <input
            id="eventKey"
            type="text"
            placeholder="Ingrese la clave del evento"
            className="w-full px-3 py-2 border border-gray-600 bg-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-white placeholder-gray-400 transition-all"
            onChange={(e) => setEventKey(e.target.value)}
            value={eventKey}
            disabled={isProcessing}
          />
        </div>

        {/* Botón de Unirse */}
        <button
          onClick={handleJoin}
          disabled={isProcessing}
          className="w-full bg-blue-600 text-white py-2 px-3 rounded-md text-sm font-semibold hover:bg-blue-700 transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Procesando...</span>
            </>
          ) : (
            <>
              <FaSignInAlt size={14} />
              Iniciar Sesión
            </>
          )}
        </button>

        {showToast && (
          <Toast
            message={toastMessage}
            onClose={() => setShowToast(false)}
            duration={3000}
          />
        )}
      </div>
    </div>
  );
};

export default JoinEventForm;
