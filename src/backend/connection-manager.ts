import { EventEmitter } from "events";
import { execFileSync } from "child_process";
import { PROXY_SCRIPTS } from "./constants";
import { API_BASE_URL } from "./config";
import { LocalProxyServer } from "./local-proxy-server";
import { proxyMonitor } from "./proxy-monitor";

class ConnectionManager extends EventEmitter {
  private localProxy: LocalProxyServer | null = null;
  private eventKey: string = "";

  async connect(eventKey: string): Promise<number> {
    this.eventKey = eventKey;
    console.log("EventKey:", eventKey);
    
    try {
      // Autenticación HTTP en lugar de socket gateway
      console.log("Autenticando con servidor via HTTP...");
      const response = await fetch(`${API_BASE_URL}/proxy/auth-http/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${eventKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_key: eventKey })
      });
      
      if (!response.ok) {
        console.error(`Error HTTP: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Respuesta del servidor: ${errorText}`);
        let error;
        try {
            error = JSON.parse(errorText);
        } catch (e) {
            error = { error: errorText || 'Error desconocido' };
        }
        throw new Error(`Autenticación fallida: ${error.error || response.statusText}`);
      }
            
      console.log(`Autenticado correctamente - usando puerto fijo 8888`);
      
      // Iniciar proxy local
      const localPort = await this._setupLocalProxy(API_BASE_URL);
      
      return localPort;
      
    } catch (error) {
      console.error("Error en conexion:", error);
      throw error;
    }
  }

  private async _setupLocalProxy(apiBaseUrl: string): Promise<number> {
    try {
      // Si ya existe una instancia activa y corriendo, solo devolver el puerto
      if (this.localProxy && this.localProxy.isActive()) {
        console.log('Proxy local ya esta activo, reutilizando instancia.');
        return this.localProxy.getPort();
      }

      // Configurar LocalProxyServer (puerto fijo 8888)
      // Importar el estado de monitoreo desde callbacks
      const { getMonitoringStatus } = await import('./callbacks');
      const isMonitoring = getMonitoringStatus();
      
      const proxyConfig = {
        eventKey: this.eventKey,
        remoteHost: process.env["PROXY_HOST"] || "127.0.0.1",
        apiBaseUrl: apiBaseUrl,
        isMonitoring: isMonitoring
      };

      this.localProxy = new LocalProxyServer(proxyConfig);

      // Configurar event listeners
      this.localProxy.on('started', (port) => {
        console.log(`Proxy local iniciado en puerto ${port}`);
        this.emit('proxyStarted', port);
      });

      this.localProxy.on('error', (error) => {
        console.error('Error en proxy local:', error);
        this.emit('error', error);
      });

      this.localProxy.on('stopped', () => {
        console.log('Proxy local detenido');
        this.emit('proxyStopped');
      });

      // Iniciar el servidor proxy local
      const localPort = await this.localProxy.start();

      // Configurar el sistema para usar proxy local (localhost:8888)
      this._configureSystemProxy(localPort);

      // Iniciar monitoreo de integridad del proxy
      proxyMonitor.updateExpectedPort(localPort);
      proxyMonitor.start();
      
      // Limpiar listeners previos para evitar duplicados
      proxyMonitor.removeAllListeners('tampering-detected');
      
      // Manejar manipulación detectada
      proxyMonitor.on('tampering-detected', async (data) => {
        // console.error('MANIPULACION DEL PROXY DETECTADA:', data.reason);
        // Pausar monitoreo automáticamente
        const { handleProxyTampering } = await import('./callbacks');
        await handleProxyTampering(data.reason);
      });

      return localPort;

    } catch (error) {
      console.error('Error configurando proxy local:', error);
      throw error;
    }
  }
  
  private _configureSystemProxy(localPort: number) {
    const scripts = PROXY_SCRIPTS(localPort, 'localhost');
    
    try {
      execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        scripts.SET_PROXY_SETTINGS,
      ]);
      
      console.log(`Sistema configurado para usar proxy localhost:${localPort}`);
    } catch (error) {
      console.error('Error configurando proxy del sistema:', error);
      throw error;
    }
  }

  send(_data: string | Buffer) {
    // Con LocalProxyServer, ya no necesitamos enviar datos directamente
    // El proxy local maneja todas las peticiones automaticamente
    console.log('send() no necesario con LocalProxyServer');
  }

  async disconnect() {
    try {
      console.log('Desconectando proxy...');
      
      // Detener monitor de integridad
      proxyMonitor.stop();
      
      // Detener proxy local
      if (this.localProxy) {
        await this.localProxy.stop();
        this.localProxy = null;
      }
      
      // Limpiar configuracion del proxy del sistema usando funcion mejorada
      try {
        const { disableSystemProxy } = await import('./callbacks');
        const success = await disableSystemProxy();
        if (success) {
          console.log('Proxy del sistema desactivado correctamente');
        } else {
          console.warn('Fallo al desactivar proxy del sistema');
        }
      } catch (error) {
        console.error('Error desactivando proxy del sistema:', error);
      }
      
      // Notificar al servidor via HTTP
      if (this.eventKey) {
        try {
          await fetch(`${API_BASE_URL}/proxy/disconnect-http/`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.eventKey}`,
              "Content-Type": "application/json",
            },
          });
          
          console.log('Desconexion notificada al servidor');
        } catch (error) {
          console.error('Error notificando desconexion:', error);
        }
      }
      
      // Limpiar estado
      this.eventKey = "";
      
      console.log('Desconexion completada');
      
    } catch (error) {
      console.error('Error durante desconexion:', error);
      throw error;
    }
  }
  
  // Métodos auxiliares para gestión del proxy
  isConnected(): boolean {
    return this.localProxy?.isActive() || false;
  }
  
  getAssignedPort(): number | null {
    // Port assignments removed - proxy always uses fixed port 8888
    return 8888;
  }
  
  getLocalPort(): number | null {
    return this.localProxy?.getPort() || null;
  }
  
  getEventKey(): string {
    return this.eventKey;
  }
  
  updateProxyConfig(config: any): void {
    if (this.localProxy) {
      this.localProxy.updateConfig(config);
    }
  }
  
  // Método simple que solo para el servidor local sin limpiar configuración del sistema
  async stopLocalServer(): Promise<void> {
    if (this.localProxy) {
      console.log('Parando servidor local...');
      await this.localProxy.stop();
      this.localProxy = null;
    }
  }
}

export const connectionManager = new ConnectionManager();
