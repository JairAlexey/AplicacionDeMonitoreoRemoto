import { EventEmitter } from "events";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { connect } from "net";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalProxyServer } from "../local-proxy-server";

vi.mock("http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("http")>();
  return {
    ...actual,
    createServer: vi.fn(),
    request: vi.fn(),
  };
});

const createServerMock = vi.mocked(createServer);
const httpRequestMock = vi.mocked(httpRequest);

vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("https")>();
  return {
    ...actual,
    request: vi.fn(),
  };
});

const httpsRequestMock = vi.mocked(httpsRequest);

vi.mock("net", () => ({
  connect: vi.fn(),
}));

const netConnectMock = vi.mocked(connect);

const makeServer = (isMonitoring: boolean) =>
  new LocalProxyServer({
    eventKey: "event-key",
    remoteHost: "remote",
    apiBaseUrl: "http://api.test",
    isMonitoring,
  });

describe("LocalProxyServer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    createServerMock.mockReset();
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
    netConnectMock.mockReset();
  });

  it("skips validation when monitoring is disabled", async () => {
    const server = makeServer(false);
    const result = await (server as any).validateUrlWithServer(
      "GET",
      "http://example.com",
      {},
    );

    expect(result.blocked).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("blocks when validation response is not ok", async () => {
    const server = makeServer(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    }) as unknown as typeof fetch;

    const result = await (server as any).validateUrlWithServer(
      "GET",
      "http://example.com",
      {},
    );

    expect(result.blocked).toBe(true);
  });

  it("returns blocked false when validation succeeds", async () => {
    const server = makeServer(true);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ blocked: false }),
    }) as unknown as typeof fetch;

    const result = await (server as any).validateUrlWithServer(
      "GET",
      "http://example.com",
      {},
    );

    expect(result.blocked).toBe(false);
  });

  it("blocks when validation throws", async () => {
    const server = makeServer(true);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;

    const result = await (server as any).validateUrlWithServer(
      "GET",
      "http://example.com",
      {},
    );

    expect(result.blocked).toBe(true);
  });

  it("handles HTTP request that is blocked", async () => {
    const server = makeServer(true);
    const sendBlocked = vi.spyOn(server as any, "sendBlockedResponse");
    const makeReal = vi.spyOn(server as any, "makeRealRequest");
    vi.spyOn(server as any, "validateUrlWithServer").mockResolvedValue({
      blocked: true,
    });

    const req = { method: "GET", url: "http://example.com", headers: {} } as IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleHTTPRequest(req, res);

    expect(sendBlocked).toHaveBeenCalledOnce();
    expect(makeReal).not.toHaveBeenCalled();
  });

  it("handles HTTP request that is allowed", async () => {
    const server = makeServer(true);
    const sendBlocked = vi.spyOn(server as any, "sendBlockedResponse");
    const makeReal = vi.spyOn(server as any, "makeRealRequest").mockResolvedValue(undefined);
    vi.spyOn(server as any, "validateUrlWithServer").mockResolvedValue({
      blocked: false,
    });

    const req = { method: "GET", url: "http://example.com", headers: {} } as IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleHTTPRequest(req, res);

    expect(makeReal).toHaveBeenCalledOnce();
    expect(sendBlocked).not.toHaveBeenCalled();
  });

  it("handles HTTP request errors", async () => {
    const server = makeServer(true);
    const sendError = vi.spyOn(server as any, "sendErrorResponse");
    vi.spyOn(server as any, "validateUrlWithServer").mockRejectedValue(
      new Error("boom"),
    );

    const req = { method: "GET", url: "http://example.com", headers: {} } as IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    await (server as any).handleHTTPRequest(req, res);

    expect(sendError).toHaveBeenCalledWith(res, 502, expect.any(String));
  });

  it("handles HTTPS connect when blocked", async () => {
    const server = makeServer(true);
    vi.spyOn(server as any, "validateUrlWithServer").mockResolvedValue({
      blocked: true,
    });

    const clientSocket = {
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as import("net").Socket;

    const req = { url: "example.com:443", headers: {} } as IncomingMessage;

    await (server as any).handleHTTPSConnect(req, clientSocket, Buffer.from(""));

    expect(clientSocket.write).toHaveBeenCalledWith(
      "HTTP/1.1 403 Forbidden\r\n\r\n",
    );
    expect(clientSocket.end).toHaveBeenCalledOnce();
  });

  it("handles HTTPS connect when allowed", async () => {
    const server = makeServer(true);
    const establish = vi
      .spyOn(server as any, "establishHTTPSTunnel")
      .mockImplementation(() => {});
    vi.spyOn(server as any, "validateUrlWithServer").mockResolvedValue({
      blocked: false,
    });

    const clientSocket = {
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as import("net").Socket;

    const req = { url: "example.com:443", headers: {} } as IncomingMessage;

    await (server as any).handleHTTPSConnect(req, clientSocket, Buffer.from(""));

    expect(establish).toHaveBeenCalledOnce();
  });

  it("sends blocked response", () => {
    const server = makeServer(false);
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    (server as any).sendBlockedResponse(res);

    expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    expect(res.end).toHaveBeenCalled();
  });

  it("sends error response when headers not sent", () => {
    const server = makeServer(false);
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    (server as any).sendErrorResponse(res, 502, "Proxy error");

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith("Error: Proxy error");
  });

  it("skips error response when headers already sent", () => {
    const server = makeServer(false);
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: true,
    } as unknown as ServerResponse;

    (server as any).sendErrorResponse(res, 502, "Proxy error");

    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("starts and stops without opening real sockets", async () => {
    const fakeServer = {
      on: vi.fn(),
      listen: vi.fn((_port: number, _host: string, cb: () => void) => cb()),
      close: vi.fn((cb: () => void) => cb()),
    } as unknown as ReturnType<typeof createServer>;

    createServerMock.mockReturnValue(fakeServer);

    const server = makeServer(false);
    const port = await server.start();

    expect(port).toBe(8888);
    expect(server.isActive()).toBe(true);

    await server.stop();
    expect(server.isActive()).toBe(false);

    createServerMock.mockReset();
  });

  it("returns early when HTTPS tunnel has no url", () => {
    const server = makeServer(false);
    const clientSocket = {
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
    } as unknown as import("net").Socket;

    const req = { url: undefined } as IncomingMessage;

    (server as any).establishHTTPSTunnel(
      req,
      clientSocket,
      Buffer.from(""),
      "https://example.com",
      {},
    );

    expect(clientSocket.write).toHaveBeenCalledWith(
      "HTTP/1.1 400 Bad Request\r\n\r\n",
    );
    expect(clientSocket.end).toHaveBeenCalledOnce();
  });

  it("returns early when HTTPS tunnel has no hostname", () => {
    const server = makeServer(false);
    const clientSocket = {
      end: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      write: vi.fn(),
    } as unknown as import("net").Socket;

    const req = { url: ":443" } as IncomingMessage;

    (server as any).establishHTTPSTunnel(
      req,
      clientSocket,
      Buffer.from(""),
      "https://example.com",
      {},
    );

    expect(clientSocket.end).toHaveBeenCalledOnce();
  });

  it("establishes HTTPS tunnel and closes on revalidation", async () => {
    vi.useFakeTimers();
    const server = makeServer(true);
    vi.spyOn(server as any, "validateUrlWithServer").mockResolvedValue({
      blocked: true,
    });

    const makeSocket = () => {
      const socket = new EventEmitter() as EventEmitter &
        import("net").Socket & {
          write: ReturnType<typeof vi.fn>;
          pipe: ReturnType<typeof vi.fn>;
          end: ReturnType<typeof vi.fn>;
          destroy: ReturnType<typeof vi.fn>;
        };
      socket.write = vi.fn();
      socket.pipe = vi.fn();
      socket.end = vi.fn();
      socket.destroy = vi.fn();
      return socket;
    };

    const clientSocket = makeSocket();
    const serverSocket = makeSocket();

    netConnectMock.mockImplementation(
      (_port: number, _host: string, cb: () => void) => {
        queueMicrotask(cb);
        return serverSocket;
      },
    );

    const req = { url: "example.com:443" } as IncomingMessage;

    (server as any).establishHTTPSTunnel(
      req,
      clientSocket,
      Buffer.from(""),
      "https://example.com",
      {},
    );

    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();

    expect(clientSocket.write).toHaveBeenCalledWith(
      "HTTP/1.1 200 Connection Established\r\n\r\n",
    );
    expect(clientSocket.pipe).toHaveBeenCalledWith(serverSocket);
    expect(serverSocket.pipe).toHaveBeenCalledWith(clientSocket);
    expect(clientSocket.destroy).toHaveBeenCalled();
    expect(serverSocket.destroy).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("makes real request and handles error and timeout", async () => {
    const server = makeServer(false);
    const sendError = vi.spyOn(server as any, "sendErrorResponse");

    let errorHandler: ((err: Error) => void) | null = null;
    let timeoutHandler: (() => void) | null = null;

    const proxyReq = {
      on: vi.fn((event: string, handler: any) => {
        if (event === "error") errorHandler = handler;
        if (event === "timeout") timeoutHandler = handler;
      }),
      destroy: vi.fn(),
      pipe: vi.fn(),
    };

    httpRequestMock.mockImplementation((_options: any, cb: any) => {
      const proxyRes = {
        statusCode: 200,
        headers: {},
        pipe: vi.fn(),
      };
      cb(proxyRes);
      return proxyReq as any;
    });

    const req = {
      method: "GET",
      headers: {},
      pipe: vi.fn(),
    } as unknown as IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    await (server as any).makeRealRequest(req, res, "http://example.com");

    expect(req.pipe).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalled();

    errorHandler?.(new Error("boom"));
    timeoutHandler?.();

    expect(sendError).toHaveBeenCalled();
    expect(proxyReq.destroy).toHaveBeenCalled();
  });

  it("uses https module for https requests", async () => {
    const server = makeServer(false);

    httpsRequestMock.mockImplementation((_options: any, cb: any) => {
      const proxyRes = {
        statusCode: 200,
        headers: {},
        pipe: vi.fn(),
      };
      cb(proxyRes);
      return {
        on: vi.fn(),
        destroy: vi.fn(),
        pipe: vi.fn(),
      } as any;
    });

    const req = {
      method: "GET",
      headers: {},
      pipe: vi.fn(),
    } as unknown as IncomingMessage;
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    } as unknown as ServerResponse;

    await (server as any).makeRealRequest(req, res, "https://example.com");

    expect(httpsRequestMock).toHaveBeenCalled();
  });

  it("updates config", () => {
    const server = makeServer(false);

    server.updateConfig({ isMonitoring: true });

    expect((server as any).config.isMonitoring).toBe(true);
  });
});
