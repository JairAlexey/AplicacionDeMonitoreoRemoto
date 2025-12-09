import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { EventEmitter } from 'events';
 
interface ProxyConfig {
  eventKey: string;
  remoteHost: string;
  remotePort?: number;
  apiBaseUrl: string;
  isMonitoring?: boolean;
}
 
export class LocalProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  private config: ProxyConfig;
  private isRunning: boolean = false;
  private localPort: number = 8888;
 
  constructor(config: ProxyConfig) {
    super();
    this.config = config;
  }
 
  /**
   * Inicia el servidor proxy local en puerto 8888
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        resolve(this.localPort);
        return;
      }
 
      this.server = http.createServer();
 
      // Manejar peticiones HTTP normales
      this.server.on('request', (req, res) => {
        this.handleHTTPRequest(req, res);
      });
 
      // Manejar CONNECT para HTTPS
      this.server.on('connect', (req, clientSocket, head) => {
        this.handleHTTPSConnect(req, clientSocket as net.Socket, head);
      });
 
      this.server.on('error', (error) => {
        console.error('Error en LocalProxyServer:', error);
        this.emit('error', error);
        reject(error);
      });
 
      this.server.listen(this.localPort, 'localhost', () => {
        this.isRunning = true;
        console.log(`🚀 Proxy local iniciado en localhost:${this.localPort}`);
        this.emit('started', this.localPort);
        resolve(this.localPort);
      });
    });
  }
 
  /**
   * Maneja peticiones HTTP normales (GET, POST, etc.)
   */
  private async handleHTTPRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      const targetUrl = req.url!;
      console.log(`📡 HTTP Request: ${req.method} ${targetUrl}`);
 
      // Validar con el servidor remoto
      const validation = await this.validateUrlWithServer(req.method!, targetUrl, req.headers);
 
      if (validation.blocked) {
        // Sitio bloqueado - devolver página de bloqueo
        this.sendBlockedResponse(res);
        return;
      }
 
      // Sitio permitido - hacer petición real localmente
      await this.makeRealRequest(req, res, targetUrl);
 
    } catch (error) {
      console.error('Error en handleHTTPRequest:', error);
      this.sendErrorResponse(res, 502, 'Error del proxy local');
    }
  }
 
  /**
   * Maneja conexiones HTTPS via CONNECT
   */
  private async handleHTTPSConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer
  ) {
    try {
      const targetUrl = `https://${req.url}`;
      console.log(`🔒 HTTPS CONNECT: ${targetUrl}`);
 
      // Validar con el servidor remoto
      const originalHeaders = { ...req.headers };
      const validation = await this.validateUrlWithServer('CONNECT', targetUrl, originalHeaders);
 
      if (validation.blocked) {
        // Conexión HTTPS bloqueada
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
      }
 
      // HTTPS permitido - establecer túnel
      this.establishHTTPSTunnel(req, clientSocket, head, targetUrl, originalHeaders);
 
    } catch (error) {
      console.error('Error en handleHTTPSConnect:', error);
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.end();
    }
  }
 
  /**
   * Valida URL con el servidor remoto via HTTP
   */
  private async validateUrlWithServer(
    method: string,
    targetUrl: string,
    headers: http.IncomingHttpHeaders
  ): Promise<{ blocked: boolean; reason?: string }> {
    // Solo validar si isMonitoring es true
    if (!this.config.isMonitoring) {
      // Si no está monitoreando, permite la URL sin consultar al backend
      return { blocked: false };
    }
    try {
      const validationUrl = `${this.config.apiBaseUrl}/proxy/validate/`;

      const response = await fetch(validationUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.eventKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: method,
          url: targetUrl,
          headers: Object.fromEntries(Object.entries(headers)),
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error(`Error validando URL: ${response.status} ${response.statusText}`);
        // En caso de error, bloquear por seguridad
        return { blocked: true, reason: 'Error de validación' };
      }

      const result = await response.json();
      return {
        blocked: result.blocked || false,
        reason: result.reason || 'Sitio no permitido'
      };

    } catch (error) {
      console.error('Error conectando con servidor:', error);
      // En caso de error de conexión, bloquear por seguridad
      return { blocked: true, reason: 'Sin conexión al servidor' };
    }
  }
 
  /**
   * Hace la petición real al sitio web
   */
  private async makeRealRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetUrl: string
  ) {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;
 
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          'host': parsedUrl.host, // Importante: corregir el host header
        },
        timeout: 10000, // 10 segundos timeout
      };
 
      const proxyReq = httpModule.request(options, (proxyRes) => {
        // Copiar status y headers
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
       
        // Pipe la respuesta
        proxyRes.pipe(res);
      });
 
      proxyReq.on('error', (error) => {
        console.error(`Error haciendo petición a ${targetUrl}:`, error);
        if (!res.headersSent) {
          this.sendErrorResponse(res, 502, 'Error conectando al sitio web');
        }
      });
 
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
          this.sendErrorResponse(res, 504, 'Timeout al conectar');
        }
      });
 
      // Pipe el request body si existe
      req.pipe(proxyReq);
 
    } catch (error) {
      console.error('Error en makeRealRequest:', error);
      this.sendErrorResponse(res, 500, 'Error interno del proxy');
    }
  }
 
  /**
   * Establece tunnel HTTPS
   */
  private establishHTTPSTunnel(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
    targetUrl: string,
    originalHeaders: http.IncomingHttpHeaders
  ) {
    if (!req.url) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.end();
      return;
    }
   
    const [hostname, port] = req.url.split(':');
   
    if (!hostname) {
      clientSocket.end();
      return;
    }
 
    const targetPort = port ? parseInt(port) : 443;
 
    const serverSocket = net.connect(targetPort, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
     
      // Pipe bidireccional
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
 
    // Revalidate periodically so blocklist changes apply to open tunnels
    const REVALIDATE_INTERVAL_MS = 15000;
    let revalidateTimer: NodeJS.Timeout | null = null;
    let isRevalidating = false;
 
    const stopRevalidation = () => {
      if (revalidateTimer) {
        clearInterval(revalidateTimer);
        revalidateTimer = null;
      }
    };
 
    const closeTunnel = () => {
      stopRevalidation();
      clientSocket.destroy();
      serverSocket.destroy();
    };
 
    revalidateTimer = setInterval(async () => {
      if (isRevalidating) return;
      isRevalidating = true;
      try {
        const validation = await this.validateUrlWithServer('CONNECT', targetUrl, originalHeaders);
        if (validation.blocked) {
          console.warn(`Closing HTTPS tunnel after block update: ${targetUrl}`);
          closeTunnel();
        }
      } catch (error) {
        console.error('Error revalidating HTTPS tunnel:', error);
      } finally {
        isRevalidating = false;
      }
    }, REVALIDATE_INTERVAL_MS);
 
    serverSocket.on('error', (error: any) => {
      // Solo loggear errores que no sean desconexiones normales
      if (error.code !== 'ECONNRESET') {
        console.error('Error en tunnel HTTPS:', error);
      }
      clientSocket.end();
      stopRevalidation();
    });
 
    clientSocket.on('error', (error: any) => {
      // Solo loggear errores que no sean desconexiones normales
      if (error.code !== 'ECONNRESET') {
        console.error('Error en socket cliente:', error);
      }
      serverSocket.end();
      stopRevalidation();
    });
 
    clientSocket.on('close', stopRevalidation);
    serverSocket.on('close', stopRevalidation);
  }
  /**
   * Envía respuesta de sitio bloqueado (simplificada)
   */
  private sendBlockedResponse(res: http.ServerResponse) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('Sitio bloqueado durante la evaluación');
  }
 
  /**
   * Envía respuesta de error (simplificada)
   */
  private sendErrorResponse(res: http.ServerResponse, statusCode: number, message: string) {
    if (res.headersSent) return;
 
    res.writeHead(statusCode, {
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end(`Error: ${message}`);
  }
 
  /**
   * Detiene el servidor proxy local
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server || !this.isRunning) {
        resolve();
        return;
      }
 
      // Timeout para evitar colgado infinito
      const timeout = setTimeout(() => {
        console.warn('⚠️ Timeout deteniendo servidor, forzando cierre...');
        this.isRunning = false;
        this.server = null;
        this.emit('stopped');
        resolve();
      }, 2000); // 2 segundos de timeout
 
      this.server.close(() => {
        clearTimeout(timeout);
        this.isRunning = false;
        console.log('🛑 Proxy local detenido');
        this.emit('stopped');
        resolve();
      });
    });
  }
 
  /**
   * Verifica si el servidor está ejecutándose
   */
  isActive(): boolean {
    return this.isRunning;
  }
 
  /**
   * Obtiene el puerto local
   */
  getPort(): number {
    return this.localPort;
  }
 
  /**
   * Actualiza la configuración
   */
  updateConfig(config: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...config };
  }
}