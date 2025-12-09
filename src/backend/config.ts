const PRODUCTION_API_URL = 'https://backend-production-b180.up.railway.app';  

// Detectar si estamos en desarrollo o producción
const isDevelopment = process.env['NODE_ENV'] === 'development';

// Exportar la URL correcta según el entorno
export const API_BASE_URL = isDevelopment 
  ? 'http://127.0.0.1:8000'  // Desarrollo local
  : PRODUCTION_API_URL;       // Producción 

// Endpoints de la API
export const API_ROUTES = {
  PROXY_AUTH: '/proxy/auth-http/',
  PROXY_VALIDATE: '/proxy/validate/',
  PROXY_DISCONNECT: '/proxy/disconnect-http/',
  VERIFY_EVENT_KEY: '/events/verify-event/',
  SCREEN_CAPTURE: '/events/screen-capture/',
  MEDIA_CAPTURE: '/behavior/upload-media/',
};

// Helper para construir URLs completas
export const getApiUrl = (route: string) => `${API_BASE_URL}${route}`;

console.log(`[CONFIG] Usando API: ${API_BASE_URL} (${isDevelopment ? 'DESARROLLO' : 'PRODUCCIÓN'})`);
