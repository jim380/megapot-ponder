import type { Tool, Resource } from "@modelcontextprotocol/sdk/types.js";

export const RESOURCE_URI_PATTERNS = {
  USER: "megapot://users/{id}",
  ROUND: "megapot://rounds/{id}",
  TICKET: "megapot://tickets/{id}",
  LP: "megapot://lps/{id}",
  REFERRAL: "megapot://referrals/{id}",
  STATS: "megapot://stats/{type}",
} as const;

export enum ToolName {
  QUERY_USERS = "queryUsers",
  QUERY_ROUNDS = "queryRounds",
  QUERY_TICKETS = "queryTickets",
  QUERY_LPS = "queryLiquidityProviders",
  GET_CURRENT_ROUND = "getCurrentRound",
  GET_PROTOCOL_STATS = "getProtocolStats",
  GET_USER_STATS = "getUserStats",
  GET_LP_STATS = "getLpStats",
  GET_LEADERBOARD = "getLeaderboard",
  GET_HOURLY_STATS = "getHourlyStats",
  SUBSCRIBE_TO_ROUND = "subscribeToRound",
  UNSUBSCRIBE_FROM_ROUND = "unsubscribeFromRound",
}

export interface PaginationParams {
  first?: number;
  skip?: number;
}

export interface OrderingParams<T extends string> {
  orderBy?: T;
  orderDirection?: "asc" | "desc";
}

export interface QueryUsersParams
  extends PaginationParams,
    OrderingParams<"totalWinnings" | "totalTicketsPurchased" | "totalReferralFees" | "createdAt"> {
  where?: {
    isActive?: boolean;
    isLP?: boolean;
    totalWinnings_gt?: string;
    totalTicketsPurchased_gt?: string;
  };
}

export interface QueryRoundsParams
  extends PaginationParams,
    OrderingParams<"startTime" | "jackpotAmount" | "totalTicketsValue" | "totalLpSupplied"> {
  where?: {
    status?: "ACTIVE" | "DRAWING" | "RESOLVED";
    startTime_gte?: number;
    startTime_lte?: number;
    jackpotAmount_gt?: string;
  };
}

export interface QueryTicketsParams
  extends PaginationParams,
    OrderingParams<"timestamp" | "blockNumber" | "ticketsPurchasedBps"> {
  where?: {
    roundId?: string;
    buyerAddress?: string;
    recipientAddress?: string;
    referrerAddress?: string;
    timestamp_gte?: number;
    timestamp_lte?: number;
  };
}

export interface QueryLiquidityProvidersParams
  extends PaginationParams,
    OrderingParams<
      "stake" | "totalFeesEarned" | "totalDeposited" | "riskPercentage" | "createdAt"
    > {
  where?: {
    isActive?: boolean;
    stake_gt?: string;
    riskPercentage_gte?: number;
    riskPercentage_lte?: number;
  };
}

export interface GetUserStatsParams {
  address: string;
}

export interface GetLpStatsParams {
  address: string;
}

export interface GetLeaderboardParams {
  type: "users" | "lps";
  first?: number;
}

export interface GetHourlyStatsParams {
  startTime?: number;
  endTime?: number;
  first?: number;
}

export interface SubscriptionParams {
  roundId: string;
}

export type ToolParams =
  | QueryUsersParams
  | QueryRoundsParams
  | QueryTicketsParams
  | QueryLiquidityProvidersParams
  | GetUserStatsParams
  | GetLpStatsParams
  | GetLeaderboardParams
  | GetHourlyStatsParams
  | SubscriptionParams;

export interface MegapotResponse<T> {
  data: T;
  metadata?: {
    timestamp: number;
    executionTime?: number;
    totalCount?: number;
    hasMore?: boolean;
  };
}

export interface MegapotResource extends Resource {
  subscribable?: boolean;

  lastUpdated?: number;

  size?: number;
}

export interface MegapotTool extends Tool {
  rateLimit?: {
    requests: number;
    windowMs: number;
  };

  complexity?: "low" | "medium" | "high";
}

export interface SubscriptionState {
  resourceUri: string;
  active: boolean;
  lastEventId?: string;
  reconnectAttempts: number;
}

export const isQueryUsersParams = (params: unknown): params is QueryUsersParams => {
  return typeof params === "object" && params !== null;
};

export const isQueryRoundsParams = (params: unknown): params is QueryRoundsParams => {
  return typeof params === "object" && params !== null;
};

export const isQueryTicketsParams = (params: unknown): params is QueryTicketsParams => {
  return typeof params === "object" && params !== null;
};

export const isQueryLiquidityProvidersParams = (
  params: unknown
): params is QueryLiquidityProvidersParams => {
  return typeof params === "object" && params !== null;
};

export const buildResourceUri = {
  user: (id: string): string => RESOURCE_URI_PATTERNS.USER.replace("{id}", id),
  round: (id: string): string => RESOURCE_URI_PATTERNS.ROUND.replace("{id}", id),
  ticket: (id: string): string => RESOURCE_URI_PATTERNS.TICKET.replace("{id}", id),
  lp: (id: string): string => RESOURCE_URI_PATTERNS.LP.replace("{id}", id),
  referral: (id: string): string => RESOURCE_URI_PATTERNS.REFERRAL.replace("{id}", id),
  stats: (type: string): string => RESOURCE_URI_PATTERNS.STATS.replace("{type}", type),
};

export const parseResourceUri = (uri: string): { type: string; id?: string | undefined } | null => {
  const patterns = [
    { regex: /^megapot:\/\/users\/(.+)$/, type: "user" },
    { regex: /^megapot:\/\/rounds\/(.+)$/, type: "round" },
    { regex: /^megapot:\/\/tickets\/(.+)$/, type: "ticket" },
    { regex: /^megapot:\/\/lps\/(.+)$/, type: "lp" },
    { regex: /^megapot:\/\/referrals\/(.+)$/, type: "referral" },
    { regex: /^megapot:\/\/stats\/(.+)$/, type: "stats" },
  ];

  for (const { regex, type } of patterns) {
    const match = uri.match(regex);
    if (match !== null && match[1] !== undefined && match[1] !== null && match[1] !== "") {
      return { type, id: match[1] };
    }
  }

  return null;
};
