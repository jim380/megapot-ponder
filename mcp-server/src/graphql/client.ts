async function setupNodeFetchPolyfills(): Promise<void> {
  if (typeof globalThis.fetch === "undefined" || typeof globalThis.Headers === "undefined") {
    if (typeof globalThis.Headers === "undefined") {
      globalThis.Headers = createCustomHeaders();
    }

    if (typeof globalThis.fetch === "undefined") {
      try {
        const nodeFetch = await import("node-fetch");
        globalThis.fetch = nodeFetch.default as unknown as typeof fetch;
      } catch (importError) {
        console.warn("Could not import node-fetch:", (importError as Error).message);

        globalThis.fetch = (function (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
          const inputStr = typeof _input === 'string' ? _input : _input instanceof URL ? _input.toString() : 'unknown';
          return Promise.reject(new Error(
            `fetch not available: Cannot make request to ${inputStr}. node-fetch could not be loaded.`
          ));
        }) as typeof fetch;
      }
    }
  }
}

type HeadersInit = [string, string][] | Record<string, string> | Headers;

function createCustomHeaders(): typeof Headers {
  return class CustomHeaders implements Headers {
    private headers: Map<string, string> = new Map();

    constructor(init?: HeadersInit) {
      if (init !== undefined && init !== null) {
        if (Array.isArray(init)) {
          for (const [key, value] of init) {
            this.headers.set(key.toLowerCase(), String(value));
          }
        } else if (init instanceof Headers) {
          init.forEach((value, key) => {
            this.headers.set(key.toLowerCase(), value);
          });
        } else if (typeof init === "object") {
          for (const [key, value] of Object.entries(init)) {
            this.headers.set(key.toLowerCase(), String(value));
          }
        }
      }
    }

    append(name: string, value: string): void {
      const existing = this.headers.get(name.toLowerCase());
      if (existing !== undefined) {
        this.headers.set(name.toLowerCase(), `${existing}, ${value}`);
      } else {
        this.headers.set(name.toLowerCase(), value);
      }
    }

    delete(name: string): void {
      this.headers.delete(name.toLowerCase());
    }

    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) ?? null;
    }

    has(name: string): boolean {
      return this.headers.has(name.toLowerCase());
    }

    set(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }

    getSetCookie(): string[] {
      const setCookie = this.headers.get('set-cookie');
      if (setCookie === undefined) {
        return [];
      }
      return setCookie.split(', ');
    }

    *[Symbol.iterator](): IterableIterator<[string, string]> {
      for (const [key, value] of this.headers) {
        yield [key, value];
      }
    }

    forEach(callback: (value: string, key: string, parent: Headers) => void, thisArg?: unknown): void {
      for (const [key, value] of this.headers) {
        callback.call(thisArg, value, key, this);
      }
    }

    keys(): IterableIterator<string> {
      return this.headers.keys();
    }

    values(): IterableIterator<string> {
      return this.headers.values();
    }

    entries(): IterableIterator<[string, string]> {
      return this.headers.entries();
    }
  } as unknown as typeof Headers;
}

import { GraphQLClient, gql, type Variables } from "graphql-request";
import { createClient, type Client as WSClient } from "graphql-ws";
import * as WebSocket from "ws";
import { type DocumentNode, print, parse, Kind, OperationTypeNode } from "graphql";
import { getConfig } from "../config/index.js";
import { getLogger, createTimer } from "../logging/index.js";
import { getSessionManager } from "../sessions/manager.js";
import {
  DisconnectionBuffer,
  type BufferedUpdate,
  type DisconnectionBufferConfig,
} from "./disconnection-buffer.js";
import { WebSocketDisconnectionError } from "../errors/index.js";
import {
  calculateQueryComplexity,
  validateQueryComplexity,
  createComplexityError,
  type ComplexityResult,
} from "./complexity.js";
import { SUBSCRIPTION_DEBOUNCE_MS } from "./subscriptions.js";

const logger = getLogger("graphql-client");

export interface GraphQLClientConfig {
  endpoint: string;
  wsEndpoint?: string;
  maxComplexity: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  connectionPoolSize: number;
  headers?: Record<string, string>;
}

export type SubscriptionHandler<T = unknown> = (data: T, error?: Error) => void;

export interface SubscriptionOptions {
  debounceMs?: number;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  variables?: Variables;
}

export interface QueryOptions {
  variables?: Variables;
  headers?: Record<string, string>;
  sessionId?: string;
  skipComplexityCheck?: boolean;
}

export interface SubscriptionRef {
  id: string;
  unsubscribe: () => void;
}

interface PooledConnection {
  client: GraphQLClient;
  inUse: boolean;
  lastUsed: number;
  requestCount: number;
  errorCount: number;
}

interface SubscriptionData {
  handler: SubscriptionHandler;
  debounceTimer?: NodeJS.Timeout;
  lastData?: unknown;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

interface WSConnectionState {
  client: WSClient | null;
  connected: boolean;
  connecting: boolean;
  subscriptions: Map<string, SubscriptionData>;
}

interface GraphQLErrorResponse extends Error {
  response?: {
    body?: unknown;
    status?: number;
    headers?: unknown;
  };
}

export class MegapotGraphQLClient {
  private config: GraphQLClientConfig;
  private connectionPool: PooledConnection[] = [];
  private wsState: WSConnectionState = {
    client: null,
    connected: false,
    connecting: false,
    subscriptions: new Map(),
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private disconnectionBuffer!: DisconnectionBuffer;
  private lastDisconnectTime = 0;
  private polyfillsInitialized = false;

  constructor(config?: Partial<GraphQLClientConfig>) {
    const appConfig = getConfig();

    this.config = {
      endpoint: appConfig.graphql.endpoint,
      wsEndpoint: config?.wsEndpoint ?? appConfig.graphql.endpoint.replace("http", "ws"),
      maxComplexity: appConfig.graphql.maxQueryComplexity,
      timeout: appConfig.graphql.timeout,
      retryAttempts: 3,
      retryDelay: 1000,
      connectionPoolSize: 5,
      ...config,
    };

    this.initializeConnectionPool();
    this.startHealthCheck();
    this.initializeDisconnectionBuffer();
  }

  private initializeConnectionPool(): void {
    for (let i = 0; i < this.config.connectionPoolSize; i++) {
      const client = new GraphQLClient(this.config.endpoint, 
        this.config.headers ? { headers: this.config.headers } : {}
      );

      this.connectionPool.push({
        client,
        inUse: false,
        lastUsed: Date.now(),
        requestCount: 0,
        errorCount: 0,
      });
    }

    logger.info(
      {
        endpoint: this.config.endpoint,
        poolSize: this.config.connectionPoolSize,
      },
      "GraphQL connection pool initialized"
    );
  }

  private async ensurePolyfillsInitialized(): Promise<void> {
    if (!this.polyfillsInitialized) {
      await setupNodeFetchPolyfills();
      this.polyfillsInitialized = true;
    }
  }

  private initializeDisconnectionBuffer(): void {
    const bufferConfig: Partial<DisconnectionBufferConfig> = {
      bufferDurationMs: 30_000,
      cleanupTimeoutMs: 35_000,
      maxUpdatesPerSubscription: 100,
      maxTotalUpdates: 1000,
    };

    this.disconnectionBuffer = new DisconnectionBuffer(bufferConfig);

    this.disconnectionBuffer.on("extendedOutage", (outageMs: number, subscriptionCount: number) => {
      const error = new WebSocketDisconnectionError(
        outageMs,
        subscriptionCount,
        this.disconnectionBuffer.getBufferStats().totalUpdates
      );

      Array.from(this.wsState.subscriptions.entries()).forEach(([, subscription]) => {
        if (subscription.onError !== undefined) {
          subscription.onError(error);
        } else {
          subscription.handler(undefined, error);
        }
      });

      const sessionManager = getSessionManager();
      const activeSessions = sessionManager.getActiveSessions();

      for (const session of activeSessions) {
        if (session.websocket !== undefined && session.websocket !== null) {
          sessionManager.emit("error", session.id, error);
        }
      }

      logger.error(
        {
          outageMs,
          subscriptionCount,
          sessionCount: activeSessions.length,
        },
        "Extended WebSocket outage error propagated to MCP layer"
      );
    });

    this.disconnectionBuffer.on("bufferingStarted", (subscriptionCount: number) => {
      logger.info({ subscriptionCount }, "Disconnection buffering started");
    });

    this.disconnectionBuffer.on("updatesReplayed", (updateCount: number, subscriptionCount: number) => {
      logger.info({ updateCount, subscriptionCount }, "Buffered updates replayed");
    });

    this.disconnectionBuffer.on("bufferCleared", (reason: string, updateCount: number) => {
      logger.warn({ reason, updateCount }, "Disconnection buffer cleared");
    });

    this.disconnectionBuffer.on("bufferOverflow", (droppedUpdates: number) => {
      logger.warn({ droppedUpdates }, "Disconnection buffer overflow");
    });
  }

  private async getConnection(): Promise<PooledConnection> {
    let connection = this.connectionPool.find((conn) => !conn.inUse);

    if (connection === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      connection = this.connectionPool.find((conn) => !conn.inUse);

      if (connection === undefined) {
        connection = this.connectionPool.sort((a, b) => a.lastUsed - b.lastUsed)[0];
        logger.warn("All connections in use, reusing least recently used");
      }
    }

    if (connection !== undefined) {
      connection.inUse = true;
      connection.lastUsed = Date.now();
      connection.requestCount++;
    }

    return connection as PooledConnection;
  }

  private releaseConnection(connection: PooledConnection): void {
    connection.inUse = false;

    if (connection.errorCount > 10) {
      const index = this.connectionPool.indexOf(connection);
      if (index !== -1) {
        const newClient = new GraphQLClient(this.config.endpoint, 
          this.config.headers ? { headers: this.config.headers } : {}
        );

        this.connectionPool[index] = {
          client: newClient,
          inUse: false,
          lastUsed: Date.now(),
          requestCount: 0,
          errorCount: 0,
        };

        logger.info("Reset connection due to high error count");
      }
    }
  }

  async query<T = unknown>(query: string | DocumentNode, options: QueryOptions = {}): Promise<T> {
    await this.ensurePolyfillsInitialized();

    logger.info("=== GraphQL Client query() START ===");
    logger.info(
      {
        endpoint: this.config.endpoint,
        queryType: typeof query,
        options,
        queryPreview: typeof query === "string" ? query.substring(0, 200) + "..." : "DocumentNode",
      },
      "GraphQL query request"
    );

    const timer = createTimer();
    const queryDoc = typeof query === "string" ? parse(query) : query;
    const queryString = typeof query === "string" ? query : print(query);

    logger.info({ queryString }, "Full query string to be sent");

    const sessionManager = getSessionManager();
    const session = options.sessionId !== undefined && options.sessionId !== null 
      ? sessionManager.getSession(options.sessionId) 
      : undefined;
    const requestId = session !== undefined
      ? (session.data.get("currentRequestId") as string)
      : `req-${Date.now()}`;

    if (options.skipComplexityCheck !== true) {
      const validation = validateQueryComplexity(queryDoc, this.config.maxComplexity);

      if (!validation.valid) {
        const error = new Error(validation.message ?? "Query too complex");
        logger.error(
          {
            requestId,
            complexity: validation.complexity,
            maxComplexity: this.config.maxComplexity,
          },
          "Query complexity exceeded"
        );
        throw error;
      }

      logger.debug(
        {
          requestId,
          complexity: validation.complexity.score,
          details: validation.complexity.details,
        },
        "Query complexity calculated"
      );
    }

    let lastError: Error | null = null;
    let connection: PooledConnection | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        logger.info(
          { attempt: attempt + 1, maxAttempts: this.config.retryAttempts },
          "Query attempt"
        );

        connection = await this.getConnection();
        logger.debug(
          {
            connectionInUse: connection.inUse,
            connectionErrors: connection.errorCount,
            endpoint: this.config.endpoint,
          },
          "Got connection from pool"
        );

        connection.client.setHeader("x-request-id", requestId);
        connection.client.setHeader("x-session-id", options.sessionId ?? "");
        if (options.headers !== undefined && options.headers !== null) {
          Object.entries(options.headers).forEach(([key, value]) => {
            connection!.client.setHeader(key, value);
          });
        }

        logger.info(
          {
            requestId,
            endpoint: this.config.endpoint,
            variables: options.variables,
          },
          "Sending request to GraphQL endpoint"
        );

        const result = await connection.client.request<T>(queryString, options.variables);

        logger.info(
          {
            requestId,
            resultKeys: result !== null && result !== undefined ? Object.keys(result) : [],
            hasData: result !== null && result !== undefined,
          },
          "GraphQL request completed successfully"
        );

        timer.log(logger, "GraphQL query executed", {
          requestId,
          attempt: attempt + 1,
          operationType: "query",
        });

        logger.info("=== GraphQL Client query() SUCCESS ===");
        return result;
      } catch (error) {
        lastError = error as Error;
        if (connection !== null) {
          connection.errorCount++;
        }

        const gqlError = error as GraphQLErrorResponse;
        logger.error(
          {
            requestId,
            attempt: attempt + 1,
            error: lastError,
            errorMessage: lastError.message,
            errorStack: lastError.stack,
            errorType: lastError.constructor.name,
            willRetry: attempt < this.config.retryAttempts - 1,
            endpoint: this.config.endpoint,
            responseBody: gqlError.response?.body,
            responseStatus: gqlError.response?.status,
            responseHeaders: gqlError.response?.headers,
          },
          "GraphQL query failed - detailed error info"
        );

        if (
          lastError.message.includes("400") ||
          lastError.message.includes("401") ||
          lastError.message.includes("403")
        ) {
          logger.warn("Breaking retry loop due to client error (4xx)");
          break;
        }

        if (attempt < this.config.retryAttempts - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          logger.info({ delay }, "Waiting before retry");
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } finally {
        if (connection !== null) {
          this.releaseConnection(connection);
          connection = null;
        }
      }
    }

    logger.error(
      {
        requestId,
        attempts: this.config.retryAttempts,
        error: lastError,
        errorMessage: lastError?.message,
        endpoint: this.config.endpoint,
      },
      "GraphQL query failed after all retries"
    );

    logger.info("=== GraphQL Client query() ERROR ===");
    throw lastError ?? new Error("Query failed");
  }

  private async setupWebSocket(): Promise<void> {
    if (this.wsState.connecting || this.wsState.connected) {
      return;
    }

    this.wsState.connecting = true;

    try {
      const wsEndpoint = this.config.wsEndpoint;
      if (wsEndpoint === undefined) {
        throw new Error("WebSocket endpoint not configured");
      }

      this.wsState.client = createClient({
        url: wsEndpoint,
        webSocketImpl: WebSocket,
        connectionParams: () => (this.config.headers as Record<string, unknown>) ?? {},
        retryAttempts: this.config.retryAttempts,
        shouldRetry: () => true,
        on: {
          connected: () => {
            this.wsState.connected = true;
            this.wsState.connecting = false;
            this.reconnectAttempts = 0;

            const outageMs = this.lastDisconnectTime > 0 ? Date.now() - this.lastDisconnectTime : 0;

            if (this.disconnectionBuffer.isBufferingActive()) {
              this.disconnectionBuffer.stopBuffering((subscriptionId, updates) => {
                this.replayBufferedUpdates(subscriptionId, updates);
              });
            }

            logger.info(
              {
                outageMs,
                wasBuffering: this.disconnectionBuffer.isBufferingActive(),
              },
              "WebSocket connected for subscriptions"
            );

            this.lastDisconnectTime = 0;
          },
          closed: () => {
            this.wsState.connected = false;
            this.lastDisconnectTime = Date.now();

            const activeSubscriptionIds = Array.from(this.wsState.subscriptions.keys());
            if (activeSubscriptionIds.length > 0 && !this.disconnectionBuffer.isBufferingActive()) {
              this.disconnectionBuffer.startBuffering(activeSubscriptionIds);
            }

            logger.info(
              {
                activeSubscriptions: activeSubscriptionIds.length,
                bufferingStarted: activeSubscriptionIds.length > 0,
              },
              "WebSocket connection closed"
            );

            this.handleReconnect();
          },
          error: (error) => {
            logger.error({ error }, "WebSocket error");
          },
        },
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("WebSocket connection timeout"));
        }, 10000);

        const checkConnection = setInterval(() => {
          if (this.wsState.connected) {
            clearInterval(checkConnection);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
    } catch (error) {
      this.wsState.connecting = false;
      logger.error({ error }, "Failed to setup WebSocket connection");
      throw error;
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    logger.info(
      {
        attempt: this.reconnectAttempts,
        delay,
      },
      "Scheduling WebSocket reconnection"
    );

    this.reconnectTimeout = setTimeout(() => {
      void this.setupWebSocket().catch((error: unknown) => {
        logger.error({ error }, "Reconnection failed");
      });
    }, delay);
  }

  async subscribe<T = unknown>(
    subscription: string | DocumentNode,
    handler: SubscriptionHandler<T>,
    options: SubscriptionOptions = {}
  ): Promise<SubscriptionRef> {
    if (!this.wsState.connected) {
      await this.setupWebSocket();
    }

    const subscriptionDoc = typeof subscription === "string" ? parse(subscription) : subscription;
    const subscriptionString =
      typeof subscription === "string" ? subscription : print(subscription);

    const complexity = calculateQueryComplexity(subscriptionDoc);
    if (complexity.score > this.config.maxComplexity) {
      throw new Error(createComplexityError(complexity, this.config.maxComplexity));
    }

    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const debounceMs = options.debounceMs ?? getDebounceMs(subscriptionDoc);

    const wrappedHandler: SubscriptionHandler<T> =
      debounceMs > 0 ? this.createDebouncedHandler(subscriptionId, handler, debounceMs) : handler;

    const subscriptionData: SubscriptionData = {
      handler: wrappedHandler as SubscriptionHandler,
      lastData: undefined,
    };

    if (options.onError !== undefined) {
      subscriptionData.onError = options.onError;
    }
    if (options.onComplete !== undefined) {
      subscriptionData.onComplete = options.onComplete;
    }

    this.wsState.subscriptions.set(subscriptionId, subscriptionData);

    if (this.wsState.client === null) {
      throw new Error("WebSocket client not initialized");
    }

    const unsubscribe = this.wsState.client.subscribe<T>(
      {
        query: subscriptionString,
        variables: (options.variables as Record<string, unknown>) ?? {},
      },
      {
        next: (data) => {
          if (data.data !== undefined && data.data !== null) {
            if (this.disconnectionBuffer.isBufferingActive()) {
              this.disconnectionBuffer.bufferUpdate(subscriptionId, data.data);
            } else {
              wrappedHandler(data.data);
            }
          }
        },
        error: (error) => {
          logger.error(
            {
              subscriptionId,
              error,
            },
            "Subscription error"
          );

          if (options.onError !== undefined) {
            options.onError(error as Error);
          } else {
            handler(undefined as T, error as Error);
          }
        },
        complete: () => {
          logger.debug({ subscriptionId }, "Subscription completed");
          this.wsState.subscriptions.delete(subscriptionId);

          if (options.onComplete !== undefined) {
            options.onComplete();
          }
        },
      }
    );

    logger.info(
      {
        subscriptionId,
        complexity: complexity.score,
        debounceMs,
      },
      "GraphQL subscription created"
    );

    return {
      id: subscriptionId,
      unsubscribe: (): void => {
        unsubscribe();
        this.cleanupSubscription(subscriptionId);
      },
    };
  }

  private createDebouncedHandler<T>(
    subscriptionId: string,
    handler: SubscriptionHandler<T>,
    debounceMs: number
  ): SubscriptionHandler<T> {
    return (data: T, error?: Error): void => {
      const subscription = this.wsState.subscriptions.get(subscriptionId);
      if (subscription === undefined) return;

      if (subscription.debounceTimer !== undefined) {
        clearTimeout(subscription.debounceTimer);
      }

      subscription.lastData = data;

      subscription.debounceTimer = setTimeout(() => {
        handler(subscription.lastData as T, error);
        delete subscription.debounceTimer;
      }, debounceMs);
    };
  }

  private cleanupSubscription(subscriptionId: string): void {
    const subscription = this.wsState.subscriptions.get(subscriptionId);
    if (subscription !== undefined) {
      if (subscription.debounceTimer !== undefined) {
        clearTimeout(subscription.debounceTimer);
      }
      this.wsState.subscriptions.delete(subscriptionId);
    }
  }

  private replayBufferedUpdates(subscriptionId: string, updates: BufferedUpdate[]): void {
    const subscription = this.wsState.subscriptions.get(subscriptionId);
    if (subscription === undefined) {
      logger.warn(
        { subscriptionId, updateCount: updates.length },
        "Cannot replay updates: subscription not found"
      );
      return;
    }

    logger.debug(
      {
        subscriptionId,
        updateCount: updates.length,
        firstTimestamp: updates[0]?.timestamp,
        lastTimestamp: updates[updates.length - 1]?.timestamp,
      },
      "Replaying buffered subscription updates"
    );

    for (const update of updates) {
      try {
        subscription.handler(update.data);
      } catch (error) {
        logger.error(
          {
            subscriptionId,
            sequenceNumber: update.sequenceNumber,
            timestamp: update.timestamp,
            error,
          },
          "Error replaying buffered update"
        );
      }
    }
  }

  getComplexity(query: string | DocumentNode): ComplexityResult {
    const queryDoc = typeof query === "string" ? parse(query) : query;
    return calculateQueryComplexity(queryDoc);
  }

  getConnectionStatus(): {
    connected: boolean;
    connecting: boolean;
    subscriptionCount: number;
    bufferStats: {
      isBuffering: boolean;
      outageMs: number;
      totalUpdates: number;
      subscriptionCount: number;
      oldestUpdateAge: number;
    };
  } {
    return {
      connected: this.wsState.connected,
      connecting: this.wsState.connecting,
      subscriptionCount: this.wsState.subscriptions.size,
      bufferStats: this.disconnectionBuffer.getBufferStats(),
    };
  }

  clearDisconnectionBuffer(): void {
    if (this.disconnectionBuffer.isBufferingActive()) {
      this.disconnectionBuffer.clearBuffer("manual");
      logger.info("Disconnection buffer manually cleared");
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      void (async (): Promise<void> => {
        try {
          const testQuery = gql`
            query HealthCheck {
              __typename
            }
          `;

          await this.query(testQuery, { skipComplexityCheck: true });

          if (this.wsState.connected && this.wsState.client !== null) {
            logger.debug("Health check passed");
          }
        } catch (error) {
          logger.error({ error }, "Health check failed");
        }
      })();
    }, 30000);
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down GraphQL client");

    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.wsState.client !== null) {
      await this.wsState.client.dispose();
    }

    if (this.disconnectionBuffer !== undefined) {
      this.disconnectionBuffer.dispose();
    }

    Array.from(this.wsState.subscriptions.values()).forEach((sub) => {
      if (sub.debounceTimer !== undefined) {
        clearTimeout(sub.debounceTimer);
      }
    });
    this.wsState.subscriptions.clear();

    this.connectionPool = [];
  }
}

function getDebounceMs(subscription: DocumentNode): number {
  const definition = subscription.definitions[0];
  if (
    definition !== undefined &&
    definition.kind === Kind.OPERATION_DEFINITION &&
    definition.operation === OperationTypeNode.SUBSCRIPTION &&
    definition.name !== undefined &&
    definition.name !== null
  ) {
    const name = definition.name.value;
    return SUBSCRIPTION_DEBOUNCE_MS[name as keyof typeof SUBSCRIPTION_DEBOUNCE_MS] ?? 100;
  }
  return 100;
}

let clientInstance: MegapotGraphQLClient | null = null;

export function getGraphQLClient(config?: Partial<GraphQLClientConfig>): MegapotGraphQLClient {
  if (clientInstance === null) {
    clientInstance = new MegapotGraphQLClient(config);
  }
  return clientInstance;
}

export async function resetGraphQLClient(): Promise<void> {
  if (clientInstance !== null) {
    await clientInstance.shutdown();
    clientInstance = null;
  }
}