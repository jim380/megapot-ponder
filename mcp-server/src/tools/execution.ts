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
  User,
  JackpotRound,
  Ticket,
  LiquidityProvider,
  LpAction,
  Referral,
  HourlyStat,
} from "../types/index.js";
import { LpActionType } from "../types/index.js";
import { serverLogger as logger } from "../logging/index.js";
import { MCPError } from "../errors/index.js";

interface QueryParams {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: string;
  where?: Record<string, string | number | boolean | undefined>;
}

function buildQueryArgs(params: QueryParams): string {
  logger.debug("=== buildQueryArgs START ===");
  logger.debug({ params }, "Input parameters to buildQueryArgs");

  const args: string[] = [];

  if (params.first !== undefined) {
    logger.debug({ first: params.first }, "Adding limit argument");
    args.push(`limit: ${params.first}`);
  }

  if (params.skip !== undefined) {
    logger.debug({ skip: params.skip }, "Adding offset argument");
    args.push(`offset: ${params.skip}`);
  }

  if (params.orderBy !== undefined) {
    logger.debug({ orderBy: params.orderBy }, "Adding orderBy argument");
    args.push(`orderBy: "${params.orderBy}"`);
  }
  if (params.orderDirection !== undefined) {
    logger.debug({ orderDirection: params.orderDirection }, "Adding orderDirection argument");
    args.push(`orderDirection: "${params.orderDirection}"`);
  }

  if (params.where !== undefined && Object.keys(params.where).length > 0) {
    logger.debug({ where: params.where }, "Processing where clause");
    const whereArgs = Object.entries(params.where)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "string") {
          return `${key}: "${value}"`;
        }
        return `${key}: ${String(value)}`;
      });

    if (whereArgs.length > 0) {
      logger.debug({ whereArgs }, "Adding where clause");
      args.push(`where: { ${whereArgs.join(", ")} }`);
    }
  }

  const result = args.length > 0 ? `(${args.join(", ")})` : "";
  logger.debug({ result, argsCount: args.length }, "=== buildQueryArgs END ===");
  return result;
}

interface GraphQLListResponse<T> {
  items: T[];
  totalCount: number;
}

interface UsersResponse {
  users: User[];
  totalCount: number;
}

export async function executeQueryUsers(
  client: MegapotGraphQLClient,
  params: QueryUsersParams
): Promise<UsersResponse> {
  logger.info("=== START executeQueryUsers ===");
  logger.info({ params }, "Input parameters");

  const args = buildQueryArgs(params);
  logger.info({ args }, "Built query arguments");

  const query = `
    query {
      userss${args} {
        items {
          id
          totalTicketsPurchased
          totalWinnings
          totalReferralFees
          isActive
          isLP
          createdAt
        }
        totalCount
      }
    }
  `;

  logger.info({ query }, "Final GraphQL query");

  try {
    logger.debug("About to call client.query()");
    const result = await client.query<{ userss: GraphQLListResponse<User> }>(query);
    logger.info({ result }, "Raw GraphQL response");

    const transformed: UsersResponse = {
      users: result.userss?.items ?? [],
      totalCount: result.userss?.totalCount ?? 0,
    };

    logger.info({ transformed }, "Transformed response");
    logger.info("=== END executeQueryUsers SUCCESS ===");

    return transformed;
  } catch (error) {
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      },
      "GraphQL query failed in executeQueryUsers"
    );
    logger.info("=== END executeQueryUsers ERROR ===");
    throw error;
  }
}

interface RoundsResponse {
  jackpotRounds: (JackpotRound & { roundNumber: string; ticketsSold: bigint })[];
  totalCount: number;
}

export async function executeQueryRounds(
  client: MegapotGraphQLClient,
  params: QueryRoundsParams
): Promise<RoundsResponse> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      jackpotRoundss${args} {
        items {
          id
          status
          jackpotAmount
          totalTicketsValue
          totalLpSupplied
          startTime
          endTime
          winnerAddress
          ticketCountTotalBps
          createdAt
        }
        totalCount
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryRounds");
  const result = await client.query<{ jackpotRoundss: GraphQLListResponse<JackpotRound> }>(query);

  const rounds = (result.jackpotRoundss?.items ?? []).map((round) => ({
    ...round,
    roundNumber: round.id,
    ticketsSold: round.ticketCountTotalBps,
  }));

  return {
    jackpotRounds: rounds,
    totalCount: result.jackpotRoundss?.totalCount ?? 0,
  };
}

interface TicketsResponse {
  tickets: Ticket[];
  totalCount: number;
}

export async function executeQueryTickets(
  client: MegapotGraphQLClient,
  params: QueryTicketsParams
): Promise<TicketsResponse> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      ticketss${args} {
        items {
          id
          buyerAddress
          recipientAddress
          referrerAddress
          roundId
          timestamp
          blockNumber
          ticketsPurchasedBps
          purchasePrice
          transactionHash
        }
        totalCount
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryTickets");
  const result = await client.query<{ ticketss: GraphQLListResponse<Ticket> }>(query);

  const tickets = result.ticketss?.items ?? [];

  return {
    tickets: tickets,
    totalCount: result.ticketss?.totalCount ?? 0,
  };
}

interface LpsResponse {
  liquidityProviders: (LiquidityProvider & { address: string })[];
  totalCount: number;
}

export async function executeQueryLPs(
  client: MegapotGraphQLClient,
  params: QueryLiquidityProvidersParams
): Promise<LpsResponse> {
  const args = buildQueryArgs(params);
  const query = `
    query {
      liquidityProviderss${args} {
        items {
          id
          stake
          totalFeesEarned
          totalDeposited
          riskPercentage
          isActive
          createdAt
        }
        totalCount
      }
    }
  `;

  logger.debug({ query, params }, "Executing queryLPs");
  const result = await client.query<{
    liquidityProviderss: GraphQLListResponse<LiquidityProvider>;
  }>(query);

  const lps = (result.liquidityProviderss?.items ?? []).map((lp) => ({
    ...lp,
    address: lp.id,
  }));

  return {
    liquidityProviders: lps,
    totalCount: result.liquidityProviderss?.totalCount ?? 0,
  };
}

export async function executeGetCurrentRound(
  client: MegapotGraphQLClient
): Promise<RoundsResponse> {
  const query = `
    query {
      jackpotRoundss(where: { status: "ACTIVE" }, limit: 1, orderBy: "startTime", orderDirection: "desc") {
        items {
          id
          status
          jackpotAmount
          totalTicketsValue
          totalLpSupplied
          startTime
          ticketCountTotalBps
          createdAt
        }
        totalCount
      }
    }
  `;

  logger.debug({ query }, "Executing getCurrentRound");
  const result = await client.query<{ jackpotRoundss: GraphQLListResponse<JackpotRound> }>(query);

  const round = result.jackpotRoundss?.items?.[0];
  if (round !== undefined) {
    return {
      jackpotRounds: [
        {
          ...round,
          roundNumber: round.id,
          ticketsSold: round.ticketCountTotalBps,
        },
      ],
      totalCount: 1,
    };
  }
  return { jackpotRounds: [], totalCount: 0 };
}

interface ProtocolStatsResponse {
  hourlyStats: (HourlyStat & {
    timestamp: number;
    totalVolume: bigint;
    uniqueUsers: number;
    totalRounds: number;
    activeUsers: number;
  })[];
}

export async function executeGetProtocolStats(
  client: MegapotGraphQLClient
): Promise<ProtocolStatsResponse> {
  const query = `
    query {
      hourlyStatss(orderBy: "hourTimestamp", orderDirection: "desc", limit: 1) {
        items {
          hourTimestamp
          totalTicketsValue
          uniquePlayers
          roundsCompleted
          totalTicketsSold
          totalLpFeesGenerated
          totalReferralFeesGenerated
          totalProtocolFeesGenerated
        }
        totalCount
      }
    }
  `;

  logger.debug({ query }, "Executing getProtocolStats");
  const result = await client.query<{ hourlyStatss: GraphQLListResponse<HourlyStat> }>(query);

  const stats = result.hourlyStatss?.items?.[0];
  if (stats !== undefined) {
    return {
      hourlyStats: [
        {
          ...stats,
          timestamp: stats.hourTimestamp,
          totalVolume: stats.totalTicketsValue,
          uniqueUsers: stats.uniquePlayers,
          totalRounds: stats.roundsCompleted,
          activeUsers: stats.uniquePlayers,
        },
      ],
    };
  }
  return { hourlyStats: [] };
}

interface UserStatsResponse {
  user:
    | (User & {
        address: string;
        tickets: (Ticket & { ticketNumber: string })[];
        referrals: (Referral & { referredUser: string; totalFees: bigint })[];
      })
    | null;
}

export async function executeGetUserStats(
  client: MegapotGraphQLClient,
  params: GetUserStatsParams
): Promise<UserStatsResponse> {
  const query = `
    query {
      users(where: { id: "${params.address}" }) {
        id
        totalTicketsPurchased
        totalWinnings
        totalReferralFees
        isActive
        isLP
        createdAt
      }
    }
  `;

  logger.debug({ query, params }, "Executing getUserStats");
  const result = await client.query<{ users: User[] }>(query);

  const ticketsQuery = `
    query {
      ticketss(where: { buyerAddress: "${params.address}" }, orderBy: "timestamp", orderDirection: "desc", limit: 10) {
        items {
          id
          roundId
          timestamp
        }
      }
    }
  `;

  const ticketsResult = await client.query<{ ticketss: GraphQLListResponse<Ticket> }>(ticketsQuery);

  const referralsQuery = `
    query {
      referralss(where: { referrerAddress: "${params.address}" }, limit: 10) {
        items {
          id
          referredAddress
          totalFeesGenerated
        }
      }
    }
  `;

  const referralsResult = await client.query<{ referralss: GraphQLListResponse<Referral> }>(
    referralsQuery
  );

  const user = result.users?.[0];
  if (user !== undefined) {
    return {
      user: {
        ...user,
        address: user.id,
        tickets: (ticketsResult.ticketss?.items ?? []).map((ticket) => ({
          ...ticket,
          ticketNumber: ticket.id,
        })),
        referrals: (referralsResult.referralss?.items ?? []).map((referral) => ({
          ...referral,
          referredUser: referral.referredAddress,
          totalFees: referral.totalFeesGenerated,
        })),
      },
    };
  }
  return { user: null };
}

interface LpStatsResponse {
  liquidityProvider:
    | (LiquidityProvider & {
        address: string;
        deposits: LpAction[];
        withdrawals: LpAction[];
      })
    | null;
}

export async function executeGetLpStats(
  client: MegapotGraphQLClient,
  params: GetLpStatsParams
): Promise<LpStatsResponse> {
  const query = `
    query {
      liquidityProviderss(where: { id: "${params.address}" }) {
        items {
          id
          stake
          totalFeesEarned
          totalDeposited
          riskPercentage
          isActive
          createdAt
        }
      }
    }
  `;

  logger.debug({ query, params }, "Executing getLpStats");
  const result = await client.query<{
    liquidityProviderss: GraphQLListResponse<LiquidityProvider>;
  }>(query);

  const actionsQuery = `
    query {
      lpActionss(where: { lpAddress: "${params.address}" }, orderBy: "timestamp", orderDirection: "desc", limit: 20) {
        items {
          id
          actionType
          amount
          timestamp
        }
      }
    }
  `;

  const actionsResult = await client.query<{ lpActionss: GraphQLListResponse<LpAction> }>(
    actionsQuery
  );

  const lp = result.liquidityProviderss?.items?.[0];
  if (lp !== undefined) {
    const actions = actionsResult.lpActionss?.items ?? [];
    return {
      liquidityProvider: {
        ...lp,
        address: lp.id,
        deposits: actions
          .filter((action) => action.actionType === LpActionType.DEPOSIT)
          .slice(0, 10),
        withdrawals: actions
          .filter((action) => action.actionType === LpActionType.WITHDRAWAL)
          .slice(0, 10),
      },
    };
  }
  return { liquidityProvider: null };
}

interface LeaderboardResponse {
  users?: (User & { address: string })[];
  liquidityProviders?: (LiquidityProvider & { address: string })[];
}

export async function executeGetLeaderboard(
  client: MegapotGraphQLClient,
  params: GetLeaderboardParams
): Promise<LeaderboardResponse> {
  let query: string;

  if (params.type === "users") {
    query = `
      query {
        userss(orderBy: "totalWinnings", orderDirection: "desc", limit: ${params.first ?? 10}) {
          items {
            id
            totalTicketsPurchased
            totalWinnings
            totalReferralFees
          }
          totalCount
        }
      }
    `;
  } else if (params.type === "lps") {
    query = `
      query {
        liquidityProviderss(orderBy: "totalFeesEarned", orderDirection: "desc", limit: ${params.first ?? 10}) {
          items {
            id
            stake
            totalFeesEarned
            totalDeposited
            riskPercentage
          }
          totalCount
        }
      }
    `;
  } else {
    throw new MCPError(1002, `Unknown leaderboard type: ${String(params.type)}`, {
      type: params.type,
    });
  }

  logger.debug({ query, params }, "Executing getLeaderboard");

  if (params.type === "users") {
    const result = await client.query<{ userss: GraphQLListResponse<User> }>(query);
    const users = (result.userss?.items ?? []).map((user) => ({
      ...user,
      address: user.id,
    }));
    return { users };
  } else {
    const result = await client.query<{
      liquidityProviderss: GraphQLListResponse<LiquidityProvider>;
    }>(query);
    const lps = (result.liquidityProviderss?.items ?? []).map((lp) => ({
      ...lp,
      address: lp.id,
    }));
    return { liquidityProviders: lps };
  }
}

export async function executeGetHourlyStats(
  client: MegapotGraphQLClient,
  params: GetHourlyStatsParams
): Promise<ProtocolStatsResponse> {
  const args: string[] = [];

  const whereConditions: string[] = [];
  if (params.startTime !== undefined) {
    whereConditions.push(`hourTimestamp_gte: ${params.startTime}`);
  }
  if (params.endTime !== undefined) {
    whereConditions.push(`hourTimestamp_lte: ${params.endTime}`);
  }

  if (whereConditions.length > 0) {
    args.push(`where: { ${whereConditions.join(", ")} }`);
  }

  if (params.first !== undefined) {
    args.push(`limit: ${params.first}`);
  }

  args.push('orderBy: "hourTimestamp"', 'orderDirection: "desc"');

  const query = `
    query {
      hourlyStatss(${args.join(", ")}) {
        items {
          hourTimestamp
          totalTicketsValue
          uniquePlayers
          roundsCompleted
          totalTicketsSold
          totalLpFeesGenerated
          totalReferralFeesGenerated
          totalProtocolFeesGenerated
        }
        totalCount
      }
    }
  `;

  logger.debug({ query, params }, "Executing getHourlyStats");
  const result = await client.query<{ hourlyStatss: GraphQLListResponse<HourlyStat> }>(query);

  const stats = (result.hourlyStatss?.items ?? []).map((stat) => ({
    ...stat,
    timestamp: stat.hourTimestamp,
    totalVolume: stat.totalTicketsValue,
    uniqueUsers: stat.uniquePlayers,
    totalRounds: stat.roundsCompleted,
    activeUsers: stat.uniquePlayers,
  }));

  return { hourlyStats: stats };
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

  subscribeToRound: (_client: MegapotGraphQLClient, params: SubscriptionParams): Promise<never> => {
    return Promise.reject(
      new MCPError(1003, "Subscription functionality not yet implemented", { params })
    );
  },
  unsubscribeFromRound: (
    _client: MegapotGraphQLClient,
    params: SubscriptionParams
  ): Promise<never> => {
    return Promise.reject(
      new MCPError(1003, "Subscription functionality not yet implemented", { params })
    );
  },
};

type ToolResult =
  | UsersResponse
  | RoundsResponse
  | TicketsResponse
  | LpsResponse
  | ProtocolStatsResponse
  | UserStatsResponse
  | LpStatsResponse
  | LeaderboardResponse;

export async function executeTool(
  client: MegapotGraphQLClient,
  toolName: string,
  validatedParams:
    | QueryUsersParams
    | QueryRoundsParams
    | QueryTicketsParams
    | QueryLiquidityProvidersParams
    | GetUserStatsParams
    | GetLpStatsParams
    | GetLeaderboardParams
    | GetHourlyStatsParams
    | SubscriptionParams
): Promise<ToolResult> {
  logger.info("=== executeTool START ===");
  logger.info({ toolName, validatedParams }, "Tool execution request");

  const executor = toolExecutors[toolName as keyof typeof toolExecutors];

  if (executor === undefined) {
    logger.error(
      { toolName, availableTools: Object.keys(toolExecutors) },
      "Unknown tool requested"
    );
    throw new MCPError(1002, `Unknown tool: ${toolName}`, { toolName });
  }

  try {
    logger.info({ toolName }, "Found executor for tool, calling it now");

    let result: ToolResult;
    if (toolName === "getCurrentRound") {
      result = await executeGetCurrentRound(client);
    } else if (toolName === "getProtocolStats") {
      result = await executeGetProtocolStats(client);
    } else {
      result = await (
        executor as (
          client: MegapotGraphQLClient,
          params: typeof validatedParams
        ) => Promise<ToolResult>
      )(client, validatedParams);
    }

    logger.info({ toolName, resultKeys: Object.keys(result) }, "Tool execution completed");
    logger.info("=== executeTool SUCCESS ===");

    return result;
  } catch (error) {
    logger.error(
      {
        toolName,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      },
      "Tool execution failed"
    );
    logger.info("=== executeTool ERROR ===");
    throw error;
  }
}
