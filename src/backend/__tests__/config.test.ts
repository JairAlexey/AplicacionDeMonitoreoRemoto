import { describe, expect, it, vi } from "vitest";

describe("config", () => {
  it("uses development API URL when NODE_ENV is development", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "development";

    const config = await import("../config");

    expect(config.API_BASE_URL).toBe("http://127.0.0.1:8000");
  });

  it("uses production API URL when NODE_ENV is not development", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "production";

    const config = await import("../config");

    expect(config.API_BASE_URL).toBe(
      "https://backend-production-b180.up.railway.app",
    );
  });

  it("builds full API url using getApiUrl", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.NODE_ENV = "development";

    const config = await import("../config");

    expect(config.getApiUrl("/events")).toBe("http://127.0.0.1:8000/events");
  });

  it("exposes known API routes", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const config = await import("../config");

    expect(config.API_ROUTES.PROXY_AUTH).toBe("/proxy/auth-http/");
    expect(config.API_ROUTES.MEDIA_CAPTURE).toBe("/behavior/upload-media/");
  });
});
