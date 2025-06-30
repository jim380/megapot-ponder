import pino from "pino";
import { getConfig } from "../config/index.js";
import type { Config } from "../config/index.js";

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  error?: Error;
  [key: string]: unknown;
}

export interface PerformanceTimer {
  start: number;
  end(): number;
  log(logger: pino.Logger, message: string, context?: LogContext): void;
}

export function createTimer(): PerformanceTimer {
  const start = Date.now();

  return {
    start,
    end: () => Date.now() - start,
    log: (logger: pino.Logger, message: string, context?: LogContext): void => {
      const duration = Date.now() - start;
      logger.info({ duration, ...context }, message);
    },
  };
}

function createBaseConfig(config: Config): pino.LoggerOptions {
  const baseConfig: pino.LoggerOptions = {
    name: config.serviceName,
    level: config.logging.level,

    base: {
      pid: process.pid,
      hostname: process.env["HOSTNAME"] ?? "unknown",
      environment: config.environment,
      version: config.version,
    },

    serializers: {
      error: pino.stdSerializers.err,
      request: (req: unknown) => {
        const request = req as {
          id?: string;
          method?: string;
          url?: string;
          headers?: Record<string, string>;
          remoteAddress?: string;
        };
        return {
          id: request.id,
          method: request.method,
          url: request.url,
          headers: redactHeaders(request.headers),
          remoteAddress: request.remoteAddress,
        };
      },
      response: (res: unknown) => {
        const response = res as {
          statusCode?: number;
          headers?: Record<string, string>;
        };
        return {
          statusCode: response.statusCode,
          headers: redactHeaders(response.headers),
        };
      },
    },

    redact: {
      paths: config.logging.redactPaths,
      censor: "[REDACTED]",
    },

    formatters: {
      level: (label: string) => ({ level: label }),
      log: (object: Record<string, unknown>) => {
        if (object["time"] === undefined && object["timestamp"] === undefined) {
          object["timestamp"] = new Date().toISOString();
        }
        return object;
      },
    },
  };

  return baseConfig;
}

function createPrettyConfig(): pino.TransportTargetOptions {
  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
      messageFormat: "{requestId} {msg}",
      errorLikeObjectKeys: ["error", "err"],
    },
  };
}

function redactHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const sensitiveHeaders = [
    "authorization",
    "cookie",
    "x-auth-token",
    "x-api-key",
    "x-access-token",
  ];

  const redacted = { ...headers };
  for (const header of sensitiveHeaders) {
    if (header in redacted) {
      redacted[header] = "[REDACTED]";
    }
  }

  return redacted;
}

export function createLogger(customConfig?: Partial<Config>): pino.Logger {
  const config = customConfig ? { ...getConfig(), ...customConfig } : getConfig();
  const baseConfig = createBaseConfig(config);

  const isStdioTransport = config.transport.type === "stdio";

  if (
    config.logging.pretty &&
    config.environment === "development" &&
    process.env["NODE_ENV"] !== "test" &&
    !isStdioTransport
  ) {
    return pino({
      ...baseConfig,
      transport: createPrettyConfig(),
    });
  }

  if (isStdioTransport) {
    return pino(baseConfig, pino.destination(2));
  }

  return pino(baseConfig);
}

let rootLogger: pino.Logger | null = null;
const componentLoggers: Map<string, pino.Logger> = new Map();

export function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    rootLogger = createLogger();
  }
  return rootLogger;
}

export function getLogger(component: string): pino.Logger {
  if (!componentLoggers.has(component)) {
    const logger = getRootLogger().child({ component });
    componentLoggers.set(component, logger);
  }
  const logger = componentLoggers.get(component);
  if (!logger) {
    throw new Error(`Logger for component ${component} not found`);
  }
  return logger;
}

export function createRequestLogger(requestId: string, sessionId?: string): pino.Logger {
  return getRootLogger().child({
    requestId,
    sessionId,
    type: "request",
  });
}

export function logError(
  logger: pino.Logger,
  error: unknown,
  message: string,
  context?: LogContext
): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));

  logger.error(
    {
      error: {
        message: errorObj.message,
        name: errorObj.name,
        stack: errorObj.stack,
        ...("code" in errorObj && typeof errorObj.code !== "undefined" && { code: errorObj.code }),
      },
      ...context,
    },
    message
  );
}

export function createLogContext(base?: LogContext): LogContext {
  return {
    timestamp: new Date().toISOString(),
    ...base,
  };
}

export class LoggingContext {
  private static asyncLocalStorage = new Map<string, LogContext>();

  static async run<T>(context: LogContext, fn: () => Promise<T>): Promise<T> {
    const id = context.requestId ?? String(Date.now());
    this.asyncLocalStorage.set(id, context);

    try {
      return await fn();
    } finally {
      this.asyncLocalStorage.delete(id);
    }
  }

  static getContext(): LogContext | undefined {
    const entries = Array.from(this.asyncLocalStorage.entries());
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      return lastEntry?.[1];
    }
    return undefined;
  }
}

export class PerformanceLogger {
  private static timers = new Map<string, PerformanceTimer>();

  static start(name: string): void {
    this.timers.set(name, createTimer());
  }

  static end(
    name: string,
    logger: pino.Logger,
    message?: string,
    context?: LogContext
  ): number | undefined {
    const timer = this.timers.get(name);
    if (!timer) {
      logger.warn({ timerName: name }, "Timer not found");
      return undefined;
    }

    const duration = timer.end();
    this.timers.delete(name);

    logger.info(
      {
        duration,
        timerName: name,
        ...context,
      },
      message ?? `Operation ${name} completed`
    );

    return duration;
  }

  static logIfSlow(
    name: string,
    threshold: number,
    logger: pino.Logger,
    context?: LogContext
  ): void {
    const timer = this.timers.get(name);
    if (timer === undefined) return;

    const duration = Date.now() - timer.start;
    if (duration > threshold) {
      logger.warn(
        {
          duration,
          threshold,
          timerName: name,
          ...context,
        },
        `Slow operation detected: ${name}`
      );
    }
  }
}

export const logger = getRootLogger();
export const serverLogger = getLogger("server");
export const graphqlLogger = getLogger("graphql");
export const sessionLogger = getLogger("session");
export const transportLogger = getLogger("transport");

export type { Logger } from "pino";
