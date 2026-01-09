import React, { useState } from 'react';
import CustomTitleBar from './ui/CustomTitleBar';

interface ConsentFormProps {
  eventName: string;
  eventDescription: string;
  participantName: string;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

const ConsentForm: React.FC<ConsentFormProps> = ({
  eventName,
  participantName,
  onAccept,
  onDecline,
}) => {
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accepted) {
      setError('Debe aceptar el consentimiento para continuar');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar consentimiento');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex flex-col bg-gray-800">
      <CustomTitleBar title="Consentimiento Informado" />
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto bg-gray-700 rounded-lg shadow-lg p-4">
          {/* Header */}
          <div className="text-center mb-3">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white mb-1">
              Consentimiento Informado
            </h1>
            <p className="text-xs text-gray-300">
              Evento: <span className="font-semibold">{eventName}</span>
            </p>
          </div>

          {/* Contenido del consentimiento */}
          <div className="bg-gray-600 rounded-lg p-3 mb-3 border border-gray-500">
            <h2 className="text-sm font-semibold text-white mb-3">
              Autorización de Tratamiento de Datos Personales
            </h2>
            
            <div className="space-y-3 text-gray-200 text-xs leading-relaxed">
              {/* Introducción */}
              <div>
                <p className="mb-2">
                  <strong>Estimado/a {participantName},</strong>
                </p>
                
                <p>
                  En cumplimiento con la <strong>Ley Orgánica de Protección de Datos Personales del Ecuador</strong>,
                  solicitamos su consentimiento explícito para el tratamiento de sus datos personales durante
                  la evaluación técnica <strong>"{eventName}"</strong>.
                </p>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-500 my-3"></div>

              {/* Datos recopilados */}
              <div>
                <h3 className="font-semibold mb-2 text-xs text-blue-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
                  </svg>
                  Datos que serán recopilados:
                </h3>
                <ul className="list-disc list-inside space-y-0.5 text-xs pl-2">
                  <li>Grabaciones de video de su cámara web</li>
                  <li>Grabaciones de audio de su micrófono</li>
                  <li>Capturas de pantalla de sus monitores</li>
                  <li>Registro de navegación web durante la evaluación</li>
                  <li>Información técnica del sistema (dirección IP, user agent)</li>
                </ul>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-500 my-3"></div>

              {/* Finalidad */}
              <div>
                <h3 className="font-semibold mb-2 text-xs text-blue-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
                  </svg>
                  Finalidad del tratamiento:
                </h3>
                <ul className="list-disc list-inside space-y-0.5 text-xs pl-2">
                  <li>Supervisión y evaluación de su desempeño durante la prueba técnica</li>
                  <li>Verificación de la integridad del proceso evaluativo</li>
                  <li>Análisis automatizado de comportamiento mediante inteligencia artificial</li>
                  <li>Detección de posibles irregularidades o patrones sospechosos</li>
                </ul>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-500 my-3"></div>

              {/* Derechos */}
              <div>
                <h3 className="font-semibold mb-2 text-xs text-blue-300 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  Sus derechos:
                </h3>
                <ul className="list-disc list-inside space-y-0.5 text-xs pl-2">
                  <li><strong>Acceso:</strong> Solicitar copia de sus datos personales almacenados</li>
                  <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos</li>
                  <li><strong>Supresión:</strong> Solicitar eliminación de sus datos bajo condiciones legales</li>
                  <li><strong>Oposición:</strong> Oponerse al tratamiento en casos específicos</li>
                </ul>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-500 my-3"></div>

              {/* Notas legales */}
              <div className="space-y-2">
                <p className="text-[10px] text-gray-300 italic leading-relaxed">
                  <strong>Importante:</strong> Los datos recopilados serán almacenados de forma segura en servidores
                  con cifrado y acceso restringido. El sistema NO toma decisiones automatizadas que generen efectos
                  jurídicos significativos sobre usted. El análisis de IA es únicamente informativo y requiere
                  validación humana por parte de los evaluadores.
                </p>

                <p className="text-[10px] text-gray-300 leading-relaxed">
                  Al aceptar este consentimiento, usted autoriza expresamente el tratamiento de sus datos personales
                  para los fines descritos anteriormente. Este consentimiento es revocable en cualquier momento,
                  aunque la revocación no afectará el tratamiento realizado previamente con su consentimiento.
                </p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-2 p-2 bg-red-900/50 border border-red-600 rounded flex items-start gap-2">
              <svg
                className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-red-200 text-xs">{error}</span>
            </div>
          )}

          {/* Checkbox de aceptación */}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    setError(null);
                  }}
                  className="mt-0.5 w-4 h-4 text-blue-600 border-gray-500 rounded focus:ring-blue-500 focus:ring-2 bg-gray-700"
                  disabled={isSubmitting}
                />
                <span className="text-xs text-gray-200 group-hover:text-white select-none">
                  <strong>He leído y acepto</strong> el tratamiento de mis datos personales conforme
                  a lo establecido en este consentimiento informado. Confirmo que he sido informado/a
                  sobre mis derechos y la finalidad del tratamiento de datos.
                </span>
              </label>
            </div>

            {/* Botones */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDecline}
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 bg-gray-600 text-white text-xs font-semibold rounded hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rechazar
              </button>
              <button
                type="submit"
                disabled={!accepted || isSubmitting}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin h-3 w-3 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Procesando...</span>
                  </>
                ) : (
                  'Aceptar y Continuar'
                )}
              </button>
            </div>

            <p className="text-[10px] text-gray-400 text-center mt-2">
              Versión del consentimiento: v1.0 | Fecha: {new Date().toLocaleDateString('es-EC')}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ConsentForm;
