import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src";

describe("Shortlink Worker", () => {
  const PASSKEY = "test-token";

  beforeAll(async () => {
    // Setup D1 table for tests if using local D1 in tests
    // Note: Vitest pool for workers usually handles a fresh D1 per test if configured,
    // but here we just ensure the table exists if needed.
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS links (
        code TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `).run();
    
    // Set the auth token in env for the worker to see
    env.PASSKEY_AUTH = PASSKEY;
  });

  describe("API Authentication", () => {
    it("should return 401 if no authorization header", async () => {
      const request = new Request("http://example.com/api/links");
      const response = await worker.fetch(request, env, createExecutionContext());
      expect(response.status).toBe(401);
    });

    it("should return 401 if invalid authorization header", async () => {
      const request = new Request("http://example.com/api/links", {
        headers: { "Authorization": "Bearer wrong-token" }
      });
      const response = await worker.fetch(request, env, createExecutionContext());
      expect(response.status).toBe(401);
    });
  });

  describe("CRUD Operations", () => {
    let testCode = "test-google";

    it("should create a shortlink", async () => {
      const request = new Request("http://example.com/api/link", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PASSKEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: "https://google.com",
          key: testCode
        })
      });
      const response = await worker.fetch(request, env, createExecutionContext());
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.code).toBe(testCode);
    });

    it("should list shortlinks", async () => {
      const request = new Request("http://example.com/api/links", {
        headers: { "Authorization": `Bearer ${PASSKEY}` }
      });
      const response = await worker.fetch(request, env, createExecutionContext());
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it("should update a shortlink", async () => {
      const request = new Request(`http://example.com/api/link/${testCode}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${PASSKEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: "https://bing.com"
        })
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.updated_at).not.toBeNull();
    });

    it("should delete a shortlink", async () => {
      const request = new Request(`http://example.com/api/link/${testCode}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${PASSKEY}` }
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      expect(response.status).toBe(200);
    });
  });

  describe("Redirect Logic", () => {
    const redirectCode = "go-google";

    beforeAll(async () => {
      await env.DB.prepare("INSERT INTO links (code, url) VALUES (?, ?)")
        .bind(redirectCode, "https://google.com")
        .run();
    });

    it("should redirect to the target URL", async () => {
      const request = new Request(`http://example.com/${redirectCode}`);
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://google.com");
      expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    });

    it("should return 404 for unknown code", async () => {
      const request = new Request("http://example.com/unknown-code");
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.message).toBe("Link Not Found");
      expect(response.headers.get("Cache-Control")).toContain("max-age=1800");
    });
  });
});
