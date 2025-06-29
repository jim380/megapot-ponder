import { GraphQLClient, gql, type Variables } from "graphql-request";
import { createClient, type Client as WSClient } from "graphql-ws";
import * as WebSocket from "ws";
import { type DocumentNode, print, parse } from "graphql";
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

export type SubscriptionHandler<T = any> = (data: T, error?: Error) => void;

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

interface WSConnectionState {
  client: WSClient | null;
  connected: boolean;
  connecting: boolean;
  subscriptions: Map<
    string,
    {
      handler: SubscriptionHandler;
      debounceTimer?: NodeJS.Timeout;
      lastData?: any;
      onError?: (error: Error) => void;
      onComplete?: () => void;
    }
  >;
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

  constructor(config?: Partial<GraphQLClientConfig>) {
    const appConfig = getConfig();

    this.config = {
      endpoint: appConfig.graphql.endpoint,
      wsEndpoint: config?.wsEndpoint || appConfig.graphql.endpoint.replace("http", "ws"),
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
      const client = new GraphQLClient(this.config.endpoint, {
        headers: this.config.headers,
      });

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

  private initializeDisconnectionBuffer(): void {
    const bufferConfig: Partial<DisconnectionBufferConfig> = {
      bufferDurationMs: 30_000,
      cleanupTimeoutMs: 35_000,
      maxUpdatesPerSubscription: 100,
      maxTotalUpdates: 1000,
    };

    this.disconnectionBuffer = new DisconnectionBuffer(bufferConfig);

    this.disconnectionBuffer.on("extendedOutage", (outageMs, subscriptionCount) => {
      const error = new WebSocketDisconnectionError(
        outageMs,
        subscriptionCount,
        this.disconnectionBuffer.getBufferStats().totalUpdates
      );

      Array.from(this.wsState.subscriptions.entries()).forEach(([, subscription]) => {
        if (subscription.onError) {
          subscription.onError(error);
        } else {
          subscription.handler(undefined as any, error);
        }
      });

      const sessionManager = getSessionManager();
      const activeSessions = sessionManager.getActiveSessions();

      for (const session of activeSessions) {
        if (session.websocket) {
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

    this.disconnectionBuffer.on("bufferingStarted", (subscriptionCount) => {
      logger.info({ subscriptionCount }, "Disconnection buffering started");
    });

    this.disconnectionBuffer.on("updatesReplayed", (updateCount, subscriptionCount) => {
      logger.info({ updateCount, subscriptionCount }, "Buffered updates replayed");
    });

    this.disconnectionBuffer.on("bufferCleared", (reason, updateCount) => {
      logger.warn({ reason, updateCount }, "Disconnection buffer cleared");
    });

    this.disconnectionBuffer.on("bufferOverflow", (droppedUpdates) => {
      logger.warn({ droppedUpdates }, "Disconnection buffer overflow");
    });
  }

  private async getConnection(): Promise<PooledConnection> {
    let connection = this.connectionPool.find((conn) => !conn.inUse);

    if (!connection) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      connection = this.connectionPool.find((conn) => !conn.inUse);

      if (!connection) {
        connection = this.connectionPool.sort((a, b) => a.lastUsed - b.lastUsed)[0];
        logger.warn("All connections in use, reusing least recently used");
      }
    }

    if (connection) {
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
        const newClient = new GraphQLClient(this.config.endpoint, {
          headers: this.config.headers,
        });

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

  async query<T = any>(query: string | DocumentNode, options: QueryOptions = {}): Promise<T> {
    const timer = createTimer();
    const queryDoc = typeof query === "string" ? parse(query) : query;
    const queryString = typeof query === "string" ? query : print(query);

    const sessionManager = getSessionManager();
    const session = options.sessionId ? sessionManager.getSession(options.sessionId) : undefined;
    const requestId = session
      ? (session.data.get("currentRequestId") as string)
      : `req-${Date.now()}`;

    if (!options.skipComplexityCheck) {
      const validation = validateQueryComplexity(queryDoc, this.config.maxComplexity);

      if (!validation.valid) {
        const error = new Error(validation.message || "Query too complex");
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
        connection = await this.getConnection();

        connection.client.setHeader("x-request-id", requestId);
        connection.client.setHeader("x-session-id", options.sessionId || "");
        if (options.headers) {
          Object.entries(options.headers).forEach(([key, value]) => {
            connection!.client.setHeader(key, value);
          });
        }

        const result = await connection.client.request<T>(queryString, options.variables);

        timer.log(logger, "GraphQL query executed", {
          requestId,
          attempt: attempt + 1,
          operationType: "query",
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        if (connection) {
          connection.errorCount++;
        }

        logger.warn(
          {
            requestId,
            attempt: attempt + 1,
            error: lastError,
            willRetry: attempt < this.config.retryAttempts - 1,
          },
          "GraphQL query failed"
        );

        if (
          lastError.message.includes("400") ||
          lastError.message.includes("401") ||
          lastError.message.includes("403")
        ) {
          break;
        }

        if (attempt < this.config.retryAttempts - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay * Math.pow(2, attempt))
          );
        }
      } finally {
        if (connection) {
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
      },
      "GraphQL query failed after all retries"
    );

    throw lastError || new Error("Query failed");
  }

  private async setupWebSocket(): Promise<void> {
    if (this.wsState.connecting || this.wsState.connected) {
      return;
    }

    this.wsState.connecting = true;

    try {
      this.wsState.client = createClient({
        url: this.config.wsEndpoint!,
        webSocketImpl: WebSocket,
        connectionParams: () => (this.config.headers as Record<string, unknown>) || {},
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
      this.setupWebSocket().catch((error) => {
        logger.error({ error }, "Reconnection failed");
      });
    }, delay);
  }

  async subscribe<T = any>(
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

    const subscriptionData: {
      handler: SubscriptionHandler;
      debounceTimer?: NodeJS.Timeout;
      lastData?: any;
      onError?: (error: Error) => void;
      onComplete?: () => void;
    } = {
      handler: wrappedHandler,
      lastData: undefined,
    };

    if (options.onError) {
      subscriptionData.onError = options.onError;
    }
    if (options.onComplete) {
      subscriptionData.onComplete = options.onComplete;
    }

    this.wsState.subscriptions.set(subscriptionId, subscriptionData);

    const unsubscribe = this.wsState.client!.subscribe<T>(
      {
        query: subscriptionString,
        variables: (options.variables as Record<string, unknown>) || {},
      },
      {
        next: (data) => {
          if (data.data) {
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

          if (options.onError) {
            options.onError(error as Error);
          } else {
            handler(undefined as any, error as Error);
          }
        },
        complete: () => {
          logger.debug({ subscriptionId }, "Subscription completed");
          this.wsState.subscriptions.delete(subscriptionId);

          if (options.onComplete) {
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
      unsubscribe: () => {
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
    return (data: T, error?: Error) => {
      const subscription = this.wsState.subscriptions.get(subscriptionId);
      if (!subscription) return;

      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }

      subscription.lastData = data;

      subscription.debounceTimer = setTimeout(() => {
        handler(subscription.lastData, error);
        delete subscription.debounceTimer;
      }, debounceMs);
    };
  }

  private cleanupSubscription(subscriptionId: string): void {
    const subscription = this.wsState.subscriptions.get(subscriptionId);
    if (subscription) {
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }
      this.wsState.subscriptions.delete(subscriptionId);
    }
  }

  private replayBufferedUpdates(subscriptionId: string, updates: BufferedUpdate[]): void {
    const subscription = this.wsState.subscriptions.get(subscriptionId);
    if (!subscription) {
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
    this.healthCheckInterval = setInterval(async () => {
      try {
        const testQuery = gql`
          query HealthCheck {
            __typename
          }
        `;

        await this.query(testQuery, { skipComplexityCheck: true });

        if (this.wsState.connected && this.wsState.client) {
          logger.debug("Health check passed");
        }
      } catch (error) {
        logger.error({ error }, "Health check failed");
      }
    }, 30000);
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down GraphQL client");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.wsState.client) {
      await this.wsState.client.dispose();
    }

    if (this.disconnectionBuffer) {
      this.disconnectionBuffer.dispose();
    }

    Array.from(this.wsState.subscriptions.values()).forEach((sub) => {
      if (sub.debounceTimer) {
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
    definition &&
    definition.kind === "OperationDefinition" &&
    definition.operation === "subscription" &&
    definition.name
  ) {
    const name = definition.name.value;
    return SUBSCRIPTION_DEBOUNCE_MS[name as keyof typeof SUBSCRIPTION_DEBOUNCE_MS] || 100;
  }
  return 100;
}

let clientInstance: MegapotGraphQLClient | null = null;

export function getGraphQLClient(config?: Partial<GraphQLClientConfig>): MegapotGraphQLClient {
  if (!clientInstance) {
    clientInstance = new MegapotGraphQLClient(config);
  }
  return clientInstance;
}

export async function resetGraphQLClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.shutdown();
    clientInstance = null;
  }
}
