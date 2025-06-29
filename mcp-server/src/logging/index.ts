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
  error?: Error | unknown;
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
    log: (logger: pino.Logger, message: string, context?: LogContext) => {
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
      hostname: process.env["HOSTNAME"] || "unknown",
      environment: config.environment,
      version: config.version,
    },

    serializers: {
      error: pino.stdSerializers.err,
      request: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: redactHeaders(req.headers),
        remoteAddress: req.remoteAddress,
      }),
      response: (res: any) => ({
        statusCode: res.statusCode,
        headers: redactHeaders(res.headers),
      }),
    },

    redact: {
      paths: config.logging.redactPaths,
      censor: "[REDACTED]",
    },

    formatters: {
      level: (label: string) => ({ level: label }),
      log: (object: Record<string, any>) => {
        if (!object["time"] && !object["timestamp"]) {
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
      customPrettifiers: {
        time: (timestamp: string) => `🕐 ${timestamp}`,
        level: (level: string) => {
          const labels: Record<string, string> = {
            10: "🔍 TRACE",
            20: "🐛 DEBUG",
            30: "ℹ️  INFO",
            40: "⚠️  WARN",
            50: "❌ ERROR",
            60: "💀 FATAL",
          };
          return labels[level] || level;
        },
      },
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

  if (
    config.logging.pretty &&
    config.environment === "development" &&
    process.env["NODE_ENV"] !== "test"
  ) {
    return pino({
      ...baseConfig,
      transport: createPrettyConfig(),
    });
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
  error: Error | unknown,
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
        ...((errorObj as any).code && { code: (errorObj as any).code }),
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
    const id = context.requestId || String(Date.now());
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
      return lastEntry ? lastEntry[1] : undefined;
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
      message || `Operation ${name} completed`
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
    if (!timer) return;

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
