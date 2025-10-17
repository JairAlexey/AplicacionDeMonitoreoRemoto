import { EventEmitter } from "events";
import * as net from "net";
import { PROXY_SCRIPTS } from "./constants";
import { execFileSync } from "child_process";
import { EvalTechAPI } from "../frontend/api";

class ConnectionManager extends EventEmitter {
  private assignedPort: number | null = null;
  private gatewayConnection: net.Socket | null = null;
  private proxyConnection: net.Socket | null = null;
  private eventKey: string = "";

  async connect(eventKey: string): Promise<number> {
    this.eventKey = eventKey;
    console.log("EventKey:", eventKey);
    return new Promise((resolve, reject) => {
      this.gatewayConnection = net.connect({
        host: process.env["PROXY_HOST"] || "127.0.0.1",
        port: parseInt(process.env["PROXY_PORT"] || "20000"),
      });

      this.gatewayConnection.on("connect", () => {
        const authHeader = `Authorization: Bearer ${eventKey}\r\n\r\n`;
        this.gatewayConnection?.write(authHeader);
      });

      this.gatewayConnection.on("data", (data) => {
        const response = data.toString();

        if (response.startsWith("ASSIGNED_PORT:")) {
          const portString = response.split(":")[1]?.trim();

          if (!portString) {
            reject(new Error("Formato de puerto inválido"));
            return;
          }

          const portNumber = parseInt(portString, 10);

          if (isNaN(portNumber)) {
            reject(new Error("Puerto no es numérico"));
            return;
          }

          this.assignedPort = portNumber;
          this._setupProxy();
          resolve(portNumber);
        } else {
          reject(new Error("Autenticación fallida"));
        }
      });

      this.gatewayConnection.on("error", reject);
    });
  }

  private _setupProxy() {
    if (!this.assignedPort) return;

    const scripts = PROXY_SCRIPTS(this.assignedPort);
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      scripts.SET_PROXY_SETTINGS,
    ]);

    this.proxyConnection = net.connect({
      host: process.env["PROXY_HOST"],
      port: this.assignedPort,
    });

    this.proxyConnection.on("data", (data) => {
      this.emit("data", data);
    });
  }

  send(data: string | Buffer) {
    this.proxyConnection?.write(data);
  }

  async disconnect() {
    if (this.assignedPort) {
      const scripts = PROXY_SCRIPTS(this.assignedPort);

      execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        scripts.UNSET_PROXY_SETTINGS,
      ]);

      try {
        console.log("AssignedPort:", this.assignedPort);
        await fetch(
          `${process.env["SIX_API_BASE_URL"] || "https://six.zpaceway.com/api"}${EvalTechAPI.stopProxy}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.eventKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `port=${this.assignedPort}`,
          },
        );
      } catch (error) {
        console.error("Error liberando puerto:", error);
      }
    }
    this.gatewayConnection?.destroy();
    this.proxyConnection?.destroy();
  }
}

export const connectionManager = new ConnectionManager();
