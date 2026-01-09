import { describe, expect, it, vi } from "vitest";

import { execFileSync } from "child_process";

import { ProxyMonitor } from "../proxy-monitor";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

describe("ProxyMonitor", () => {
  it("starts and stops monitoring", () => {
    vi.useFakeTimers();
    const monitor = new ProxyMonitor(8888);

    vi.spyOn(monitor as any, "getSystemProxySettings").mockReturnValue({
      enabled: true,
      server: "localhost",
      port: 8888,
    });

    monitor.start();
    expect(monitor.isActive()).toBe(true);

    monitor.stop();
    expect(monitor.isActive()).toBe(false);

    vi.useRealTimers();
  });

  it("emits tampering after consecutive failures", () => {
    const monitor = new ProxyMonitor(8888);
    const handler = vi.fn();

    monitor.on("tampering-detected", handler);

    vi.spyOn(monitor as any, "getSystemProxySettings").mockReturnValue({
      enabled: false,
      server: "",
      port: 0,
    });

    (monitor as any).checkProxyIntegrity();
    (monitor as any).checkProxyIntegrity();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not emit tampering when settings are valid", () => {
    const monitor = new ProxyMonitor(8888);
    const handler = vi.fn();

    monitor.on("tampering-detected", handler);

    vi.spyOn(monitor as any, "getSystemProxySettings").mockReturnValue({
      enabled: true,
      server: "localhost",
      port: 8888,
    });

    (monitor as any).checkProxyIntegrity();

    expect(handler).not.toHaveBeenCalled();
  });

  it("emits proxy-restored when settings recover", () => {
    const monitor = new ProxyMonitor(8888);
    const restored = vi.fn();

    monitor.on("proxy-restored", restored);

    const getSettings = vi
      .spyOn(monitor as any, "getSystemProxySettings")
      .mockReturnValueOnce({
        enabled: false,
        server: "",
        port: 0,
      })
      .mockReturnValueOnce({
        enabled: true,
        server: "localhost",
        port: 8888,
      });

    (monitor as any).checkProxyIntegrity();
    (monitor as any).checkProxyIntegrity();

    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(restored).toHaveBeenCalledOnce();
  });

  it("updates expected port", () => {
    const monitor = new ProxyMonitor(8888);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    monitor.updateExpectedPort(9000);

    expect(logSpy).toHaveBeenCalled();
  });

  it("parses system proxy settings from powershell output", () => {
    const monitor = new ProxyMonitor(8888);
    const execMock = vi.mocked(execFileSync);

    execMock.mockReturnValue(
      JSON.stringify({
        enabled: true,
        server: "http://localhost:8888",
      }),
    );

    const settings = (monitor as any).getSystemProxySettings();

    expect(settings.enabled).toBe(true);
    expect(settings.server).toBe("localhost");
    expect(settings.port).toBe(8888);
  });

  it("returns disabled settings when exec fails", () => {
    const monitor = new ProxyMonitor(8888);
    const execMock = vi.mocked(execFileSync);

    execMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const settings = (monitor as any).getSystemProxySettings();

    expect(settings.enabled).toBe(false);
    expect(settings.port).toBe(0);
  });
});
