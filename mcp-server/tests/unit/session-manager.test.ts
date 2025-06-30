import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { SessionManager, SessionState, resetSessionManager } from "../../src/sessions/manager";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

describe("SessionManager", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionManager.shutdown();
    resetSessionManager();
  });

  describe("createSession", () => {
    it("should create a new session with proper defaults", () => {
      const capabilities: ServerCapabilities = {
        tools: {},
        resources: { subscribe: true },
        prompts: {},
        logging: {},
      };

      const session = sessionManager.createSession("stdio", capabilities, {
        clientName: "test-client",
        clientVersion: "1.0.0",
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.state).toBe(SessionState.INITIALIZING);
      expect(session.transport).toBe("stdio");
      expect(session.capabilities).toEqual(capabilities);
      expect(session.metadata.clientName).toBe("test-client");
      expect(session.metadata.clientVersion).toBe("1.0.0");
      expect(session.rateLimit.tokens).toBeGreaterThan(0);
    });

    it("should emit created event", (done) => {
      const capabilities: ServerCapabilities = {};

      sessionManager.on("created", (session) => {
        expect(session).toBeDefined();
        expect(session.transport).toBe("http-sse");
        done();
      });

      sessionManager.createSession("http-sse", capabilities);
    });
  });

  describe("getSession", () => {
    it("should retrieve an existing session", () => {
      const capabilities: ServerCapabilities = {};
      const created = sessionManager.createSession("stdio", capabilities);

      const retrieved = sessionManager.getSession(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("should return undefined for non-existent session", () => {
      const retrieved = sessionManager.getSession("non-existent-id");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("updateSessionState", () => {
    it("should update session state", () => {
      const capabilities: ServerCapabilities = {};
      const session = sessionManager.createSession("stdio", capabilities);

      const updated = sessionManager.updateSessionState(session.id, SessionState.ACTIVE);
      expect(updated).toBe(true);

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved?.state).toBe(SessionState.ACTIVE);
    });
  });

  describe("isRateLimited", () => {
    it("should enforce rate limiting", () => {
      const capabilities: ServerCapabilities = {};
      const session = sessionManager.createSession("stdio", capabilities);

      const initialTokens = session.rateLimit.tokens;

      for (let i = 0; i < initialTokens; i++) {
        expect(sessionManager.isRateLimited(session.id)).toBe(false);
      }

      expect(sessionManager.isRateLimited(session.id)).toBe(true);
    });
  });

  describe("removeSession", () => {
    it("should remove session and emit event", (done) => {
      const capabilities: ServerCapabilities = {};
      const session = sessionManager.createSession("stdio", capabilities);

      sessionManager.on("removed", (sessionId, reason) => {
        expect(sessionId).toBe(session.id);
        expect(reason).toBe("test-removal");
        done();
      });

      const removed = sessionManager.removeSession(session.id, "test-removal");
      expect(removed).toBe(true);

      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getStatistics", () => {
    it("should return session statistics", () => {
      const capabilities: ServerCapabilities = {};

      const session1 = sessionManager.createSession("stdio", capabilities);
      const session2 = sessionManager.createSession("http-sse", capabilities);
      sessionManager.updateSessionState(session1.id, SessionState.ACTIVE);
      sessionManager.updateSessionState(session2.id, SessionState.ACTIVE);

      const stats = sessionManager.getStatistics();

      expect(stats.totalSessions).toBe(2);
      expect(stats.byState[SessionState.ACTIVE]).toBe(2);
      expect(stats.byTransport["stdio"]).toBe(1);
      expect(stats.byTransport["http-sse"]).toBe(1);
      expect(stats.totalRequests).toBe(0);
      expect(stats.rateLimitExceeded).toBe(0);
    });
  });
});
