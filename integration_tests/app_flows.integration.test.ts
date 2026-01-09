import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FetchConfig = {
  ok: boolean;
  status?: number;
  statusText?: string;
  jsonData?: unknown;
  textData?: string;
};

type RouteMap = Record<string, FetchConfig | FetchConfig[]>;

const buildResponse = (config: FetchConfig) => ({
  ok: config.ok,
  status: config.status ?? (config.ok ? 200 : 500),
  statusText: config.statusText ?? "",
  json: vi.fn().mockResolvedValue(config.jsonData ?? {}),
  text: vi.fn().mockResolvedValue(config.textData ?? ""),
});

const createFetchMock = (routes: RouteMap) => {
  const fetchMock = vi.fn().mockImplementation((input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = typeof input === "string" ? input : input.toString();
    const key = `${method} ${url}`;
    const route = routes[key];
    if (!route) {
      throw new Error(`No mock for ${key}`);
    }
    const config = Array.isArray(route) ? route.shift() : route;
    if (!config) {
      throw new Error(`No mock configured for ${key}`);
    }
    return Promise.resolve(buildResponse(config));
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

class FormDataMock {
  private entries: Record<string, unknown> = {};

  append(key: string, value: unknown) {
    this.entries[key] = value;
  }
}

let lastProxyInstance: FakeLocalProxyServer | null = null;
const proxyMonitorMock = {
  updateExpectedPort: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  removeAllListeners: vi.fn(),
  on: vi.fn(),
};
const browserWindowSend = vi.fn();
const childProcessMock = {
  execFileSync: vi.fn(),
  execFile: vi.fn(
    (_cmd: string, _args: string[], cb: (error: Error | null, output?: string) => void) => {
      cb(null, "true");
    },
  ),
};
const electronMock = {
  nativeImage: {
    createFromDataURL: vi.fn(() => ({
      toPNG: () => Buffer.from("image"),
    })),
  },
  desktopCapturer: {
    getSources: vi.fn(async () => [
      { name: "Screen 1", thumbnail: { toDataURL: () => "data" } },
    ]),
  },
  screen: {
    getPrimaryDisplay: () => ({ size: { width: 800, height: 600 } }),
    getAllDisplays: () => [{}, {}],
  },
  app: { quit: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => ({ minimize: vi.fn() })),
    getAllWindows: vi.fn(() => [{ webContents: { send: browserWindowSend } }]),
  },
};

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
    lastProxyInstance = this;
  }
}

vi.mock("../src/backend/local-proxy-server", () => ({
  LocalProxyServer: FakeLocalProxyServer,
}));

vi.mock("../src/backend/proxy-monitor", () => ({
  proxyMonitor: proxyMonitorMock,
}));

vi.mock("child_process", () => ({
  __esModule: true,
  ...childProcessMock,
  default: childProcessMock,
}));

vi.mock("electron", () => ({
  __esModule: true,
  ...electronMock,
  default: electronMock,
}));

describe("app integration flows", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    lastProxyInstance = null;
    globalThis.FormData = FormDataMock as unknown as typeof FormData;
    process.env["NODE_ENV"] = "development";
  });

  it("runs join -> proxy -> monitoring -> capture -> upload -> exit flow", async () => {
    const { API_BASE_URL } = await import("../src/backend/config");
    createFetchMock({
      [`GET ${API_BASE_URL}/events/api/verify-event-key`]: {
        ok: true,
        jsonData: { isValid: true, dateIsValid: true },
      },
      [`POST ${API_BASE_URL}/proxy/auth-http/`]: { ok: true },
      [`POST ${API_BASE_URL}/proxy/start-monitoring/`]: { ok: true },
      [`POST ${API_BASE_URL}/events/api/logging/screen/capture`]: { ok: true },
      [`POST ${API_BASE_URL}/events/api/logging/media/capture`]: { ok: true },
      [`POST ${API_BASE_URL}/proxy/stop-monitoring/`]: { ok: true },
      [`POST ${API_BASE_URL}/proxy/disconnect-http/`]: { ok: true },
    });

    const callbacks = await import("../src/backend/callbacks");
    const { connectionManager } = await import("../src/backend/connection-manager");
    const { app } = await import("electron");
    vi.spyOn(callbacks, "disableSystemProxy").mockResolvedValue(true);

    const joined = await callbacks.joinEvent("event-key");
    expect(joined).toBe(true);

    const proxyStarted = await callbacks.startProxy();
    expect(proxyStarted).toBe(true);
    expect(connectionManager.isConnected()).toBe(true);

    const monitoringStarted = await callbacks.startMonitoring();
    expect(monitoringStarted).toBe(true);
    expect(lastProxyInstance?.updateConfig).toHaveBeenCalledWith({
      isMonitoring: true,
    });

    await callbacks.captureDesktop();
    await callbacks.uploadMedia(new ArrayBuffer(16));

    const monitoringStopped = await callbacks.stopMonitoring();
    expect(monitoringStopped).toBe(true);
    expect(lastProxyInstance?.updateConfig).toHaveBeenCalledWith({
      isMonitoring: false,
    });

    await callbacks.exitEvent();
    expect(app.quit).toHaveBeenCalledOnce();
    expect(connectionManager.isConnected()).toBe(false);
  });

  it("handles proxy tampering and stops monitoring", async () => {
    vi.useFakeTimers();
    const { API_BASE_URL } = await import("../src/backend/config");
    createFetchMock({
      [`GET ${API_BASE_URL}/events/api/verify-event-key`]: {
        ok: true,
        jsonData: { isValid: true, dateIsValid: true },
      },
      [`POST ${API_BASE_URL}/proxy/auth-http/`]: { ok: true },
      [`POST ${API_BASE_URL}/proxy/start-monitoring/`]: { ok: true },
      [`POST ${API_BASE_URL}/proxy/stop-monitoring/`]: { ok: true },
      [`POST ${API_BASE_URL}/events/api/logging/http-request`]: { ok: true },
    });

    const callbacks = await import("../src/backend/callbacks");

    const joined = await callbacks.joinEvent("event-key");
    expect(joined).toBe(true);

    await callbacks.startProxy();
    const monitoringStarted = await callbacks.startMonitoring();
    expect(monitoringStarted).toBe(true);

    const tamperingPromise = callbacks.handleProxyTampering("Proxy disabled");
    await vi.runAllTimersAsync();
    await tamperingPromise;

    expect(browserWindowSend).toHaveBeenCalledWith(
      "proxy-tampering",
      expect.objectContaining({ reason: "Proxy disabled" }),
    );
    expect(lastProxyInstance?.updateConfig).toHaveBeenCalledWith({
      isMonitoring: false,
    });

    vi.useRealTimers();
  });
});
