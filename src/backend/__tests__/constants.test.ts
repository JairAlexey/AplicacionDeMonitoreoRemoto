import { describe, expect, it, vi } from "vitest";

import { PROXY_SCRIPTS } from "../constants";

describe("PROXY_SCRIPTS", () => {
  it("builds scripts with provided host and port", () => {
    const scripts = PROXY_SCRIPTS(8888, "localhost");

    expect(scripts.SET_PROXY_SETTINGS).toContain("ProxyServer -Value \"localhost:8888\"");
    expect(scripts.IS_PROXY_CONNECTED).toContain("localhost:8888");
  });

  it("uses default host from env when not provided", () => {
    process.env.PROXY_HOST = "proxy.local";

    const scripts = PROXY_SCRIPTS(9000);

    expect(scripts.SET_PROXY_SETTINGS).toContain("proxy.local:9000");
  });
});

describe("getApiConfig", () => {
  it("returns development config when NODE_ENV is development", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";

    const constants = await import("../constants");
    const config = constants.getApiConfig();

    expect(config.BASE_URL).toBe("http://127.0.0.1:8000");
  });

  it("returns production config when NODE_ENV is not development", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.SIX_API_BASE_URL = "http://prod.example.com";

    const constants = await import("../constants");
    const config = constants.getApiConfig();

    expect(config.BASE_URL).toBe("http://prod.example.com");
  });
});
