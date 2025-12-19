import { nativeImage, desktopCapturer, screen, app, BrowserWindow } from "electron";
import { PROXY_SCRIPTS } from "./constants";
import { API_BASE_URL } from "./config";
import { execFile } from "child_process";
import { EvalTechAPI } from "../frontend/api";
import { connectionManager } from "./connection-manager";
let eventKey: string = "";
let currentProxyPort: number | null = null;
let isMonitoringActive: boolean = false;

// Variables de control para evitar ejecuciones duplicadas
let isCleaningUp: boolean = false;
let isStoppingProxy: boolean = false;
let isExitingEvent: boolean = false;
let isUnsettingProxy: boolean = false;

// Helper para obtener el estado de monitoreo
export const getMonitoringStatus = (): boolean => isMonitoringActive;

// Función global de cleanup - ejecuta durante el cierre de la app
export const globalCleanup = async () => {
  // Evitar ejecuciones duplicadas
  if (isCleaningUp) {
    console.log("[CLEANUP] Ya en progreso, evitando duplicacion");
    return;
  }
  
  isCleaningUp = true;
  console.log("[CLEANUP] Iniciando cleanup global");
  try {
    // Detener capturas de pantalla
    stopCaptureInterval();
    
    // Detener monitoreo si está activo
    if (isMonitoringActive && eventKey) {
      console.log("[CLEANUP] Deteniendo monitoreo");
      await stopMonitoring();
    }
    
    // Detener proxy
    if (currentProxyPort || connectionManager.isConnected()) {
      console.log("[CLEANUP] Deteniendo proxy");
      await stopProxy();
    }
    
    // CRÍTICO: Desactivar proxy del sistema como medida de seguridad
    console.log("[CLEANUP] Desactivando proxy del sistema");
    const success = await disableSystemProxy();
    if (success) {
      console.log("[CLEANUP] Proxy del sistema desactivado correctamente");
    } else {
      console.warn("[CLEANUP] Fallo desactivacion del proxy del sistema");
    }
    
    console.log("[CLEANUP] Completado exitosamente");
  } catch (error) {
    console.error("[CLEANUP] Error:", error);
    // Última oportunidad para limpiar proxy
    try {
      console.log("[CLEANUP] Intentando limpieza final del proxy...");
      await disableSystemProxy();
    } catch (finalError) {
      console.error("[CLEANUP] Fallo limpieza final:", finalError);
    }
  } finally {
    isCleaningUp = false;
  }
};

//*************** SYSTEM PROXY FUNCTIONS ***************
export const disableSystemProxy = async (): Promise<boolean> => {
  console.log('🛠️ Desactivando proxy del sistema...');
  
  try {
    const { execFileSync } = require('child_process');
    
    if (process.platform === 'win32') {
      // Windows: Desactivar proxy usando registro de Windows (metodo mas confiable)
      let success = false;
      
      try {
        // Metodo principal: Registro de Windows
        const registryCommand = '$regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"; ' +
          'Set-ItemProperty -Path $regKey -Name ProxyEnable -Value 0; ' +
          'Remove-ItemProperty -Path $regKey -Name ProxyServer -ErrorAction SilentlyContinue; ' +
          'Write-Host "Proxy desactivado via registro"';
        
        execFileSync('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command', registryCommand
        ], { windowsHide: true, timeout: 3000 });
        
        success = true;
        console.log('✅ Proxy desactivado via registro de Windows');
      } catch (regError) {
        console.warn(`⚠️ Error en registro: ${regError instanceof Error ? regError.message : regError}`);
      }
      
      try {
        // Método alternativo: netsh winhttp (no crítico si falla)
        execFileSync('netsh', ['winhttp', 'reset', 'proxy'], { 
          windowsHide: true, 
          timeout: 2000 
        });
        console.log('✅ WinHTTP proxy reset exitoso');
      } catch (netshError) {
        console.warn(`⚠️ WinHTTP reset fallo (no critico): ${netshError instanceof Error ? netshError.message : netshError}`);
      }
      
      try {
        // Cerrar procesos de navegador para aplicar cambios
        execFileSync('taskkill', ['/f', '/im', 'iexplore.exe'], { 
          windowsHide: true, 
          timeout: 1000 
        });
      } catch (killError) {
        // No critico si no hay procesos para cerrar
      }
      
      if (success) {
        console.log('✅ Proxy del sistema desactivado en Windows');
        return true;
      } else {
        console.warn('⚠️ No se pudo desactivar completamente el proxy');
        return false;
      }
      
    } else if (process.platform === 'darwin') {
      // macOS: Desactivar proxy usando networksetup
      const interfaces = ['Wi-Fi', 'Ethernet', 'Thunderbolt Ethernet'];
      
      for (const iface of interfaces) {
        try {
          execFileSync('networksetup', ['-setautoproxystate', iface, 'off'], { timeout: 3000 });
          execFileSync('networksetup', ['-setproxybypassdomains', iface, ''], { timeout: 3000 });
        } catch (ifaceError) {
          // No es crítico si falla para una interfaz específica
        }
      }
      
      console.log('✅ Proxy del sistema desactivado en macOS');
      return true;
      
    } else {
      console.log('ℹ️ Desactivacion de proxy no implementada para Linux');
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error desactivando proxy del sistema:', error);
    return false;
  }
};

//*************** PROXY FUNCTIONS ***************
export const startProxy = async () => {
  try {
    if (!eventKey) throw new Error("No event key");

    const localPort = await connectionManager.connect(eventKey);
    currentProxyPort = localPort; // Always 8888

    return true;
  } catch (error) {
    console.error("Proxy connection failed:", error);
    throw error;
  }
};

export const stopProxy = async () => {
  // Evitar ejecuciones duplicadas con timeout de seguridad
  if (isStoppingProxy) {
    console.log('🛑 Detencion de proxy ya en progreso, evitando duplicacion');
    return;
  }
  
  isStoppingProxy = true;
  
  // Timeout de seguridad para liberar el lock en caso de error
  const safetyTimeout = setTimeout(() => {
    console.warn('⚠️ Timeout de seguridad: liberando lock de stopProxy');
    isStoppingProxy = false;
  }, 10000); // 10 segundos
  
  try {
    console.log('Deteniendo proxy...');
    
    // 1. Desconectar connection manager (ya incluye disableSystemProxy)
    await connectionManager.disconnect();
    
    // 2. Limpiar estado local
    currentProxyPort = null;
    
    console.log('Proxy limpiado exitosamente');
    
  } catch (error) {
    console.error('Error deteniendo proxy:', error);
    
    // Intentar limpieza de emergencia
    try {
      console.log('Limpieza de emergencia del proxy...');
      await disableSystemProxy();
    } catch (emergencyError) {
      console.error('Fallo limpieza de emergencia:', emergencyError);
    }
  } finally {
    clearTimeout(safetyTimeout);
    isStoppingProxy = false;
  }
};

export const startMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    
    // VALIDACIÓN: Verificar que el proxy esté activo y configurado correctamente
    const proxyActive = await isProxySetup();
    if (!proxyActive) {
      console.error('No se puede iniciar monitoreo: Proxy no esta configurado');
      return false;
    }
    
    // Verificar que el proxy local esté conectado
    if (!connectionManager.isConnected()) {
      console.error('No se puede iniciar monitoreo: Proxy local no esta conectado');
      return false;
    }
    
    const res = await fetch(`${API_BASE_URL}/proxy/start-monitoring/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eventKey}`,
      },
    });
    
    if (res.ok) {
      isMonitoringActive = true;
      // Actualiza el proxy local para que valide URLs solo si está monitoreando
      connectionManager.updateProxyConfig({ isMonitoring: true });
      console.log('Monitoreo iniciado - estado guardado');
    } else {
      console.error('Error del servidor al iniciar monitoreo');
    }
    
    return res.ok;
  } catch (error) {
    console.error('startMonitoring error:', error);
    return false;
  }
};

export const stopMonitoring = async () => {
  try {
    if (!eventKey) throw new Error('No event key');
    
    // Implementar retry simple (3 intentos)
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const res = await fetch(`${API_BASE_URL}/proxy/stop-monitoring/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${eventKey}`,
          },
        });
        
        if (res.ok) {
          isMonitoringActive = false;
          connectionManager.updateProxyConfig({ isMonitoring: false });
          console.log('Monitoreo detenido - estado guardado');
          return true;
        }
        // Si el servidor responde con error (no 200), no reintentar si es 4xx
        if (res.status >= 400 && res.status < 500) {
           console.error(`Stop monitoring failed with client error: ${res.status}`);
           break;
        }
      } catch (e) {
        console.warn(`Intento ${attempts + 1} de detener monitoreo fallido:`, e);
      }
      attempts++;
      if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000));
    }
    
    // Si fallaron todos los intentos, forzar estado local a false de todas formas
    isMonitoringActive = false;
    return false;
  } catch (error) {
    console.error('stopMonitoring error:', error);
    return false;
  }
};

let isHandlingTampering = false;

/**
 * Maneja la detección de manipulación del proxy
 * Pausa automáticamente el monitoreo y notifica al servidor
 * SOLO si el monitoreo está activo
 */
export const handleProxyTampering = async (reason: string) => {
  // console.error('MANIPULACION DEL PROXY DETECTADA:', reason);
  
  // ⚠️ IMPORTANTE: Solo actuar si el monitoreo está activo y no se está manejando ya
  if (!isMonitoringActive || isHandlingTampering) {
    // console.log('Proxy manipulado pero monitoreo no esta activo o ya se esta manejando - ignorando');
    return;
  }
  
  isHandlingTampering = true;
  
  try {
    console.warn('DETENIENDO MONITOREO - Manipulacion del proxy detectada');
    
    // Notificar al servidor sobre la manipulación ANTES de detener el monitoreo
    if (eventKey) {
      try {
        // Usar endpoint de logs de HTTP request como fallback si no existe endpoint específico de tampering
        // O crear un log de tipo "security_alert"
        await fetch(`${API_BASE_URL}/events/api/logging/http-request`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${eventKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            uri: `${reason}`,
            type: 'proxy',
            method: 'ALERT',
            timestamp: new Date().toISOString(),
            status_code: 403,
            response_time: 0,
            error: `${reason}`
          })
        });
        console.log('Manipulacion reportada al servidor');
      } catch (error) {
        console.error('Error reportando manipulacion:', error);
      }
    }

    // Emitir evento para que el frontend muestre advertencia
    const windows = require('electron').BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send('proxy-tampering', {
        reason,
        timestamp: new Date().toISOString()
      });
    }

    // Esperar un momento para que el frontend reciba el evento y suba el video
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Detener capturas
    stopCaptureInterval();
    
    // Detener monitoreo en el servidor
    await stopMonitoring();
    
    // Forzar actualización de estado
    isMonitoringActive = false;
    
  } catch (error) {
    console.error('Error manejando manipulacion del proxy:', error);
  } finally {
    isHandlingTampering = false;
  }
};

export const isProxySetup = async (): Promise<boolean> => {
  // En modo HTTP-only, verificar puerto fijo 8888 del LocalProxyServer
  const localProxyPort = 8888;

  const scripts = PROXY_SCRIPTS(localProxyPort, 'localhost');

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        scripts.IS_PROXY_CONNECTED,
      ],
      (error, output) => {
        const isConnected = output?.toString().trim() === "true";
        // console.log(`Proxy status: ${isConnected}`);
        resolve(isConnected);
        if (error) {
          console.error("Error ejecutando script:", error);
          resolve(false);
          return;
        }
      },
    );
  });
};

//*************** EVENT FUNCTIONS ***************
export const verifyEventKey = async (_eventKey: string) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${EvalTechAPI.verifyKey}`,
      {
        headers: {
          Authorization: `Bearer ${_eventKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        isValid: false, 
        dateIsValid: false,
        error: errorData.error,
        specificError: errorData.specificError
      };
    }
    const data = await response.json();
    return {
      isValid: data.isValid,
      dateIsValid: data.dateIsValid,
      participant: data.participant,
      event: data.event,
      error: data.error,
      specificError: data.specificError
    };
  } catch (error) {
    return { 
      isValid: false, 
      dateIsValid: false,
      error: "Error de conexión con el servidor",
      specificError: false
    };
  }
};

export const joinEvent = async (_eventKey: string) => {
  const verification = await verifyEventKey(_eventKey);
  if (verification.isValid && verification.dateIsValid) {
    eventKey = _eventKey;
    return true;
  }
  return false;
};

export const exitEvent = async () => {
  // Evitar ejecuciones duplicadas
  if (isExitingEvent) {
    console.log('Salida de evento ya en progreso, evitando duplicacion');
    return;
  }
  
  isExitingEvent = true;
  
  try {
    console.log('Saliendo del evento...');
    
    // 1. Detener monitoreo si está activo
    if (isMonitoringActive) {
      console.log('Deteniendo monitoreo antes de salir...');
      await stopMonitoring();
    }
    
    // 2. Detener y desconectar proxy completamente
    if (currentProxyPort || connectionManager.isConnected()) {
      console.log('Desconectando proxy antes de salir...');
      await stopProxy();
    }
    
    // 3. CRÍTICO: Limpiar configuración del sistema como medida de seguridad
    console.log('Limpiando configuracion de proxy del sistema...');
    const success = await disableSystemProxy();
    if (success) {
      console.log('Configuracion de proxy limpiada correctamente');
    } else {
      console.warn('Fallo la limpieza del proxy del sistema');
    }
    
    // 4. Limpiar variables globales
    eventKey = "";
    currentProxyPort = null;
    isMonitoringActive = false;
    
    console.log('Evento cerrado correctamente');
    
  } catch (error) {
    console.error('Error cerrando evento:', error);
    
    // Aunque haya error, intentar limpiar proxy como último recurso
    try {
      console.log('Intentando limpieza de emergencia del proxy...');
      await disableSystemProxy();
    } catch (emergencyError) {
      console.error('Fallo limpieza de emergencia:', emergencyError);
    }
  } finally {
    isExitingEvent = false;
    // Siempre salir de la aplicacion
    app.quit();
  }
};

//*************** WINDOW CONTROL FUNCTIONS ***************
export const minimizeWindow = () => {
  const window = BrowserWindow.getFocusedWindow();
  if (window) {
    window.minimize();
  }
};

//*************** DESKTOP CAPTURE FUNCTIONS ***************
export const captureDesktop = async () => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width,
        height,
      },
    });

    // Usar Promise.allSettled para que si falla una pantalla, las otras sigan funcionando
    const results = await Promise.allSettled(sources.map(async (source, index) => {
      if (!source) return;
      
      const screenSource = source;
      
      // Renombrar monitores para que sean más amigables (Screen 1, Screen 2, etc.)
      let friendlyName = screenSource.name;
      // Siempre usar Screen X para consistencia si detectamos nombres genéricos
      if (friendlyName.toLowerCase().includes("screen") || 
          friendlyName.toLowerCase().includes("pantalla") || 
          friendlyName.toLowerCase().includes("display") ||
          friendlyName === "Entire Screen") {
         friendlyName = `Screen ${index + 1}`;
      }
      
      // console.log(`Capturing screen: ${friendlyName}`);

      const image = nativeImage.createFromDataURL(
        screenSource.thumbnail.toDataURL(),
      );

      const buffer = image.toPNG();
      const uint8Array = new Uint8Array(buffer);

      const formData = new FormData();
      formData.append(
        "screenshot",
        new Blob([uint8Array], { type: "image/png" }),
        "screenshot.png",
      );
      formData.append("monitor_name", friendlyName);

      const response = await fetch(
        `${API_BASE_URL}${EvalTechAPI.screenCapture}`,
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${eventKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
    }));
    
    // Loguear errores si los hubo
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Error capturing screen ${index + 1}:`, result.reason);
      }
    });
    
  } catch (error) {
    console.error(`Error capturing screen: ${error}`);
  }
};

export const getScreenInfo = async () => {
  try {
    const displays = screen.getAllDisplays();
    const displayCount = displays.length;
    const hasPermission = await desktopCapturer
      .getSources({ types: ["screen"] })
      .then(() => true)
      .catch(() => false);

    return {
      displayCount,
      hasPermission,
    };
  } catch (error) {
    console.error(`Error getting screen info: ${error}`);
    return {
      displayCount: 0,
      hasPermission: false,
    };
  }
};

class ScreenCaptureManager {
  private static instance: ScreenCaptureManager;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): ScreenCaptureManager {
    if (!ScreenCaptureManager.instance) {
      ScreenCaptureManager.instance = new ScreenCaptureManager();
    }
    return ScreenCaptureManager.instance;
  }

  public startCapture() {
    if (this.intervalId) {
      this.stopCapture();
    }
    this.intervalId = setInterval(async () => {
      await captureDesktop();
    }, 10000);
    console.log("Screen capture interval started.");
  }

  public stopCapture() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Screen capture interval stopped.");
    }
  }
}

export const startCaptureInterval = () => {
  ScreenCaptureManager.getInstance().startCapture();
};

export const stopCaptureInterval = () => {
  ScreenCaptureManager.getInstance().stopCapture();
};

//*************** MEDIA FUNCTIONS ***************
export const uploadMedia = async (data: ArrayBuffer) => {
  try {
    console.log(`[UPLOAD] Iniciando upload de ${(data.byteLength / 1024).toFixed(2)} KB`);
    
    // Create Blob directly from ArrayBuffer
    // Use slice to ensure we have a fresh copy and avoid transfer issues
    const blob = new Blob([data.slice(0)], { type: "video/webm" });
    
    // Generar nombre único con timestamp para identificar cada segmento
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.webm`;

    const formData = new FormData();
    formData.append("media", blob, filename);

    const response = await fetch(
      `${API_BASE_URL}${EvalTechAPI.mediaCapture}`,
      {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${eventKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    console.log(`[UPLOAD] Video segment sent: ${filename} (${(blob.size / 1024).toFixed(2)} KB)`);
  } catch (error) {
    console.error("[UPLOAD] Error:", error);
    throw error; // Re-lanzar para que el caller lo maneje
  }
};

//*************** SIMPLE PROXY FUNCTIONS ***************
export const unsetProxySettings = async (): Promise<boolean> => {
  // Evitar ejecuciones duplicadas/múltiples
  if (isUnsettingProxy) {
    console.log('Desactivacion de proxy ya en progreso, evitando duplicacion');
    return false;
  }
  
  isUnsettingProxy = true;
  console.log('Desactivando configuracion de proxy usando script UNSET...');
  
  try {
    // 1. Detener solo el LocalProxyServer con timeout agresivo
    if (connectionManager && connectionManager.isConnected()) {
      console.log('Deteniendo LocalProxyServer...');
      try {
        await Promise.race([
          connectionManager.stopLocalServer(),
          new Promise(resolve => setTimeout(resolve, 1000)) // Solo esperar 1 segundo
        ]);
      } catch (error) {
        console.warn('Error o timeout deteniendo servidor, continuando...');
      }
    }
    
    // 2. Desactivar configuración del proxy en Windows
    if (process.platform === 'win32') {
      const scripts = PROXY_SCRIPTS(8888, 'localhost'); // Los parámetros no importan para UNSET
      const { execFileSync } = require('child_process');
      
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', scripts.UNSET_PROXY_SETTINGS
      ], { windowsHide: true, timeout: 3000 });
      
      console.log('Proxy desactivado correctamente usando UNSET_PROXY_SETTINGS');
    } else {
      console.log('UNSET_PROXY_SETTINGS solo implementado para Windows');
    }
    
    // 3. Limpiar estado local
    currentProxyPort = null;
    
    return true;
  } catch (error) {
    console.error('Error ejecutando UNSET_PROXY_SETTINGS:', error);
    return false;
  } finally {
    isUnsettingProxy = false;
  }
};


