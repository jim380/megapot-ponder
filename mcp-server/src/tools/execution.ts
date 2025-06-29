import type { MegapotGraphQLClient } from "../graphql/index.js";
import type {
  QueryUsersParams,
  QueryRoundsParams,
  QueryTicketsParams,
  QueryLiquidityProvidersParams,
  GetUserStatsParams,
  GetLpStatsParams,
  GetLeaderboardParams,
  GetHourlyStatsParams,
  SubscriptionParams,
} from "../types/index.js";
import { serverLogger as logger } from "../logging/index.js";
import { MCPError } from "../errors/index.js";

function buildQueryArgs(params: any): string {
  const args: string[] = [];

  if (params.first !== undefined) {
    args.push(`first: ${params.first}`);
  }
  if (params.skip !== undefined) {
    args.push(`skip: ${params.skip}`);
  }

  if (params.orderBy !== undefined) {
    args.push(`orderBy: ${params.orderBy}`);
  }
  if (params.orderDirection !== undefined) {
    args.push(`orderDirection: ${params.orderDirection}`);
  }

  if (params.where && Object.keys(params.where).length > 0) {
    const whereArgs = Object.entries(params.where)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "string") {
          return `${key}: "${value}"`;
        }
        return `${key}: ${value}`;
      });

    if (whereArgs.length > 0) {
      args.push(`where: { ${whereArgs.join(", ")} }`);
    }
  }

  return args.length > 0 ? `(${args.join(", ")})` : "";
}

export async function executeQueryUsers(
  client: MegapotGraphQLClient,
  params: QueryUsersParams
): Promise<any> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      users${args} {
        id
        address
        totalTicketsPurchased
        totalWinnings
        totalReferralFees
        isActive
        isLP
        createdAt
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryUsers");
  return await client.query(query);
}

export async function executeQueryRounds(
  client: MegapotGraphQLClient,
  params: QueryRoundsParams
): Promise<any> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      jackpotRounds${args} {
        id
        roundNumber
        status
        jackpotAmount
        totalTicketsValue
        totalLpSupplied
        startTime
        endTime
        winnerAddress
        ticketsSold
        createdAt
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryRounds");
  return await client.query(query);
}

export async function executeQueryTickets(
  client: MegapotGraphQLClient,
  params: QueryTicketsParams
): Promise<any> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      tickets${args} {
        id
        ticketNumber
        buyer
        recipient
        referrer
        roundId
        timestamp
        blockNumber
        ticketsPurchasedBps
        transactionHash
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryTickets");
  return await client.query(query);
}

export async function executeQueryLPs(
  client: MegapotGraphQLClient,
  params: QueryLiquidityProvidersParams
): Promise<any> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      liquidityProviders${args} {
        id
        address
        stake
        totalFeesEarned
        totalDeposited
        riskPercentage
        isActive
        createdAt
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryLPs");
  return await client.query(query);
}

export async function executeGetCurrentRound(client: MegapotGraphQLClient): Promise<any> {
  const query = `
    query {
      jackpotRounds(where: { status: "ACTIVE" }, first: 1, orderBy: startTime, orderDirection: desc) {
        id
        roundNumber
        status
        jackpotAmount
        totalTicketsValue
        totalLpSupplied
        startTime
        ticketsSold
        createdAt
      }
    }
  `;

  logger.debug({ query }, "Executing getCurrentRound");
  return await client.query(query);
}

export async function executeGetProtocolStats(client: MegapotGraphQLClient): Promise<any> {
  const query = `
    query {
      hourlyStats(orderBy: timestamp, orderDirection: desc, first: 1) {
        timestamp
        totalVolume
        uniqueUsers
        totalRounds
        activeUsers
        totalTicketsSold
        averageTicketPrice
      }
    }
  `;

  logger.debug({ query }, "Executing getProtocolStats");
  return await client.query(query);
}

export async function executeGetUserStats(
  client: MegapotGraphQLClient,
  params: GetUserStatsParams
): Promise<any> {
  const query = `
    query {
      user(id: "${params.address}") {
        id
        address
        totalTicketsPurchased
        totalWinnings
        totalReferralFees
        isActive
        isLP
        createdAt
        tickets(orderBy: timestamp, orderDirection: desc, first: 10) {
          id
          ticketNumber
          roundId
          timestamp
        }
        referrals(first: 10) {
          id
          referredUser
          totalFees
        }
      }
    }
  `;

  logger.debug({ query, params }, "Executing getUserStats");
  return await client.query(query);
}

export async function executeGetLpStats(
  client: MegapotGraphQLClient,
  params: GetLpStatsParams
): Promise<any> {
  const query = `
    query {
      liquidityProvider(id: "${params.address}") {
        id
        address
        stake
        totalFeesEarned
        totalDeposited
        riskPercentage
        isActive
        createdAt
        deposits(orderBy: timestamp, orderDirection: desc, first: 10) {
          id
          amount
          timestamp
        }
        withdrawals(orderBy: timestamp, orderDirection: desc, first: 10) {
          id
          amount
          timestamp
        }
      }
    }
  `;

  logger.debug({ query, params }, "Executing getLpStats");
  return await client.query(query);
}

export async function executeGetLeaderboard(
  client: MegapotGraphQLClient,
  params: GetLeaderboardParams
): Promise<any> {
  let query: string;

  if (params.type === "users") {
    query = `
      query {
        users(orderBy: totalWinnings, orderDirection: desc, first: ${params.first || 10}) {
          id
          address
          totalTicketsPurchased
          totalWinnings
          totalReferralFees
        }
      }
    `;
  } else if (params.type === "lps") {
    query = `
      query {
        liquidityProviders(orderBy: totalFeesEarned, orderDirection: desc, first: ${params.first || 10}) {
          id
          address
          stake
          totalFeesEarned
          totalDeposited
          riskPercentage
        }
      }
    `;
  } else {
    throw new MCPError(1002, `Unknown leaderboard type: ${params.type}`, { type: params.type });
  }

  logger.debug({ query, params }, "Executing getLeaderboard");
  return await client.query(query);
}

export async function executeGetHourlyStats(
  client: MegapotGraphQLClient,
  params: GetHourlyStatsParams
): Promise<any> {
  const args: string[] = [];

  const whereConditions: string[] = [];
  if (params.startTime !== undefined) {
    whereConditions.push(`timestamp_gte: ${params.startTime}`);
  }
  if (params.endTime !== undefined) {
    whereConditions.push(`timestamp_lte: ${params.endTime}`);
  }

  if (whereConditions.length > 0) {
    args.push(`where: { ${whereConditions.join(", ")} }`);
  }

  if (params.first !== undefined) {
    args.push(`first: ${params.first}`);
  }

  args.push("orderBy: timestamp", "orderDirection: desc");

  const query = `
    query {
      hourlyStats(${args.join(", ")}) {
        timestamp
        totalVolume
        uniqueUsers
        totalRounds
        activeUsers
        totalTicketsSold
        averageTicketPrice
      }
    }
  `;

  logger.debug({ query, params }, "Executing getHourlyStats");
  return await client.query(query);
}

export const toolExecutors = {
  queryUsers: executeQueryUsers,
  queryRounds: executeQueryRounds,
  queryTickets: executeQueryTickets,
  queryLPs: executeQueryLPs,
  queryLiquidityProviders: executeQueryLPs,
  getCurrentRound: executeGetCurrentRound,
  getProtocolStats: executeGetProtocolStats,
  getUserStats: executeGetUserStats,
  getLpStats: executeGetLpStats,
  getLeaderboard: executeGetLeaderboard,
  getHourlyStats: executeGetHourlyStats,

  subscribeToRound: async (_client: MegapotGraphQLClient, params: SubscriptionParams) => {
    throw new MCPError(1003, "Subscription functionality not yet implemented", { params });
  },
  unsubscribeFromRound: async (_client: MegapotGraphQLClient, params: SubscriptionParams) => {
    throw new MCPError(1003, "Subscription functionality not yet implemented", { params });
  },
};

export async function executeTool(
  client: MegapotGraphQLClient,
  toolName: string,
  validatedParams: any
): Promise<any> {
  const executor = toolExecutors[toolName as keyof typeof toolExecutors];

  if (!executor) {
    throw new MCPError(1002, `Unknown tool: ${toolName}`, { toolName });
  }

  if (toolName === "getCurrentRound" || toolName === "getProtocolStats") {
    return await (executor as any)(client);
  }

  return await (executor as any)(client, validatedParams);
}
