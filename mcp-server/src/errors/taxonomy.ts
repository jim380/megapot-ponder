export class MCPError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;

    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class InvalidQueryError extends MCPError {
  constructor(message: string, details?: unknown) {
    super(1000, message, details);
  }
}

export class ResourceNotFoundError extends MCPError {
  constructor(resourceType: string, resourceId: string) {
    super(1001, `${resourceType} not found: ${resourceId}`, { resourceType, resourceId });
  }
}

export class InvalidResourceUriError extends MCPError {
  constructor(uri: string) {
    super(1002, `Invalid resource URI: ${uri}`, { uri });
  }
}

export class UnsupportedOperationError extends MCPError {
  constructor(operation: string, reason?: string) {
    super(1003, `Unsupported operation: ${operation}${reason ? ` - ${reason}` : ""}`, {
      operation,
      reason,
    });
  }
}

export class InvalidAddressError extends MCPError {
  constructor(address: string) {
    super(1004, `Invalid Ethereum address: ${address}`, { address });
  }
}

export class RoundNotActiveError extends MCPError {
  constructor(roundId: string, status: string) {
    super(1005, `Round ${roundId} is not active (status: ${status})`, { roundId, status });
  }
}

export class GraphQLConnectionError extends MCPError {
  constructor(endpoint: string, originalError?: unknown) {
    super(1100, `Failed to connect to GraphQL endpoint: ${endpoint}`, { endpoint, originalError });
  }
}

export class GraphQLQueryError extends MCPError {
  constructor(query: string, originalError?: unknown) {
    super(1101, "GraphQL query execution failed", { query, originalError });
  }
}

export class QueryComplexityError extends MCPError {
  constructor(complexity: number, limit: number) {
    super(1102, `Query complexity ${complexity} exceeds limit ${limit}`, { complexity, limit });
  }
}

export class GraphQLSchemaError extends MCPError {
  constructor(message: string, details?: unknown) {
    super(1103, `GraphQL schema error: ${message}`, details);
  }
}

export class GraphQLTimeoutError extends MCPError {
  constructor(timeoutMs: number, query?: string) {
    super(1104, `GraphQL query timed out after ${timeoutMs}ms`, { timeoutMs, query });
  }
}

export class WebSocketDisconnectionError extends MCPError {
  constructor(outageMs: number, subscriptionCount: number, bufferSize: number) {
    super(1105, `WebSocket outage exceeded buffer duration: ${outageMs}ms with ${subscriptionCount} subscriptions (${bufferSize} buffered updates)`, {
      outageMs,
      subscriptionCount,
      bufferSize,
    });
  }
}

export class InvalidParametersError extends MCPError {
  constructor(paramName: string, reason: string, value?: unknown) {
    super(1200, `Invalid parameter '${paramName}': ${reason}`, { paramName, reason, value });
  }
}

export class SchemaValidationError extends MCPError {
  constructor(errors: unknown[]) {
    super(1201, "Schema validation failed", { errors });
  }
}

export class InvalidPaginationError extends MCPError {
  constructor(first?: number, skip?: number) {
    super(1202, "Invalid pagination parameters", { first, skip });
  }
}

export class InvalidOrderingError extends MCPError {
  constructor(orderBy: string, validOptions: string[]) {
    super(1203, `Invalid orderBy value: ${orderBy}`, { orderBy, validOptions });
  }
}

export class InvalidFilterError extends MCPError {
  constructor(filterName: string, reason: string) {
    super(1204, `Invalid filter '${filterName}': ${reason}`, { filterName, reason });
  }
}

export class InvalidBigIntError extends MCPError {
  constructor(value: string, field: string) {
    super(1205, `Invalid BigInt value for field '${field}': ${value}`, { value, field });
  }
}

export class RateLimitExceededError extends MCPError {
  constructor(limit: number, windowMs: number, retryAfter?: number) {
    super(1300, `Rate limit exceeded: ${limit} requests per ${windowMs}ms`, {
      limit,
      windowMs,
      retryAfter,
    });
  }
}

export class QueryQuotaExceededError extends MCPError {
  constructor(used: number, quota: number, resetAt?: Date) {
    super(1301, `Query quota exceeded: ${used}/${quota}`, { used, quota, resetAt });
  }
}

export class SubscriptionLimitError extends MCPError {
  constructor(current: number, limit: number) {
    super(1302, `Subscription limit exceeded: ${current}/${limit}`, { current, limit });
  }
}

export class InternalServerError extends MCPError {
  constructor(message: string, originalError?: unknown) {
    super(1400, `Internal server error: ${message}`, { originalError });
  }
}

export class ConfigurationError extends MCPError {
  constructor(configKey: string, reason: string) {
    super(1401, `Configuration error for '${configKey}': ${reason}`, { configKey, reason });
  }
}

export class InitializationError extends MCPError {
  constructor(component: string, reason: string) {
    super(1402, `Failed to initialize ${component}: ${reason}`, { component, reason });
  }
}

export function mapGraphQLError(error: any): MCPError {
  if (error.networkError) {
    return new GraphQLConnectionError(error.networkError.url || "unknown", error.networkError);
  }

  if (error.graphQLErrors && Array.isArray(error.graphQLErrors) && error.graphQLErrors.length > 0) {
    const gqlError = error.graphQLErrors[0];

    if (gqlError.message?.includes("complexity")) {
      const complexityMatch = gqlError.message.match(/complexity (\d+) exceeds maximum (\d+)/);
      if (complexityMatch) {
        return new QueryComplexityError(parseInt(complexityMatch[1]), parseInt(complexityMatch[2]));
      }
    }

    if (gqlError.extensions?.code === "GRAPHQL_VALIDATION_FAILED") {
      return new SchemaValidationError(error.graphQLErrors);
    }

    return new GraphQLQueryError(gqlError.message || "Unknown GraphQL error", error);
  }

  if (error.message?.includes("timeout")) {
    const timeoutMatch = error.message.match(/(\d+)ms/);
    const timeoutMs = timeoutMatch ? parseInt(timeoutMatch[1]) : 30000;
    return new GraphQLTimeoutError(timeoutMs);
  }

  return new InternalServerError("Unexpected GraphQL error", error);
}

export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

export function getErrorCode(error: unknown): number {
  if (isMCPError(error)) {
    return error.code;
  }
  return 1400;
}

export const ERROR_CODE_RANGES = {
  DOMAIN: { min: 1000, max: 1099 },
  GRAPHQL: { min: 1100, max: 1199 },
  VALIDATION: { min: 1200, max: 1299 },
  RATE_LIMIT: { min: 1300, max: 1399 },
  SYSTEM: { min: 1400, max: 1499 },
} as const;

export function isErrorInCategory(code: number, category: keyof typeof ERROR_CODE_RANGES): boolean {
  const range = ERROR_CODE_RANGES[category];
  return code >= range.min && code <= range.max;
}
