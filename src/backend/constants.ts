export const PROXY_SCRIPTS = (
  port: number,
  host: string = process.env["PROXY_HOST"] || "127.0.0.1",
) => ({
  SET_PROXY_SETTINGS: `$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
New-ItemProperty -Path $regKey -Name ProxyEnable -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyServer -Value "${host}:${port}" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyOverride -Value "localhost;127.0.0.1;<local>" -PropertyType String -Force | Out-Null`,

  UNSET_PROXY_SETTINGS: `$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
New-ItemProperty -Path $regKey -Name ProxyEnable -Value 0 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyServer -Value "" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regKey -Name ProxyOverride -Value "" -PropertyType String -Force | Out-Null`,

  IS_PROXY_CONNECTED: `$proxyStatus = Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
if ($proxyStatus.ProxyEnable -eq 1 -and $proxyStatus.ProxyServer -eq "${host}:${port}") {
    Write-Output "true"
} else {
    Write-Output "false"
}`,
});

export const SCRIPTS = {
  WINDOWS: {
    SET_PROXY: PROXY_SCRIPTS,
    UNSET_PROXY: PROXY_SCRIPTS,
    IS_PROXY_CONNECTED: PROXY_SCRIPTS,
  },
};

// Constantes para el proxy local
export const LOCAL_PROXY_CONFIG = {
  DEFAULT_PORT: 8888,
  DEFAULT_HOST: 'localhost',
  VALIDATION_TIMEOUT: 10000, // 10 segundos
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 segundo
};

// URLs de la API para diferentes entornos
export const API_ENDPOINTS = {
  DEVELOPMENT: {
    BASE_URL: 'http://127.0.0.1:8000',
    PROXY_AUTH: '/proxy/auth-http/',
    PROXY_VALIDATE: '/proxy/validate/',
    PROXY_DISCONNECT: '/proxy/disconnect-http/',
  },
  PRODUCTION: {
    BASE_URL: process.env['SIX_API_BASE_URL'] || 'http://localhost:8000',
    PROXY_AUTH: '/proxy/auth-http/',
    PROXY_VALIDATE: '/proxy/validate/',
    PROXY_DISCONNECT: '/proxy/disconnect-http/',
  },
};

// Función helper para obtener configuración de API
export const getApiConfig = () => {
  const isDevelopment = process.env['NODE_ENV'] === 'development';
  return isDevelopment ? API_ENDPOINTS.DEVELOPMENT : API_ENDPOINTS.PRODUCTION;
};
