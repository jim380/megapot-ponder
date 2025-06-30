import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "node:events";
import { getConfig } from "../config/index.js";
import { sessionLogger as logger } from "../logging/index.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

export enum SessionState {
  INITIALIZING = "initializing",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  CLOSING = "closing",
  CLOSED = "closed",
}

export type TransportType = "stdio" | "http-sse" | "websocket";

export interface SessionMetadata {
  userAgent?: string;
  remoteAddress?: string;
  clientName?: string;
  clientVersion?: string;
  [key: string]: unknown;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  requestCount: number;
  limitExceededCount: number;
}

export interface WebSocketInfo {
  connectionId: string;
  connectedAt: Date;
  lastPingAt?: Date;
  subscriptions: Set<string>;
}

export interface Session {
  id: string;
  state: SessionState;
  transport: TransportType;
  capabilities: ServerCapabilities;
  createdAt: Date;
  lastActivityAt: Date;
  metadata: SessionMetadata;
  rateLimit: RateLimitState;
  websocket?: WebSocketInfo;
  data: Map<string, unknown>;
}

export interface SessionEvents {
  created: (session: Session) => void;
  updated: (session: Session) => void;
  removed: (sessionId: string, reason: string) => void;
  rateLimited: (sessionId: string, requestsRemaining: number) => void;
  error: (sessionId: string, error: Error) => void;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly config = getConfig();

  constructor() {
    super();
    this.startCleanupTimer();
  }

  createSession(
    transport: TransportType,
    capabilities: ServerCapabilities,
    metadata: SessionMetadata = {}
  ): Session {
    const sessionId = uuidv4();
    const now = new Date();

    const session: Session = {
      id: sessionId,
      state: SessionState.INITIALIZING,
      transport,
      capabilities,
      createdAt: now,
      lastActivityAt: now,
      metadata,
      rateLimit: {
        tokens: this.config.rateLimit.burstSize,
        lastRefill: Date.now(),
        requestCount: 0,
        limitExceededCount: 0,
      },
      data: new Map(),
    };

    if (transport === "websocket" || transport === "http-sse") {
      session.websocket = {
        connectionId: uuidv4(),
        connectedAt: now,
        subscriptions: new Set(),
      };
    }

    this.sessions.set(sessionId, session);

    logger.info(
      {
        sessionId,
        transport,
        capabilities,
        metadata,
      },
      "Session created"
    );

    this.emit("created", session);

    if (this.sessions.size > this.config.session.maxSessions) {
      this.evictOldestInactiveSessions();
    }

    return session;
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.state === SessionState.ACTIVE) {
      session.lastActivityAt = new Date();
    }
    return session;
  }

  updateSessionState(sessionId: string, state: SessionState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const oldState = session.state;
    session.state = state;
    session.lastActivityAt = new Date();

    logger.info(
      {
        sessionId,
        oldState,
        newState: state,
      },
      "Session state updated"
    );

    this.emit("updated", session);
    return true;
  }

  updateSessionCapabilities(sessionId: string, capabilities: ServerCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.capabilities = capabilities;
    session.lastActivityAt = new Date();

    logger.info(
      {
        sessionId,
        capabilities,
      },
      "Session capabilities updated"
    );

    this.emit("updated", session);
    return true;
  }

  addSubscription(sessionId: string, resource: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.websocket) {
      return false;
    }

    session.websocket.subscriptions.add(resource);
    session.lastActivityAt = new Date();

    logger.debug(
      {
        sessionId,
        resource,
        totalSubscriptions: session.websocket.subscriptions.size,
      },
      "Subscription added"
    );

    return true;
  }

  removeSubscription(sessionId: string, resource: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.websocket) {
      return false;
    }

    const removed = session.websocket.subscriptions.delete(resource);
    if (removed) {
      session.lastActivityAt = new Date();

      logger.debug(
        {
          sessionId,
          resource,
          remainingSubscriptions: session.websocket.subscriptions.size,
        },
        "Subscription removed"
      );
    }

    return removed;
  }

  getSubscriptions(sessionId: string): Set<string> {
    const session = this.sessions.get(sessionId);
    return session?.websocket?.subscriptions || new Set();
  }

  setSessionData(sessionId: string, key: string, value: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.data.set(key, value);
    session.lastActivityAt = new Date();
    return true;
  }

  getSessionData(sessionId: string, key: string): unknown {
    return this.sessions.get(sessionId)?.data.get(key);
  }

  isRateLimited(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return true;
    }

    const now = Date.now();
    const timeSinceRefill = now - session.rateLimit.lastRefill;
    const tokensToAdd = Math.floor(
      (timeSinceRefill / 1000) * this.config.rateLimit.refillRatePerSecond
    );

    if (tokensToAdd > 0) {
      session.rateLimit.tokens = Math.min(
        session.rateLimit.tokens + tokensToAdd,
        this.config.rateLimit.burstSize
      );
      session.rateLimit.lastRefill = now;
    }

    if (session.rateLimit.tokens < 1) {
      session.rateLimit.limitExceededCount++;

      logger.warn(
        {
          sessionId,
          tokens: session.rateLimit.tokens,
          limitExceededCount: session.rateLimit.limitExceededCount,
        },
        "Rate limit exceeded"
      );

      this.emit("rateLimited", sessionId, session.rateLimit.tokens);
      return true;
    }

    session.rateLimit.tokens--;
    session.rateLimit.requestCount++;
    session.lastActivityAt = new Date();

    return false;
  }

  getRateLimitInfo(sessionId: string): RateLimitState | undefined {
    return this.sessions.get(sessionId)?.rateLimit;
  }

  removeSession(sessionId: string, reason: string = "unknown"): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.state = SessionState.CLOSING;

    try {
      if (session.websocket) {
        session.websocket.subscriptions.clear();
      }

      session.data.clear();

      this.sessions.delete(sessionId);

      logger.info(
        {
          sessionId,
          reason,
          sessionDuration: Date.now() - session.createdAt.getTime(),
        },
        "Session removed"
      );

      this.emit("removed", sessionId, reason);
      return true;
    } catch (error) {
      logger.error(
        {
          sessionId,
          error,
          reason,
        },
        "Error removing session"
      );

      this.emit("error", sessionId, error as Error);
      return false;
    }
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.state === SessionState.ACTIVE
    );
  }

  getSessionCountByState(): Record<SessionState, number> {
    const counts: Record<SessionState, number> = {
      [SessionState.INITIALIZING]: 0,
      [SessionState.ACTIVE]: 0,
      [SessionState.SUSPENDED]: 0,
      [SessionState.CLOSING]: 0,
      [SessionState.CLOSED]: 0,
    };

    for (const session of this.sessions.values()) {
      counts[session.state]++;
    }

    return counts;
  }

  getStatistics(): {
    totalSessions: number;
    byState: Record<SessionState, number>;
    byTransport: Record<TransportType, number>;
    averageSessionDuration: number;
    totalRequests: number;
    rateLimitExceeded: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();

    return {
      totalSessions: sessions.length,
      byState: this.getSessionCountByState(),
      byTransport: this.getSessionCountByTransport(),
      averageSessionDuration:
        sessions.length > 0
          ? sessions.reduce((sum, s) => sum + (now - s.createdAt.getTime()), 0) / sessions.length
          : 0,
      totalRequests: sessions.reduce((sum, s) => sum + s.rateLimit.requestCount, 0),
      rateLimitExceeded: sessions.reduce((sum, s) => sum + s.rateLimit.limitExceededCount, 0),
    };
  }

  private getSessionCountByTransport(): Record<TransportType, number> {
    const counts: Record<TransportType, number> = {
      stdio: 0,
      "http-sse": 0,
      websocket: 0,
    };

    for (const session of this.sessions.values()) {
      counts[session.transport]++;
    }

    return counts;
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.config.session.cleanupInterval);
  }

  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const timeout = this.config.session.sessionTimeout;
    const toRemove: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastActivityAt.getTime();

      if (inactiveTime > timeout) {
        toRemove.push(sessionId);
      }
    }

    if (toRemove.length > 0) {
      logger.info(
        {
          count: toRemove.length,
          sessionIds: toRemove,
        },
        "Cleaning up inactive sessions"
      );

      for (const sessionId of toRemove) {
        this.removeSession(sessionId, "timeout");
      }
    }
  }

  private evictOldestInactiveSessions(): void {
    const maxToEvict = Math.floor(this.config.session.maxSessions * 0.1);
    const sessions = Array.from(this.sessions.entries())
      .sort(([, a], [, b]) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime())
      .slice(0, maxToEvict);

    logger.warn(
      {
        currentCount: this.sessions.size,
        maxSessions: this.config.session.maxSessions,
        evicting: sessions.length,
      },
      "Session limit reached, evicting oldest sessions"
    );

    for (const [sessionId] of sessions) {
      this.removeSession(sessionId, "evicted");
    }
  }

  shutdown(): void {
    logger.info("Shutting down session manager");

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const sessionId of this.sessions.keys()) {
      this.removeSession(sessionId, "shutdown");
    }

    this.removeAllListeners();
  }
}

let managerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!managerInstance) {
    managerInstance = new SessionManager();
  }
  return managerInstance;
}

export function resetSessionManager(): void {
  if (managerInstance) {
    managerInstance.shutdown();
    managerInstance = null;
  }
}
