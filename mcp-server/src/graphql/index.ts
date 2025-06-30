export {
  MegapotGraphQLClient,
  getGraphQLClient,
  resetGraphQLClient,
  type GraphQLClientConfig,
  type SubscriptionHandler,
  type SubscriptionOptions,
  type QueryOptions,
  type SubscriptionRef,
} from "./client.js";

export { queries } from "./queries.js";

export { subscriptions, SUBSCRIPTION_DEBOUNCE_MS } from "./subscriptions.js";

export {
  calculateQueryComplexity,
  validateQueryComplexity,
  createComplexityError,
  type ComplexityResult,
  type ComplexityConfig,
} from "./complexity.js";

export {
  DisconnectionBuffer,
  type BufferedUpdate,
  type DisconnectionBufferConfig,
} from "./disconnection-buffer.js";

export {
  USER_FIELDS,
  LP_FIELDS,
  ROUND_FIELDS,
  TICKET_FIELDS,
  LP_ACTION_FIELDS,
  LP_SNAPSHOT_FIELDS,
  FEE_DISTRIBUTION_FIELDS,
  WITHDRAWAL_FIELDS,
  HOURLY_STATS_FIELDS,
} from "./queries.js";

export async function queryUser(address: string): Promise<unknown> {
  const { getGraphQLClient } = await import("./client.js");
  const { queries } = await import("./queries.js");
  const client = getGraphQLClient();
  return client.query(queries.GET_USER, {
    variables: { id: address },
  });
}

export async function queryCurrentRound(): Promise<unknown> {
  const { getGraphQLClient } = await import("./client.js");
  const { queries } = await import("./queries.js");
  const client = getGraphQLClient();
  return client.query(queries.GET_CURRENT_ROUND);
}

export async function queryProtocolStats(): Promise<unknown> {
  const { getGraphQLClient } = await import("./client.js");
  const { queries } = await import("./queries.js");
  const client = getGraphQLClient();
  return client.query(queries.GET_PROTOCOL_STATS);
}

export async function subscribeToRoundUpdates(handler: (data: unknown) => void): Promise<import("./client.js").SubscriptionRef> {
  const { getGraphQLClient } = await import("./client.js");
  const { subscriptions } = await import("./subscriptions.js");
  const client = getGraphQLClient();
  return client.subscribe(subscriptions.CURRENT_ROUND_UPDATES, handler);
}
