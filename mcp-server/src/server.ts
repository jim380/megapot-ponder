import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CallToolRequestSchema,
  CompleteRequestSchema,
  InitializeRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  InitializeRequest,
  InitializeResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  ListPromptsRequest,
  ListPromptsResult,
  GetPromptRequest,
  GetPromptResult,
  CallToolRequest,
  CallToolResult,
  CompleteRequest,
  CompleteResult,
  ServerCapabilities,
  ListToolsRequest,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { URL } from "node:url";

import { getConfig, type Config } from "./config/index.js";
import {
  serverLogger as logger,
  createRequestLogger,
  PerformanceLogger,
  createTimer,
  logError,
} from "./logging/index.js";
import {
  httpCorrelationMiddleware,
  MCPCorrelation,
  type CorrelatedRequest,
  type CorrelationContext,
} from "./middleware/correlation.js";
import {
  getSessionManager,
  type SessionManager,
  type Session,
  SessionState,
  type TransportType,
} from "./sessions/manager.js";
import { MegapotGraphQLClient, getGraphQLClient } from "./graphql/index.js";
import { MCPError, mapGraphQLError } from "./errors/index.js";
import { buildResourceUri, parseResourceUri, type MegapotResponse } from "./types/index.js";
import { validateMCPToolCall } from "./validation/index.js";
import { executeTool } from "./tools/index.js";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export class MegapotMCPServer extends Server {
  private isShuttingDown = false;
  private readonly config: Config;
  private readonly sessionManager: SessionManager;
  private readonly graphqlClient: MegapotGraphQLClient;
  private currentSession: Session | null = null;
  private currentTransportType: TransportType = "stdio";

  constructor() {
    const config = getConfig();

    super(
      {
        name: config.serviceName,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          resources: { subscribe: true },
          prompts: {},
          logging: {},
        },
      }
    );

    this.config = config;
    this.sessionManager = getSessionManager();
    this.graphqlClient = getGraphQLClient();

    this.setupHandlers();

    this.setupGracefulShutdown();

    this.setupSessionHandlers();
  }

  private setupHandlers(): void {
    this.setRequestHandler(InitializeRequestSchema, this.handleInitialize.bind(this));

    this.setRequestHandler(ListToolsRequestSchema, this.handleListTools.bind(this));
    this.setRequestHandler(CallToolRequestSchema, this.handleCallTool.bind(this));

    this.setRequestHandler(ListResourcesRequestSchema, this.handleListResources.bind(this));
    this.setRequestHandler(ReadResourceRequestSchema, this.handleReadResource.bind(this));

    this.setRequestHandler(ListPromptsRequestSchema, this.handleListPrompts.bind(this));
    this.setRequestHandler(GetPromptRequestSchema, this.handleGetPrompt.bind(this));

    this.setRequestHandler(CompleteRequestSchema, this.handleComplete.bind(this));
  }

  private setupSessionHandlers(): void {
    this.sessionManager.on("created", (session: Session) => {
      logger.debug(
        {
          sessionId: session.id,
          transport: session.transport,
        },
        "Session created event"
      );
    });

    this.sessionManager.on("removed", (sessionId: string, reason: string) => {
      logger.info(
        {
          sessionId,
          reason,
        },
        "Session removed event"
      );

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }
    });

    this.sessionManager.on("rateLimited", (sessionId: string, tokensRemaining: number) => {
      logger.warn(
        {
          sessionId,
          tokensRemaining,
        },
        "Session rate limited"
      );
    });

    this.sessionManager.on("error", (sessionId: string, error: Error) => {
      logError(logger, error, "Session error", { sessionId });
    });
  }

  private handleInitialize(request: InitializeRequest): Promise<InitializeResult> {
    const sessionId = this.currentSession?.id ?? "init";
    const correlationContext = MCPCorrelation.createContext(sessionId);
    const requestLogger = createRequestLogger(correlationContext.requestId);
    const timer = createTimer();

    try {
      requestLogger.info(
        {
          clientVersion: request.params.protocolVersion,
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          transport: this.currentTransportType,
        },
        "Handling initialize request"
      );

      const clientVersion = request.params.protocolVersion;
      let negotiatedVersion: string;

      if (SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion as typeof SUPPORTED_PROTOCOL_VERSIONS[number])) {
        negotiatedVersion = clientVersion;
      } else {
        negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS[0];
        requestLogger.warn(
          {
            clientVersion,
            negotiatedVersion,
          },
          "Client protocol version not supported, using fallback"
        );
      }

      const capabilities: ServerCapabilities = {
        tools: {},
        resources: { subscribe: true },
        prompts: {},
        logging: {},
      };

      if (!this.currentSession) {
        const clientInfo = request.params.clientInfo;
        this.currentSession = this.sessionManager.createSession(
          this.currentTransportType,
          capabilities,
          {
            clientName: clientInfo?.name,
            clientVersion: clientInfo?.version,
            protocolVersion: negotiatedVersion,
          }
        );
      } else {
        this.sessionManager.updateSessionCapabilities(this.currentSession.id, capabilities);
      }

      this.sessionManager.updateSessionState(this.currentSession.id, SessionState.ACTIVE);

      const result: InitializeResult = {
        protocolVersion: negotiatedVersion,
        capabilities,
        serverInfo: {
          name: this.config.serviceName,
          version: this.config.version,
        },
      };

      timer.log(requestLogger, "Initialization complete", {
        sessionId: this.currentSession.id,
        negotiatedVersion,
      });

      return Promise.resolve(result);
    } finally {
      MCPCorrelation.removeContext(correlationContext.requestId);
    }
  }

  private withSessionAndCorrelation<T, R>(
    handlerName: string,
    handler: (request: T, context: CorrelationContext, logger: ReturnType<typeof createRequestLogger>) => Promise<R>
  ): (request: T) => Promise<R> {
    return async (request: T): Promise<R> => {
      if (!this.currentSession) {
        throw new Error("Session not initialized");
      }

      if (this.sessionManager.isRateLimited(this.currentSession.id)) {
        throw new Error("Rate limit exceeded");
      }

      const correlationContext = MCPCorrelation.createContext(this.currentSession.id);
      const requestLogger = createRequestLogger(
        correlationContext.requestId,
        this.currentSession.id
      );

      try {
        PerformanceLogger.start(handlerName);

        requestLogger.debug(
          {
            handler: handlerName,
            sessionId: this.currentSession.id,
          },
          `Handling ${handlerName} request`
        );

        const result = await handler(request, correlationContext, requestLogger);

        PerformanceLogger.end(handlerName, requestLogger, `${handlerName} completed`, {
          sessionId: this.currentSession.id,
        });

        return result;
      } catch (error) {
        logError(requestLogger, error as Error, `Error in ${handlerName}`, {
          handler: handlerName,
          sessionId: this.currentSession.id,
        });
        throw error;
      } finally {
        MCPCorrelation.removeContext(correlationContext.requestId);
      }
    };
  }

  private async handleListTools(_request: ListToolsRequest): Promise<ListToolsResult> {
    const handler = this.withSessionAndCorrelation<ListToolsRequest, ListToolsResult>(
      "listTools",
      (_req, _context, logger) => {
        logger.info("Listing tools");

        return Promise.resolve({
          tools: [
            {
              name: "queryUsers",
              description: "Query users with filtering, pagination, and sorting options",
              inputSchema: {
                type: "object",
                properties: {
                  first: {
                    type: "integer",
                    description: "Number of results to return (1-1000)",
                    minimum: 1,
                    maximum: 1000,
                  },
                  skip: { type: "integer", description: "Number of results to skip", minimum: 0 },
                  orderBy: { type: "string", enum: ["totalWinnings", "totalTicketsPurchased", "totalReferralFees", "createdAt"], description: "Field to order by" },
                  orderDirection: {
                    type: "string",
                    enum: ["asc", "desc"],
                    description: "Sort direction",
                  },
                  where: {
                    type: "object",
                    description: "Filter conditions",
                    properties: {
                      isActive: { type: "boolean" },
                      isLP: { type: "boolean" },
                      totalWinnings_gt: { type: "string", description: "BigInt as string" },
                      totalTicketsPurchased_gt: { type: "string", description: "BigInt as string" },
                    },
                  },
                },
              },
            },
            {
              name: "queryRounds",
              description: "Query jackpot rounds with filtering and sorting",
              inputSchema: {
                type: "object",
                properties: {
                  first: { type: "integer", minimum: 1, maximum: 1000 },
                  skip: { type: "integer", minimum: 0 },
                  orderBy: { type: "string", enum: ["startTime", "jackpotAmount", "totalTicketsValue", "totalLpSupplied"] },
                  orderDirection: { type: "string", enum: ["asc", "desc"] },
                  where: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["ACTIVE", "DRAWING", "RESOLVED"],
                      },
                      startTime_gte: { type: "integer", minimum: 0 },
                      startTime_lte: { type: "integer", minimum: 0 },
                      jackpotAmount_gt: { type: "string", description: "BigInt as string" },
                    },
                  },
                },
              },
            },
            {
              name: "queryTickets",
              description: "Query tickets with filtering options",
              inputSchema: {
                type: "object",
                properties: {
                  first: { type: "integer", minimum: 1, maximum: 1000 },
                  skip: { type: "integer", minimum: 0 },
                  orderBy: { type: "string", enum: ["timestamp", "blockNumber", "ticketsPurchasedBps"] },
                  orderDirection: { type: "string", enum: ["asc", "desc"] },
                  where: {
                    type: "object",
                    properties: {
                      roundId: { type: "string", description: "Filter by specific round ID" },
                      buyerAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                      recipientAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                      referrerAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                      timestamp_gte: { type: "integer", minimum: 0, description: "Unix timestamp" },
                      timestamp_lte: { type: "integer", minimum: 0, description: "Unix timestamp" },
                    },
                  },
                },
              },
            },
            {
              name: "queryLPs",
              description: "Query liquidity providers with filtering",
              inputSchema: {
                type: "object",
                properties: {
                  first: { type: "integer", minimum: 1, maximum: 1000 },
                  skip: { type: "integer", minimum: 0 },
                  orderBy: { type: "string", enum: ["stake", "totalFeesEarned", "totalDeposited", "riskPercentage", "createdAt"] },
                  orderDirection: { type: "string", enum: ["asc", "desc"] },
                  where: {
                    type: "object",
                    properties: {
                      isActive: { type: "boolean" },
                      stake_gt: { type: "string", description: "BigInt as string" },
                      riskPercentage_gte: { type: "number", minimum: 0, maximum: 100 },
                      riskPercentage_lte: { type: "number", minimum: 0, maximum: 100 },
                    },
                  },
                },
              },
            },
            {
              name: "getCurrentRound",
              description: "Get the current active jackpot round",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            {
              name: "getProtocolStats",
              description: "Get overall protocol statistics",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            {
              name: "getUserStats",
              description: "Get statistics for a specific user",
              inputSchema: {
                type: "object",
                properties: {
                  address: {
                    type: "string",
                    pattern: "^0x[a-fA-F0-9]{40}$",
                    description: "User Ethereum address",
                  },
                },
                required: ["address"],
              },
            },
            {
              name: "getLpStats",
              description: "Get statistics for a specific liquidity provider",
              inputSchema: {
                type: "object",
                properties: {
                  address: {
                    type: "string",
                    pattern: "^0x[a-fA-F0-9]{40}$",
                    description: "LP Ethereum address",
                  },
                },
                required: ["address"],
              },
            },
            {
              name: "getLeaderboard",
              description: "Get top users or LPs by performance",
              inputSchema: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["users", "lps"], description: "Leaderboard type" },
                  first: { type: "integer", minimum: 1, maximum: 100, default: 10 },
                },
                required: ["type"],
              },
            },
            {
              name: "getHourlyStats",
              description: "Get hourly protocol statistics",
              inputSchema: {
                type: "object",
                properties: {
                  startTime: { type: "string", description: "Start timestamp" },
                  endTime: { type: "string", description: "End timestamp" },
                  first: { type: "integer", minimum: 1, maximum: 1000, default: 24 },
                },
              },
            },
          ],
        });
      }
    );
    return handler(_request);
  }

  private async handleListResources(_request: ListResourcesRequest): Promise<ListResourcesResult> {
    const handler = this.withSessionAndCorrelation<ListResourcesRequest, ListResourcesResult>(
      "listResources",
      (_req, _context, logger) => {
        logger.info("Listing resources");

        return Promise.resolve({
          resources: [
            {
              uri: buildResourceUri.user("{id}"),
              name: "User Profile",
              description:
                "User profile data including tickets, winnings, and referral information",
              mimeType: "application/json",
            },
            {
              uri: buildResourceUri.round("{id}"),
              name: "Jackpot Round",
              description: "Jackpot round information including status, winner, and ticket sales",
              mimeType: "application/json",
            },
            {
              uri: buildResourceUri.lp("{id}"),
              name: "Liquidity Provider",
              description: "LP stake information and performance metrics",
              mimeType: "application/json",
            },
            {
              uri: buildResourceUri.ticket("{id}"),
              name: "Ticket",
              description: "Individual ticket purchase and details",
              mimeType: "application/json",
            },
            {
              uri: buildResourceUri.stats("hourly/{timestamp}"),
              name: "Hourly Statistics",
              description: "Aggregated hourly protocol statistics",
              mimeType: "application/json",
            },
          ],
        });
      }
    );
    return handler(_request);
  }

  private async handleReadResource(_request: ReadResourceRequest): Promise<ReadResourceResult> {
    const handler = this.withSessionAndCorrelation<ReadResourceRequest, ReadResourceResult>(
      "readResource",
      async (req: ReadResourceRequest, _context, logger) => {
        logger.info({ uri: req.params.uri }, "Reading resource");

        try {
          const parsed = parseResourceUri(req.params.uri);
          if (!parsed) {
            throw new MCPError(1001, `Invalid resource URI: ${req.params.uri}`, {
              uri: req.params.uri,
            });
          }

          const { type, id } = parsed;
          logger.debug({ type, id }, "Parsed resource URI");

          let data: unknown;

          switch (type) {
            case "user":
              data = await this.graphqlClient.query(
                `query { user(id: "${id}") { id address totalTicketsPurchased totalWinnings } }`
              );
              break;
            case "round":
              data = await this.graphqlClient.query(
                `query { jackpotRound(id: "${id}") { id roundNumber status jackpotAmount ticketsSold } }`
              );
              break;
            case "lp":
              data = await this.graphqlClient.query(
                `query { liquidityProvider(id: "${id}") { id address stake isActive } }`
              );
              break;
            case "ticket":
              data = await this.graphqlClient.query(
                `query { ticket(id: "${id}") { id buyer recipient ticketNumber } }`
              );
              break;
            case "stats":
              if (id != null && id.startsWith("hourly/")) {
                const timestamp = id.replace("hourly/", "");
                data = await this.graphqlClient.query(
                  `query { hourlyStats(where: { timestamp: "${timestamp}" }) { timestamp totalVolume uniqueUsers } }`
                );
              } else {
                data = await this.graphqlClient.query(
                  `query { hourlyStats(orderBy: timestamp, orderDirection: desc, first: 1) { timestamp totalVolume uniqueUsers } }`
                );
              }
              break;
            default:
              throw new MCPError(1001, `Unknown resource type: ${type}`, { uri: req.params.uri });
          }

          const response: MegapotResponse<unknown> = {
            data,
            metadata: {
              timestamp: Date.now(),
              totalCount: 1,
            },
          };

          return {
            contents: [
              {
                uri: req.params.uri,
                text: JSON.stringify(response, null, 2),
                mimeType: "application/json",
              },
            ],
          };
        } catch (error) {
          if (error instanceof MCPError) {
            throw error;
          }

          const mcpError = mapGraphQLError(error as Error);
          logger.error(
            {
              error: mcpError.message,
              code: mcpError.code,
              uri: req.params.uri,
            },
            "Resource read failed"
          );
          throw mcpError;
        }
      }
    );
    return handler(_request);
  }

  private async handleListPrompts(_request: ListPromptsRequest): Promise<ListPromptsResult> {
    const handler = this.withSessionAndCorrelation<ListPromptsRequest, ListPromptsResult>(
      "listPrompts",
      (_req, _context, logger) => {
        logger.info("Listing prompts");

        return Promise.resolve({ prompts: [] });
      }
    );
    return handler(_request);
  }

  private async handleGetPrompt(_request: GetPromptRequest): Promise<GetPromptResult> {
    const handler = this.withSessionAndCorrelation<GetPromptRequest, GetPromptResult>(
      "getPrompt",
      (req: GetPromptRequest, _context, logger) => {
        logger.info({ name: req.params.name }, "Getting prompt");

        return Promise.resolve({
          description: "Prompt description placeholder",
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: "Prompt text placeholder",
              },
            },
          ],
        });
      }
    );
    return handler(_request);
  }

  private async handleCallTool(_request: CallToolRequest): Promise<CallToolResult> {
    const handler = this.withSessionAndCorrelation<CallToolRequest, CallToolResult>(
      "callTool",
      async (req: CallToolRequest, _context, logger) => {
        logger.info(
          {
            tool: req.params.name,
            arguments: req.params.arguments,
          },
          "Calling tool"
        );

        try {
          const { toolName, validatedParams } = await validateMCPToolCall(req);

          logger.debug(
            {
              toolName,
              validatedParams,
            },
            "Tool parameters validated successfully"
          );

          const result = await executeTool(
            this.graphqlClient, 
            toolName, 
            validatedParams as Parameters<typeof executeTool>[2]
          ) as unknown;

          const response: MegapotResponse<unknown> = {
            data: result,
            metadata: {
              timestamp: Date.now(),
              totalCount: (result != null && typeof result === 'object' && 'data' in result && Array.isArray((result as { data: unknown[] }).data)) ? (result as { data: unknown[] }).data.length : 1,
            },
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        } catch (error) {
          if (error instanceof MCPError) {
            logger.error(
              {
                error: error.message,
                code: error.code,
                tool: req.params.name,
                details: error.details,
              },
              "Tool call failed"
            );
            throw error;
          }

          const mcpError = mapGraphQLError(error as Error);
          logger.error(
            {
              error: mcpError.message,
              code: mcpError.code,
              tool: req.params.name,
            },
            "Tool execution failed"
          );
          throw mcpError;
        }
      }
    );
    return handler(_request);
  }

  private async handleComplete(_request: CompleteRequest): Promise<CompleteResult> {
    const handler = this.withSessionAndCorrelation<CompleteRequest, CompleteResult>(
      "complete",
      (req: CompleteRequest, _context, logger) => {
        logger.info(
          {
            ref: req.params.ref,
            argument: req.params.argument?.name,
          },
          "Handling completion"
        );

        return Promise.resolve({ completion: { values: [] } });
      }
    );
    return handler(_request);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      if (this.isShuttingDown) return;

      this.isShuttingDown = true;
      logger.info({ signal }, "Shutting down gracefully");

      try {
        if (this.currentSession) {
          this.sessionManager.removeSession(this.currentSession.id, "server_shutdown");
        }

        this.sessionManager.shutdown();

        await this.close();

        logger.info("Server closed successfully");
        process.exit(0);
      } catch (error) {
        logError(logger, error as Error, "Error during shutdown");
        process.exit(1);
      }
    };

    process.on("SIGINT", () => { void shutdown("SIGINT"); });
    process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  }

  setTransportType(type: TransportType): void {
    this.currentTransportType = type;
  }
}

export class TransportFactory {
  static create(type: "stdio" | "http", server: MegapotMCPServer): Promise<void> {
    switch (type) {
      case "stdio":
        return this.createStdioTransport(server);
      case "http":
        this.createHttpTransport(server);
        return Promise.resolve();
      default:
        throw new Error(`Unknown transport type: ${type as string}`);
    }
  }

  private static async createStdioTransport(server: MegapotMCPServer): Promise<void> {
    logger.info("Starting stdio transport");

    try {
      server.setTransportType("stdio");
      const transport = new StdioServerTransport();
      await server.connect(transport);

      logger.info("Stdio transport connected");
    } catch (error) {
      logError(logger, error as Error, "Failed to create stdio transport");
      throw error;
    }
  }

  private static createHttpTransport(server: MegapotMCPServer): void {
    const config = getConfig();
    const port = config.transport.http?.port ?? 3001;
    const host = config.transport.http?.host ?? "0.0.0.0";

    logger.info({ port, host }, "Starting HTTP+SSE transport");

    server.setTransportType("http-sse");

    const httpServer = http.createServer((req, res) => {
      httpCorrelationMiddleware(req, res, () => {
        const correlatedReq = req as CorrelatedRequest;

        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        const corsOrigins = config.transport.http?.corsOrigins ?? ["*"];
        res.setHeader("Access-Control-Allow-Origin", corsOrigins.join(", "));
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, X-Correlation-ID, X-Request-ID"
        );
        res.setHeader("Access-Control-Expose-Headers", "X-Correlation-ID, X-Request-ID");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              version: config.version,
              sessions: (server as unknown as { sessionManager: SessionManager }).sessionManager.getStatistics(),
              uptime: process.uptime(),
            })
          );
          return;
        }

        if (url.pathname === "/metrics" && config.enableMetrics) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              sessions: (server as unknown as { sessionManager: SessionManager }).sessionManager.getStatistics(),
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              correlationId: correlatedReq.correlationId,
            })
          );
          return;
        }

        if (url.pathname === "/sse") {
          correlatedReq.logger.info(
            {
              clientIp: req.socket.remoteAddress,
              userAgent: req.headers["user-agent"],
              correlationId: correlatedReq.correlationId,
            },
            "New SSE connection"
          );

          const transport = new SSEServerTransport(url.pathname, res);
          void server.connect(transport);
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Not found",
            correlationId: correlatedReq.correlationId,
          })
        );
      });
    });

    httpServer.listen(port, host, () => {
      logger.info(
        {
          port,
          host,
          corsOrigins: config.transport.http?.corsOrigins,
          metricsEnabled: config.enableMetrics,
        },
        "HTTP+SSE transport listening"
      );
    });

    httpServer.on("error", (error: Error) => {
      logError(logger, error, "HTTP server error");
      process.exit(1);
    });

    interface SocketWithDestroy extends NodeJS.Socket {
      destroy(): void;
    }
    const connections = new Set<SocketWithDestroy>();
    httpServer.on("connection", (conn: SocketWithDestroy) => {
      connections.add(conn);
      conn.on("close", () => { connections.delete(conn); });
    });

    process.on("SIGTERM", () => {
      httpServer.close(() => {
        logger.info("HTTP server closed");
      });
      connections.forEach((conn) => { conn.destroy(); });
    });
  }
}

export async function main(): Promise<void> {
  try {
    const config = getConfig();

    const transportType = process.argv.includes("--http") ? "http" : config.transport.type;

    logger.info(
      {
        transportType,
        environment: config.environment,
        serviceName: config.serviceName,
        version: config.version,
        logLevel: config.logging.level,
      },
      "Starting Megapot MCP Server"
    );

    const server = new MegapotMCPServer();

    await TransportFactory.create(transportType as "stdio" | "http", server);

    logger.info(
      {
        transport: transportType,
        ...(transportType === "http" && {
          host: config.transport.http?.host,
          port: config.transport.http?.port,
        }),
      },
      "Server started successfully"
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Configuration error")) {
      logger.fatal(
        {
          error: error.message,
          field: (error as Error & { field?: string }).field,
        },
        "Configuration error"
      );
    } else {
      logError(logger, error as Error, "Failed to start server");
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  void main().catch((error: unknown) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
