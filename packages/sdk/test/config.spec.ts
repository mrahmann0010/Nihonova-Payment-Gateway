import { afterEach, describe, expect, it, vi } from "vitest";
import { createGatewayClient, GatewayConfigError } from "../src";

const good = {
  baseUrl: "https://gateway.example",
  clientId: "sakura-book",
  secret: "s3cret",
  fetch: vi.fn(),
};

const build = (patch: Record<string, unknown>) => () =>
  createGatewayClient({ ...good, ...patch } as Parameters<typeof createGatewayClient>[0]);

describe("createGatewayClient config", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a complete config", () => {
    expect(build({})().enabled).toBe(true);
    expect(build({})().clientId).toBe("sakura-book");
  });

  it("refuses half a config, naming what is missing", () => {
    expect(build({ secret: undefined })).toThrow(/missing secret/);
    expect(build({ baseUrl: " ", clientId: "" })).toThrow(/missing baseUrl, clientId/);
  });

  it("requires https except on localhost", () => {
    expect(build({ baseUrl: "http://gateway.example" })).toThrow(GatewayConfigError);
    expect(build({ baseUrl: "http://localhost:3001" })().enabled).toBe(true);
    expect(build({ baseUrl: "http://127.0.0.1:3001" })().enabled).toBe(true);
  });

  it("refuses a base URL that is not one, or that carries credentials or a query", () => {
    expect(build({ baseUrl: "gateway.example" })).toThrow(/not a URL/);
    expect(build({ baseUrl: "https://u:p@gateway.example" })).toThrow(GatewayConfigError);
    expect(build({ baseUrl: "https://gateway.example?x=1" })).toThrow(GatewayConfigError);
  });

  it("refuses a client ID with a dot, which would split the credential wrongly", () => {
    expect(build({ clientId: "sakura.book" })).toThrow(/dot/);
  });

  it("refuses nonsense timeouts and retry counts", () => {
    expect(build({ timeoutMs: 0 })).toThrow(GatewayConfigError);
    expect(build({ totalBudgetMs: -1 })).toThrow(GatewayConfigError);
    expect(build({ maxRetries: 1.5 })).toThrow(GatewayConfigError);
  });

  it("refuses to run in a browser", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    expect(build({})).toThrow(/server-side only/);
  });

  it("does not put the secret in any error message", () => {
    try {
      build({ baseUrl: "http://gateway.example" })();
    } catch (error) {
      expect(String(error)).not.toContain("s3cret");
    }
  });
});
