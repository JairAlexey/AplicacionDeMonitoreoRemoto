/**
 * Sistema de monitoreo de integridad del proxy
 * Detecta si el usuario intenta manipular o desactivar el proxy del sistema
 */

import { execFileSync } from 'child_process';
import { EventEmitter } from 'events';

interface ProxySettings {
  enabled: boolean;
  server: string;
  port: number;
}

export class ProxyMonitor extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private expectedPort: number;
  private isMonitoring: boolean = false;
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES = 2; // Máximo fallos antes de alertar
  private readonly CHECK_INTERVAL_MS = 3000; // Revisar cada 3 segundos

  constructor(expectedPort: number = 8888) {
    super();
    this.expectedPort = expectedPort;
  }

  /**
   * Inicia el monitoreo del proxy del sistema
   */
  start(): void {
    if (this.isMonitoring) {
      console.log('Proxy monitor ya esta activo');
      return;
    }

    this.isMonitoring = true;
    this.consecutiveFailures = 0;
    
    console.log(`Iniciando monitoreo de integridad del proxy (puerto ${this.expectedPort})`);
    
    // Primera verificación inmediata
    this.checkProxyIntegrity();
    
    // Verificaciones periódicas
    this.checkInterval = setInterval(() => {
      this.checkProxyIntegrity();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Detiene el monitoreo
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isMonitoring = false;
    this.consecutiveFailures = 0;
    console.log('Monitoreo de proxy detenido');
  }

  /**
   * Verifica la integridad de la configuración del proxy
   */
  private checkProxyIntegrity(): void {
    try {
      const currentSettings = this.getSystemProxySettings();
      
      // Verificar si el proxy está habilitado y configurado correctamente
      if (!currentSettings.enabled) {
        this.handleProxyTampering('Proxy del sistema desactivado');
        return;
      }

      if (currentSettings.port !== this.expectedPort) {
        this.handleProxyTampering(
          `Puerto del proxy cambiado (esperado: ${this.expectedPort}, actual: ${currentSettings.port})`
        );
        return;
      }

      if (!currentSettings.server.includes('localhost') && !currentSettings.server.includes('127.0.0.1')) {
        this.handleProxyTampering(
          `Servidor del proxy cambiado (actual: ${currentSettings.server})`
        );
        return;
      }

      // Proxy correcto - resetear contadores
      if (this.consecutiveFailures > 0) {
        console.log('Proxy restaurado correctamente');
        this.consecutiveFailures = 0;
        this.emit('proxy-restored');
      }

    } catch (error) {
      console.error('Error verificando integridad del proxy:', error);
    }
  }

  /**
   * Maneja la detección de manipulación del proxy
   */
  private handleProxyTampering(reason: string): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      // console.warn(`MANIPULACION DETECTADA: ${reason}`);
      this.emit('tampering-detected', {
        reason,
        timestamp: new Date().toISOString(),
        consecutiveFailures: this.consecutiveFailures
      });
    } else {
      // console.warn(`Posible manipulacion (${this.consecutiveFailures}/${this.MAX_FAILURES}): ${reason}`);
    }
  }

  /**
   * Obtiene la configuración actual del proxy del sistema (Windows)
   */
  private getSystemProxySettings(): ProxySettings {
    try {
      if (process.platform !== 'win32') {
        throw new Error('Solo soportado en Windows');
      }

      const script = `
        $regKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"
        $proxyEnable = (Get-ItemProperty -Path $regKey -Name ProxyEnable -ErrorAction SilentlyContinue).ProxyEnable
        $proxyServer = (Get-ItemProperty -Path $regKey -Name ProxyServer -ErrorAction SilentlyContinue).ProxyServer
        
        $result = @{
          enabled = [bool]$proxyEnable
          server = if ($proxyServer) { $proxyServer } else { "" }
        }
        
        $result | ConvertTo-Json -Compress
      `;

      const output = execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script
      ], {
        encoding: 'utf-8',
        timeout: 2000,
        windowsHide: true
      });

      const result = JSON.parse(output.trim());
      
      // Parsear servidor:puerto
      let server = 'localhost';
      let port = -1; // Default a -1 para que falle si no se puede parsear

      if (result.server) {
        // Eliminar protocolo si existe (http://, https://)
        const cleanServer = result.server.replace(/https?:\/\//, '');
        
        // Buscar el último dos puntos para separar puerto
        const lastColonIndex = cleanServer.lastIndexOf(':');
        
        if (lastColonIndex !== -1) {
          server = cleanServer.substring(0, lastColonIndex);
          const portStr = cleanServer.substring(lastColonIndex + 1);
          const parsedPort = parseInt(portStr, 10);
          port = isNaN(parsedPort) ? -1 : parsedPort;
        } else {
          // Si no hay puerto explícito, asumir 80 o mantener -1
          server = cleanServer;
        }
      }

      return {
        enabled: result.enabled === true || result.enabled === 1,
        server,
        port
      };

    } catch (error) {
      console.error('Error obteniendo configuracion del proxy:', error);
      // En caso de error, asumir que esta desactivado
      return {
        enabled: false,
        server: '',
        port: 0
      };
    }
  }

  /**
   * Obtiene el estado del monitoreo
   */
  isActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Actualiza el puerto esperado
   */
  updateExpectedPort(port: number): void {
    this.expectedPort = port;
    console.log(`Puerto esperado actualizado a: ${port}`);
  }
}

// Instancia singleton
export const proxyMonitor = new ProxyMonitor(8888);
