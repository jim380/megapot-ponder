import { getGraphQLClient, queries, subscriptions } from "../graphql/index.js";
import { getLogger } from "../logging/index.js";

const logger = getLogger("graphql-examples");

async function exampleQueryUser(userAddress: string) {
  try {
    const client = getGraphQLClient();

    const user = await client.query(queries.GET_USER, {
      variables: { id: userAddress },
    });

    logger.info({ user }, "User data retrieved");

    const userWithRelations = await client.query(queries.GET_USER_WITH_RELATIONS, {
      variables: {
        id: userAddress,
        ticketLimit: 5,
      },
    });

    logger.info({ userWithRelations }, "User with relations retrieved");

    return user;
  } catch (error) {
    logger.error({ error, userAddress }, "Failed to query user");
    throw error;
  }
}

async function exampleQueryCurrentRound() {
  try {
    const client = getGraphQLClient();

    const currentRound = await client.query(queries.GET_CURRENT_ROUND);
    logger.info({ currentRound }, "Current round data retrieved");

    if (currentRound.currentRound?.id) {
      const roundDetails = await client.query(queries.GET_ROUND_WITH_RELATIONS, {
        variables: { id: currentRound.currentRound.id },
      });

      logger.info({ roundDetails }, "Round details retrieved");
    }

    return currentRound;
  } catch (error) {
    logger.error({ error }, "Failed to query current round");
    throw error;
  }
}

async function exampleQueryStats() {
  try {
    const client = getGraphQLClient();

    const protocolStats = await client.query(queries.GET_PROTOCOL_STATS);
    logger.info({ protocolStats }, "Protocol stats retrieved");

    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - 24 * 60 * 60;

    const hourlyStats = await client.query(queries.GET_HOURLY_STATS, {
      variables: {
        startTime,
        endTime,
        limit: 24,
      },
    });

    logger.info({ hourlyStats }, "Hourly stats retrieved");

    return { protocolStats, hourlyStats };
  } catch (error) {
    logger.error({ error }, "Failed to query stats");
    throw error;
  }
}

async function exampleSubscribeToRoundUpdates() {
  try {
    const client = getGraphQLClient();

    const subscription = await client.subscribe(
      subscriptions.CURRENT_ROUND_UPDATES,
      (data) => {
        logger.info({ data }, "Round update received");

        if (data.currentRoundUpdated) {
          const round = data.currentRoundUpdated;
          logger.info(
            {
              roundId: round.id,
              status: round.status,
              jackpotAmount: round.jackpotAmount,
              totalTicketsValue: round.totalTicketsValue,
            },
            "Round status changed"
          );
        }
      },
      {
        onError: (error) => {
          logger.error({ error }, "Round subscription error");
        },
        onComplete: () => {
          logger.info("Round subscription completed");
        },
      }
    );

    logger.info({ subscriptionId: subscription.id }, "Round subscription created");

    return subscription.unsubscribe;
  } catch (error) {
    logger.error({ error }, "Failed to subscribe to round updates");
    throw error;
  }
}

async function exampleSubscribeToUserBalance(userAddress: string) {
  try {
    const client = getGraphQLClient();

    const subscription = await client.subscribe(
      subscriptions.USER_BALANCE_UPDATES,
      (data) => {
        logger.info({ data }, "User balance update received");

        if (data.userBalanceUpdated) {
          const update = data.userBalanceUpdated;
          logger.info(
            {
              userId: update.id,
              winningsClaimable: update.winningsClaimable,
              referralFeesClaimable: update.referralFeesClaimable,
              changeType: update.changeType,
              changeAmount: update.changeAmount,
              reason: update.reason,
            },
            "User balance changed"
          );
        }
      },
      {
        variables: { userId: userAddress },
        debounceMs: 100,
        onError: (error) => {
          logger.error({ error, userAddress }, "User balance subscription error");
        },
      }
    );

    logger.info(
      {
        subscriptionId: subscription.id,
        userAddress,
      },
      "User balance subscription created"
    );

    return subscription.unsubscribe;
  } catch (error) {
    logger.error({ error, userAddress }, "Failed to subscribe to user balance");
    throw error;
  }
}

async function exampleDashboardQuery(userAddress: string, lpAddress: string) {
  try {
    const client = getGraphQLClient();

    const complexity = client.getComplexity(queries.GET_DASHBOARD_DATA);
    logger.info({ complexity }, "Dashboard query complexity");

    const dashboard = await client.query(queries.GET_DASHBOARD_DATA, {
      variables: {
        userAddress,
        lpAddress,
      },
    });

    logger.info({ dashboard }, "Dashboard data retrieved");

    return dashboard;
  } catch (error) {
    logger.error({ error, userAddress, lpAddress }, "Failed to query dashboard");
    throw error;
  }
}

async function exampleErrorHandling() {
  try {
    const client = getGraphQLClient();

    const result = await client.query(queries.GET_PROTOCOL_STATS, {
      headers: {
        "x-test-error": "true",
      },
    });

    logger.info({ result }, "Query succeeded despite potential errors");
    return result;
  } catch (error) {
    logger.error({ error }, "Query failed after retries");

    const errorMessage = (error as Error).message || "";
    if (errorMessage.includes("complexity")) {
      logger.warn("Query too complex, consider simplifying");
    } else if (errorMessage.includes("timeout")) {
      logger.warn("Query timed out, server might be slow");
    } else if (errorMessage.includes("400")) {
      logger.warn("Bad request, check query syntax");
    } else {
      logger.warn("Unknown error, might be network or server issue");
    }

    throw error;
  }
}

export async function runGraphQLExamples() {
  const userAddress = "0x1234567890abcdef1234567890abcdef12345678";
  const lpAddress = "0xabcdef1234567890abcdef1234567890abcdef12";

  logger.info("Running GraphQL client examples...");

  try {
    await exampleQueryUser(userAddress);
    await exampleQueryCurrentRound();
    await exampleQueryStats();
    await exampleDashboardQuery(userAddress, lpAddress);

    const unsubscribeRound = await exampleSubscribeToRoundUpdates();
    const unsubscribeUser = await exampleSubscribeToUserBalance(userAddress);

    setTimeout(() => {
      logger.info("Cleaning up subscriptions");
      unsubscribeRound();
      unsubscribeUser();
    }, 10000);

    await exampleErrorHandling();

    logger.info("GraphQL examples completed");
  } catch (error) {
    logger.error({ error }, "GraphQL examples failed");
    throw error;
  }
}

export {
  exampleQueryUser,
  exampleQueryCurrentRound,
  exampleQueryStats,
  exampleSubscribeToRoundUpdates,
  exampleSubscribeToUserBalance,
  exampleDashboardQuery,
  exampleErrorHandling,
};
