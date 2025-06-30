import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequestLogger, type Logger } from "../logging/index.js";

export interface CorrelatedRequest extends IncomingMessage {
  id: string;
  correlationId: string;
  logger: Logger;
  startTime: number;
}

export interface CorrelatedResponse extends ServerResponse {
  correlationId: string;
}

export interface CorrelationContext {
  requestId: string;
  sessionId: string | undefined;
  parentId: string | undefined;
  spanId: string | undefined;
  traceId: string | undefined;
  startTime: number;
}

export function generateCorrelationId(): string {
  return uuidv4();
}

export function extractOrGenerateCorrelationId(
  headers: Record<string, string | string[] | undefined>
): string {
  const correlationHeaders = [
    "x-correlation-id",
    "x-request-id",
    "x-trace-id",
    "correlation-id",
    "request-id",
  ];

  for (const header of correlationHeaders) {
    const value = headers[header];
    if (value !== undefined && typeof value === "string") {
      return value;
    }
  }

  return generateCorrelationId();
}

export function httpCorrelationMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const correlatedReq = req as CorrelatedRequest;
  const correlatedRes = res as CorrelatedResponse;

  const correlationId = extractOrGenerateCorrelationId(req.headers);

  correlatedReq.id = correlationId;
  correlatedReq.correlationId = correlationId;
  correlatedReq.startTime = Date.now();
  correlatedRes.correlationId = correlationId;

  correlatedReq.logger = createRequestLogger(correlationId);

  res.setHeader("X-Correlation-ID", correlationId);
  res.setHeader("X-Request-ID", correlationId);

  correlatedReq.logger.info(
    {
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.socket.remoteAddress,
    },
    "Request started"
  );

  const originalEnd = res.end.bind(res);

  const newEnd: typeof res.end = function (
    this: ServerResponse,
    chunkOrCallback?: (() => void) | string | Buffer,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void
  ): ServerResponse {
    const duration = Date.now() - correlatedReq.startTime;

    correlatedReq.logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        bytesWritten:
          "bytesWritten" in res && typeof res.bytesWritten === "number" ? res.bytesWritten : 0,
      },
      "Request completed"
    );

    if (typeof chunkOrCallback === "function") {
      return originalEnd(chunkOrCallback);
    } else if (chunkOrCallback !== undefined && typeof encodingOrCallback === "function") {
      return originalEnd(chunkOrCallback, encodingOrCallback);
    } else if (
      chunkOrCallback !== undefined &&
      encodingOrCallback !== undefined &&
      callback !== undefined
    ) {
      return originalEnd(chunkOrCallback, encodingOrCallback as BufferEncoding, callback);
    } else if (chunkOrCallback !== undefined && encodingOrCallback !== undefined) {
      return originalEnd(chunkOrCallback, encodingOrCallback as BufferEncoding);
    } else if (chunkOrCallback !== undefined) {
      return originalEnd(chunkOrCallback);
    } else {
      return originalEnd();
    }
  };

  res.end = newEnd;

  next();
}

export class MCPCorrelation {
  private static contexts = new Map<string, CorrelationContext>();

  static createContext(sessionId: string, parentId?: string): CorrelationContext {
    const requestId = generateCorrelationId();
    const context: CorrelationContext = {
      requestId,
      sessionId,
      parentId: parentId ?? undefined,
      spanId: generateCorrelationId(),
      traceId: parentId ?? requestId,
      startTime: Date.now(),
    };

    this.contexts.set(requestId, context);
    return context;
  }

  static getContext(requestId: string): CorrelationContext | undefined {
    return this.contexts.get(requestId);
  }

  static removeContext(requestId: string): void {
    this.contexts.delete(requestId);
  }

  static cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [requestId, context] of Array.from(this.contexts.entries())) {
      if (now - context.startTime > maxAge) {
        expired.push(requestId);
      }
    }

    for (const requestId of expired) {
      this.contexts.delete(requestId);
    }
  }

  static correlateMessage<T extends Record<string, unknown>>(
    message: T,
    context: CorrelationContext
  ): T & {
    _correlation: {
      requestId: string;
      sessionId: string | undefined;
      spanId: string | undefined;
      traceId: string | undefined;
      timestamp: string;
    };
  } {
    return {
      ...message,
      _correlation: {
        requestId: context.requestId,
        sessionId: context.sessionId,
        spanId: context.spanId,
        traceId: context.traceId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  static extractCorrelation(message: unknown): CorrelationContext | undefined {
    if (
      typeof message !== "object" ||
      message === null ||
      !("_correlation" in message) ||
      typeof message._correlation !== "object" ||
      message._correlation === null
    ) {
      return undefined;
    }

    const correlation = message._correlation as Record<string, unknown>;

    return {
      requestId: typeof correlation["requestId"] === "string" ? correlation["requestId"] : "",
      sessionId:
        typeof correlation["sessionId"] === "string" ? correlation["sessionId"] : undefined,
      parentId: typeof correlation["requestId"] === "string" ? correlation["requestId"] : undefined,
      spanId: typeof correlation["spanId"] === "string" ? correlation["spanId"] : undefined,
      traceId: typeof correlation["traceId"] === "string" ? correlation["traceId"] : undefined,
      startTime: Date.now(),
    };
  }
}

export const CORRELATION_HEADERS = {
  REQUEST_ID: "X-Request-ID",
  CORRELATION_ID: "X-Correlation-ID",
  SESSION_ID: "X-Session-ID",
  TRACE_ID: "X-Trace-ID",
  SPAN_ID: "X-Span-ID",
  PARENT_ID: "X-Parent-ID",
} as const;

export function buildCorrelationHeaders(context: CorrelationContext): Record<string, string> {
  return {
    [CORRELATION_HEADERS.REQUEST_ID]: context.requestId,
    [CORRELATION_HEADERS.CORRELATION_ID]: context.requestId,
    [CORRELATION_HEADERS.SESSION_ID]: context.sessionId ?? "",
    [CORRELATION_HEADERS.TRACE_ID]: context.traceId ?? context.requestId,
    [CORRELATION_HEADERS.SPAN_ID]: context.spanId ?? context.requestId,
    [CORRELATION_HEADERS.PARENT_ID]: context.parentId ?? "",
  };
}

export function parseCorrelationHeaders(
  headers: Record<string, string | string[] | undefined>
): Partial<CorrelationContext> {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return typeof value === "string" ? value : undefined;
  };

  const result: Partial<CorrelationContext> = {};

  const requestId = getHeader(CORRELATION_HEADERS.REQUEST_ID);
  if (requestId !== undefined) result.requestId = requestId;

  const sessionId = getHeader(CORRELATION_HEADERS.SESSION_ID);
  if (sessionId !== undefined && sessionId !== "") result.sessionId = sessionId;

  const parentId = getHeader(CORRELATION_HEADERS.PARENT_ID);
  if (parentId !== undefined) result.parentId = parentId;

  const spanId = getHeader(CORRELATION_HEADERS.SPAN_ID);
  if (spanId !== undefined) result.spanId = spanId;

  const traceId = getHeader(CORRELATION_HEADERS.TRACE_ID);
  if (traceId !== undefined) result.traceId = traceId;

  return result;
}

export class CorrelationStore {
  private static storage = new Map<symbol, CorrelationContext>();
  private static currentKey: symbol | null = null;

  static async run<T>(context: CorrelationContext, fn: () => Promise<T>): Promise<T> {
    const key = Symbol("correlation");
    const previousKey = this.currentKey;

    this.storage.set(key, context);
    this.currentKey = key;

    try {
      return await fn();
    } finally {
      this.currentKey = previousKey;
      this.storage.delete(key);
    }
  }

  static get(): CorrelationContext | undefined {
    if (!this.currentKey) {
      return undefined;
    }
    return this.storage.get(this.currentKey);
  }

  static clear(): void {
    this.storage.clear();
    this.currentKey = null;
  }
}

setInterval(() => {
  MCPCorrelation.cleanup();
}, 60000);
