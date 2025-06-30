import { pino } from "pino";

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(`Configuration error for ${field}: ${message}`);
    this.name = "ConfigurationError";
  }
}

export type Environment = "development" | "staging" | "production";

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  refillRatePerSecond: number;
}

export interface LoggingConfig {
  level: pino.Level;
  pretty: boolean;
  redactPaths: string[];
}

export interface TransportConfig {
  type: "stdio" | "http";
  http?: {
    host: string;
    port: number;
    corsOrigins: string[];
  };
}

export interface SessionConfig {
  maxSessions: number;
  sessionTimeout: number;
  cleanupInterval: number;
}

export interface GraphQLConfig {
  endpoint: string;
  wsEndpoint?: string;
  maxQueryDepth: number;
  maxQueryComplexity: number;
  timeout: number;
  connectionPoolSize: number;
}

export interface Config {
  environment: Environment;
  serviceName: string;
  version: string;

  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  transport: TransportConfig;
  session: SessionConfig;
  graphql: GraphQLConfig;

  enableAuth: boolean;
  authTokenHeader: string | undefined;

  enableMetrics: boolean;
  metricsPort: number | undefined;
}

export function loadConfig(): Config {
  const env = process.env;
  const environment = validateEnvironment(env["NODE_ENV"] || "development");

  const config: Config = {
    environment,
    serviceName: env["SERVICE_NAME"] || "megapot-mcp-server",
    version: env["SERVICE_VERSION"] || process.env["npm_package_version"] || "0.0.1",

    rateLimit: {
      requestsPerSecond: validateNumber(env["RATE_LIMIT_RPS"], 10, "RATE_LIMIT_RPS"),
      burstSize: validateNumber(env["RATE_LIMIT_BURST"], 20, "RATE_LIMIT_BURST"),
      refillRatePerSecond: validateNumber(env["RATE_LIMIT_REFILL"], 10, "RATE_LIMIT_REFILL"),
    },

    logging: {
      level: validateLogLevel(
        env["LOG_LEVEL"] || (environment === "production" ? "info" : "debug")
      ),
      pretty: environment !== "production" && env["LOG_PRETTY"] !== "false",
      redactPaths: parseStringArray(
        env["LOG_REDACT_PATHS"] || "password,token,secret,authorization"
      ),
    },

    transport: {
      type: validateTransportType(env["MEGAPOT_MCP_TRANSPORT"] || "stdio"),
      ...(env["MEGAPOT_MCP_TRANSPORT"] === "http" && {
        http: {
          host: env["MEGAPOT_MCP_HOST"] || "0.0.0.0",
          port: validateNumber(env["MEGAPOT_MCP_PORT"], 3001, "MEGAPOT_MCP_PORT"),
          corsOrigins: parseStringArray(env["CORS_ORIGINS"] || "*"),
        },
      }),
    },

    session: {
      maxSessions: validateNumber(env["MAX_SESSIONS"], 1000, "MAX_SESSIONS"),
      sessionTimeout: validateNumber(env["SESSION_TIMEOUT_MS"], 3600000, "SESSION_TIMEOUT_MS"),
      cleanupInterval: validateNumber(
        env["SESSION_CLEANUP_INTERVAL_MS"],
        60000,
        "SESSION_CLEANUP_INTERVAL_MS"
      ),
    },

    graphql: {
      endpoint: env["GRAPHQL_ENDPOINT"] || "http://localhost:42069/graphql",
      wsEndpoint: env["GRAPHQL_WS_ENDPOINT"] || "ws://localhost:42069/graphql",
      maxQueryDepth: validateNumber(env["MAX_QUERY_DEPTH"], 10, "MAX_QUERY_DEPTH"),
      maxQueryComplexity: validateNumber(env["MAX_QUERY_COMPLEXITY"], 10000, "MAX_QUERY_COMPLEXITY"),
      timeout: validateNumber(env["GRAPHQL_TIMEOUT_MS"], 30000, "GRAPHQL_TIMEOUT_MS"),
      connectionPoolSize: validateNumber(env["GRAPHQL_POOL_SIZE"], 5, "GRAPHQL_POOL_SIZE"),
    },

    enableAuth: env["ENABLE_AUTH"] === "true",
    authTokenHeader: env["AUTH_TOKEN_HEADER"] || "x-auth-token",

    enableMetrics: env["ENABLE_METRICS"] === "true",
    metricsPort:
      env["ENABLE_METRICS"] === "true"
        ? validateNumber(env["METRICS_PORT"], 9090, "METRICS_PORT")
        : undefined,
  };

  validateConfig(config);

  return config;
}

function validateEnvironment(value: string): Environment {
  const validEnvironments: Environment[] = ["development", "staging", "production"];

  if (value === "test") {
    return "development";
  }

  if (!validEnvironments.includes(value as Environment)) {
    throw new ConfigurationError(
      `Invalid environment: ${value}. Must be one of: ${validEnvironments.join(", ")}`,
      "NODE_ENV"
    );
  }
  return value as Environment;
}

function validateTransportType(value: string): "stdio" | "http" {
  if (value !== "stdio" && value !== "http") {
    throw new ConfigurationError(
      `Invalid transport type: ${value}. Must be 'stdio' or 'http'`,
      "MEGAPOT_MCP_TRANSPORT"
    );
  }
  return value;
}

function validateLogLevel(value: string): pino.Level {
  const validLevels: pino.Level[] = ["fatal", "error", "warn", "info", "debug", "trace"];
  if (!validLevels.includes(value as pino.Level)) {
    throw new ConfigurationError(
      `Invalid log level: ${value}. Must be one of: ${validLevels.join(", ")}`,
      "LOG_LEVEL"
    );
  }
  return value as pino.Level;
}

function validateNumber(value: string | undefined, defaultValue: number, field: string): number {
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(`Invalid number: ${value}`, field);
  }

  if (parsed <= 0) {
    throw new ConfigurationError(`Number must be positive: ${parsed}`, field);
  }

  return parsed;
}

function parseStringArray(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function validateConfig(config: Config): void {
  if (config.rateLimit.burstSize < config.rateLimit.requestsPerSecond) {
    throw new ConfigurationError("Burst size must be >= requests per second", "RATE_LIMIT_BURST");
  }

  if (config.session.cleanupInterval > config.session.sessionTimeout) {
    throw new ConfigurationError(
      "Cleanup interval must be <= session timeout",
      "SESSION_CLEANUP_INTERVAL_MS"
    );
  }

  if (config.transport.type === "http" && !config.transport.http) {
    throw new ConfigurationError(
      "HTTP configuration required when transport type is http",
      "MEGAPOT_MCP_TRANSPORT"
    );
  }

  if (config.enableMetrics && !config.metricsPort) {
    throw new ConfigurationError("Metrics port required when metrics are enabled", "METRICS_PORT");
  }
}

let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
