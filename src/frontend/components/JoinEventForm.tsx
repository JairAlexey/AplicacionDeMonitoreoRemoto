import React, { useState } from "react";
import { FaKey, FaSignOutAlt, FaSignInAlt } from "react-icons/fa";
import Toast from "./ui/ToastNotification";

const JoinEventForm = ({
  onJoined,
}: {
  onJoined: (eventKey: string) => void;
}) => {
  const [eventKey, setEventKey] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleJoin = async () => {
    try {
      const verification = await window.api.verifyEventKey(eventKey);
      if (verification.isValid && verification.dateIsValid) {
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
    }
  };

  const exitEvent = async () => {
    await window.api.exitEvent();
  };

  return (
    <div className="flex w-full max-w-xs flex-col text-xs text-white">
      <div className="mb-4 flex items-center justify-center text-sm">
        <h1>Aplicacion de Monitoreo</h1>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="eventId" className="flex items-center">
            <FaKey className="mr-2" />
            ID del Evento:
          </label>
          <input
            name="eventId"
            type="text"
            className="h-10 rounded border border-zinc-400 px-3 text-gray-300 focus:ring-2 focus:ring-blue-300 focus:outline-none"
            onChange={(e) => setEventKey(e.target.value)}
            value={eventKey}
          />
        </div>
        <div className="mt-2 flex w-full gap-2">
          <button
            onClick={exitEvent}
            className="flex w-full items-center justify-center rounded-lg bg-red-500 py-2 text-white transition-colors hover:bg-red-600"
          >
            <FaSignOutAlt className="mr-2" size={15} />
            Cerrar
          </button>
          <button
            onClick={handleJoin}
            className="flex w-full items-center justify-center rounded-lg bg-blue-500 py-2 text-white transition-colors hover:bg-blue-600"
          >
            <FaSignInAlt className="mr-2" size={15} />
            Unirse
          </button>
        </div>
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
