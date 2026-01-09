import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

let lastConfig: any = null;
let lastInstance: FakeLocalProxyServer | null = null;

class FakeLocalProxyServer extends EventEmitter {
  public config: any;
  private started = false;
  public start = vi.fn(async () => {
    this.started = true;
    this.emit("started", 8888);
    return 8888;
  });
  public stop = vi.fn(async () => {
    this.started = false;
    this.emit("stopped");
  });
  public isActive = vi.fn(() => this.started);
  public getPort = vi.fn(() => 8888);
  public updateConfig = vi.fn((config: any) => {
    this.config = { ...this.config, ...config };
  });

  constructor(config: any) {
    super();
    this.config = config;
    lastConfig = config;
    lastInstance = this;
  }
}

const proxyMonitorMock = {
  updateExpectedPort: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  removeAllListeners: vi.fn(),
  on: vi.fn(),
};

vi.mock("../local-proxy-server", () => ({
  LocalProxyServer: FakeLocalProxyServer,
}));

vi.mock("../proxy-monitor", () => ({
  proxyMonitor: proxyMonitorMock,
}));

vi.mock("../callbacks", () => ({
  getMonitoringStatus: vi.fn(() => false),
  handleProxyTampering: vi.fn(),
  disableSystemProxy: vi.fn().mockResolvedValue(true),
}));

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("connectionManager", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    lastConfig = null;
    lastInstance = null;
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("connects and starts local proxy", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    const { connectionManager } = await import("../connection-manager");
    const { execFileSync } = await import("child_process");

    const port = await connectionManager.connect("event-key");

    expect(port).toBe(8888);
    expect(lastConfig.eventKey).toBe("event-key");
    expect(proxyMonitorMock.updateExpectedPort).toHaveBeenCalledWith(8888);
    expect(proxyMonitorMock.start).toHaveBeenCalledOnce();
    expect(proxyMonitorMock.removeAllListeners).toHaveBeenCalledWith(
      "tampering-detected",
    );
    expect(proxyMonitorMock.on).toHaveBeenCalledWith(
      "tampering-detected",
      expect.any(Function),
    );
    expect(execFileSync).toHaveBeenCalledOnce();
  });

  it("throws when auth fails with json error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "bad-key" })),
    }) as unknown as typeof fetch;

    const { connectionManager } = await import("../connection-manager");

    await expect(connectionManager.connect("event-key")).rejects.toThrow(
      "bad-key",
    );
  });

  it("throws when auth fails with plain error text", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("invalid"),
    }) as unknown as typeof fetch;

    const { connectionManager } = await import("../connection-manager");

    await expect(connectionManager.connect("event-key")).rejects.toThrow(
      "invalid",
    );
  });

  it("reports connection status and updates proxy config", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    const { connectionManager } = await import("../connection-manager");

    await connectionManager.connect("event-key");
    expect(connectionManager.isConnected()).toBe(true);
    expect(connectionManager.getLocalPort()).toBe(8888);

    connectionManager.updateProxyConfig({ isMonitoring: true });
    expect(lastInstance?.updateConfig).toHaveBeenCalledWith({
      isMonitoring: true,
    });
  });

  it("disconnects and clears event key", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    const { connectionManager } = await import("../connection-manager");

    await connectionManager.connect("event-key");
    await connectionManager.disconnect();

    expect(lastInstance?.stop).toHaveBeenCalledOnce();
    expect(connectionManager.getEventKey()).toBe("");
  });

  it("returns fixed assigned port", async () => {
    const { connectionManager } = await import("../connection-manager");

    expect(connectionManager.getAssignedPort()).toBe(8888);
  });
});
