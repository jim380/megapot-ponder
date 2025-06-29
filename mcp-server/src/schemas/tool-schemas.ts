import type { JSONSchema7 } from "json-schema";

const commonSchemas = {
  pagination: {
    type: "object",
    properties: {
      first: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        description: "Number of items to fetch (max 1000)",
      },
      skip: {
        type: "integer",
        minimum: 0,
        description: "Number of items to skip for pagination",
      },
    },
    additionalProperties: false,
  } as JSONSchema7,

  orderDirection: {
    type: "string",
    enum: ["asc", "desc"],
    description: "Sort direction",
  } as JSONSchema7,

  ethereumAddress: {
    type: "string",
    pattern: "^0x[a-fA-F0-9]{40}$",
    description: "Valid Ethereum address",
  } as JSONSchema7,

  bigIntString: {
    type: "string",
    pattern: "^[0-9]+$",
    description: "BigInt as string (numeric digits only)",
  } as JSONSchema7,

  timestamp: {
    type: "integer",
    minimum: 0,
    description: "Unix timestamp",
  } as JSONSchema7,

  boolean: {
    type: "boolean",
  } as JSONSchema7,
};

export const queryUsersSchema: JSONSchema7 = {
  type: "object",
  properties: {
    first: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Number of items to fetch (max 1000)",
    },
    skip: {
      type: "integer",
      minimum: 0,
      description: "Number of items to skip for pagination",
    },

    orderBy: {
      type: "string",
      enum: ["totalWinnings", "totalTicketsPurchased", "totalReferralFees", "createdAt"],
      description: "Field to order by",
    },
    orderDirection: commonSchemas.orderDirection,

    where: {
      type: "object",
      properties: {
        isActive: commonSchemas.boolean,
        isLP: commonSchemas.boolean,
        totalWinnings_gt: commonSchemas.bigIntString,
        totalTicketsPurchased_gt: commonSchemas.bigIntString,
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  title: "QueryUsersParams",
  description: "Parameters for querying user data with filtering, pagination, and sorting",
};

export const queryRoundsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    first: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Number of items to fetch (max 1000)",
    },
    skip: {
      type: "integer",
      minimum: 0,
      description: "Number of items to skip for pagination",
    },

    orderBy: {
      type: "string",
      enum: ["startTime", "jackpotAmount", "totalTicketsValue", "totalLpSupplied"],
      description: "Field to order by",
    },
    orderDirection: commonSchemas.orderDirection,

    where: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["ACTIVE", "DRAWING", "RESOLVED"],
          description: "Round status filter",
        },
        startTime_gte: commonSchemas.timestamp,
        startTime_lte: commonSchemas.timestamp,
        jackpotAmount_gt: commonSchemas.bigIntString,
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  title: "QueryRoundsParams",
  description: "Parameters for querying jackpot round data with filtering, pagination, and sorting",
};

export const queryTicketsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    first: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Number of items to fetch (max 1000)",
    },
    skip: {
      type: "integer",
      minimum: 0,
      description: "Number of items to skip for pagination",
    },

    orderBy: {
      type: "string",
      enum: ["timestamp", "blockNumber", "ticketsPurchasedBps"],
      description: "Field to order by",
    },
    orderDirection: commonSchemas.orderDirection,

    where: {
      type: "object",
      properties: {
        roundId: {
          type: "string",
          description: "Filter by specific round ID",
        },
        buyerAddress: commonSchemas.ethereumAddress,
        recipientAddress: commonSchemas.ethereumAddress,
        referrerAddress: commonSchemas.ethereumAddress,
        timestamp_gte: commonSchemas.timestamp,
        timestamp_lte: commonSchemas.timestamp,
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  title: "QueryTicketsParams",
  description:
    "Parameters for querying ticket purchase data with filtering, pagination, and sorting",
};

export const queryLPsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    first: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Number of items to fetch (max 1000)",
    },
    skip: {
      type: "integer",
      minimum: 0,
      description: "Number of items to skip for pagination",
    },

    orderBy: {
      type: "string",
      enum: ["stake", "totalFeesEarned", "totalDeposited", "riskPercentage", "createdAt"],
      description: "Field to order by",
    },
    orderDirection: commonSchemas.orderDirection,

    where: {
      type: "object",
      properties: {
        isActive: commonSchemas.boolean,
        stake_gt: commonSchemas.bigIntString,
        riskPercentage_gte: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Minimum risk percentage",
        },
        riskPercentage_lte: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Maximum risk percentage",
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  title: "QueryLiquidityProvidersParams",
  description:
    "Parameters for querying liquidity provider data with filtering, pagination, and sorting",
};

export const getCurrentRoundSchema: JSONSchema7 = {
  type: "object",
  properties: {},
  additionalProperties: false,
  title: "GetCurrentRoundParams",
  description: "No parameters required - gets the current active round",
};

export const getProtocolStatsSchema: JSONSchema7 = {
  type: "object",
  properties: {},
  additionalProperties: false,
  title: "GetProtocolStatsParams",
  description: "No parameters required - gets latest protocol statistics",
};

export const getUserStatsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    address: {
      ...commonSchemas.ethereumAddress,
      description: "Ethereum address of the user",
    },
  },
  required: ["address"],
  additionalProperties: false,
  title: "GetUserStatsParams",
  description: "Parameters for getting user statistics",
};

export const getLpStatsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    address: {
      ...commonSchemas.ethereumAddress,
      description: "Ethereum address of the liquidity provider",
    },
  },
  required: ["address"],
  additionalProperties: false,
  title: "GetLpStatsParams",
  description: "Parameters for getting LP statistics",
};

export const getLeaderboardSchema: JSONSchema7 = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["users", "lps"],
      description: "Type of leaderboard to retrieve",
    },
    first: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 10,
      description: "Number of top entries to retrieve (max 100)",
    },
  },
  required: ["type"],
  additionalProperties: false,
  title: "GetLeaderboardParams",
  description: "Parameters for getting leaderboard data",
};

export const getHourlyStatsSchema: JSONSchema7 = {
  type: "object",
  properties: {
    startTime: commonSchemas.timestamp,
    endTime: commonSchemas.timestamp,
    first: {
      type: "integer",
      minimum: 1,
      maximum: 168,
      default: 24,
      description: "Number of hourly data points to retrieve (max 168 for 1 week)",
    },
  },
  additionalProperties: false,
  title: "GetHourlyStatsParams",
  description: "Parameters for getting hourly statistics data",
};

export const subscriptionSchema: JSONSchema7 = {
  type: "object",
  properties: {
    roundId: {
      type: "string",
      description: "ID of the round to subscribe/unsubscribe to/from",
    },
  },
  required: ["roundId"],
  additionalProperties: false,
  title: "SubscriptionParams",
  description: "Parameters for subscription operations",
};

export const toolSchemas: Record<string, JSONSchema7> = {
  queryUsers: queryUsersSchema,
  queryRounds: queryRoundsSchema,
  queryTickets: queryTicketsSchema,
  queryLPs: queryLPsSchema,
  queryLiquidityProviders: queryLPsSchema,
  getCurrentRound: getCurrentRoundSchema,
  getProtocolStats: getProtocolStatsSchema,
  getUserStats: getUserStatsSchema,
  getLpStats: getLpStatsSchema,
  getLeaderboard: getLeaderboardSchema,
  getHourlyStats: getHourlyStatsSchema,
  subscribeToRound: subscriptionSchema,
  unsubscribeFromRound: subscriptionSchema,
};

export function getToolSchema(toolName: string): JSONSchema7 | null {
  return toolSchemas[toolName] || null;
}

export function getAvailableTools(): string[] {
  return Object.keys(toolSchemas);
}
