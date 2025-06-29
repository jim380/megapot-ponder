# GraphQL Client Layer

This module provides a comprehensive GraphQL client layer for connecting the MCP server to Ponder's GraphQL endpoint. It includes query execution, WebSocket subscriptions, connection pooling, retry logic, and query complexity analysis.

## Features

- **Robust Query Execution**: Connection pooling with health checks and automatic retry with exponential backoff
- **Real-time Subscriptions**: WebSocket-based subscriptions with debouncing for optimal performance
- **Query Complexity Analysis**: Prevents expensive queries with configurable complexity limits (5000 cost units ceiling)
- **Type Safety**: Full TypeScript support with generated types and fragments
- **Request Correlation**: Integration with logging and session systems for request tracking
- **Connection Management**: Automatic reconnection and resource cleanup

## Architecture

```
src/graphql/
├── client.ts          # Main GraphQL client with pooling and retry logic
├── queries.ts         # GraphQL query definitions with fragments
├── subscriptions.ts   # Subscription definitions with debouncing config
├── complexity.ts      # Query complexity analysis engine
├── schema.graphql     # Ponder schema copy for reference
├── index.ts          # Module exports and convenience functions
└── __tests__/        # Unit tests
    ├── client.test.ts
    └── complexity.test.ts
```

## Configuration

The GraphQL client is configured through environment variables:

```bash
GRAPHQL_ENDPOINT=http://localhost:42069/graphql
GRAPHQL_WS_ENDPOINT=ws://localhost:42069/graphql

MAX_QUERY_COMPLEXITY=5000
GRAPHQL_TIMEOUT_MS=30000
GRAPHQL_POOL_SIZE=5

MAX_QUERY_DEPTH=10
```

## Usage

### Basic Queries

```typescript
import { getGraphQLClient, queries } from "../graphql/index.js";

const client = getGraphQLClient();

// Query a user
const user = await client.query(queries.GET_USER, {
  variables: { id: "0x123..." },
});

// Query current round
const currentRound = await client.query(queries.GET_CURRENT_ROUND);

// Query with session context
const stats = await client.query(queries.GET_PROTOCOL_STATS, {
  sessionId: "session-123",
  headers: { "x-custom-header": "value" },
});
```

### Subscriptions

```typescript
import { subscriptions } from "../graphql/index.js";

// Subscribe to round updates
const subscription = await client.subscribe(
  subscriptions.CURRENT_ROUND_UPDATES,
  (data) => {
    console.log("Round updated:", data.currentRoundUpdated);
  },
  {
    debounceMs: 500, // Custom debounce
    onError: (error) => console.error("Subscription error:", error),
    onComplete: () => console.log("Subscription completed"),
  }
);

// Unsubscribe when done
subscription.unsubscribe();
```

### Query Complexity Analysis

```typescript
import { calculateQueryComplexity, validateQueryComplexity } from "../graphql/index.js";
import { parse } from "graphql";

const query = parse(`
  query {
    users(first: 100) {
      id
      tickets {
        id
        round {
          id
        }
      }
    }
  }
`);

// Calculate complexity
const complexity = calculateQueryComplexity(query);
console.log("Complexity score:", complexity.score);
console.log("Details:", complexity.details);

// Validate against limit
const validation = validateQueryComplexity(query, 1000);
if (!validation.valid) {
  throw new Error(validation.message);
}
```

## Query Fragments

The module provides reusable fragments for consistent field selection:

```typescript
import { USER_FIELDS, ROUND_FIELDS, TICKET_FIELDS } from "../graphql/index.js";

// Use in custom queries
const customQuery = gql`
  ${USER_FIELDS}
  query GetUserWithCustomData($id: ID!) {
    user(id: $id) {
      ...UserFields
      customField
    }
  }
`;
```

## Available Queries

### User Queries

- `GET_USER` - Single user by ID
- `GET_USER_WITH_RELATIONS` - User with tickets and withdrawals
- `LIST_USERS` - Paginated user list with filtering
- `SEARCH_ACTIVE_USERS` - Find active users by criteria
- `GET_USER_STATS` - User performance statistics
- `GET_USER_LEADERBOARD` - Top users by winnings

### Round Queries

- `GET_ROUND` - Single round by ID
- `GET_ROUND_WITH_RELATIONS` - Round with tickets and LP snapshots
- `LIST_ROUNDS` - Paginated round list
- `GET_CURRENT_ROUND` - Active round information

### Ticket Queries

- `GET_TICKET` - Single ticket by ID
- `GET_TICKET_WITH_RELATIONS` - Ticket with user and round data
- `LIST_TICKETS` - Paginated ticket list
- `GET_WINNING_TICKET` - Find winning ticket for round

### LP Queries

- `GET_LP` - Single liquidity provider
- `GET_LP_WITH_RELATIONS` - LP with actions and snapshots
- `LIST_LPS` - Paginated LP list
- `GET_LP_LEADERBOARD` - Top LPs by performance
- `GET_LP_PERFORMANCE` - LP statistics and metrics

### Statistics Queries

- `GET_PROTOCOL_STATS` - Overall protocol metrics
- `GET_HOURLY_STATS` - Time-series statistics
- `GET_DASHBOARD_DATA` - Combined dashboard information

## Available Subscriptions

### User Subscriptions

- `USER_BALANCE_UPDATES` - Balance and claimable amount changes
- `USER_NEW_TICKETS` - New ticket purchases
- `USER_WITHDRAWALS` - Withdrawal transactions
- `USER_REFERRAL_FEES` - Referral fee distributions

### Round Subscriptions

- `ROUND_STATUS_UPDATES` - Round state changes
- `CURRENT_ROUND_UPDATES` - Active round updates
- `ROUND_WINNER_SELECTED` - Winner selection events
- `NEW_ROUND_STARTED` - New round creation

### LP Subscriptions

- `LP_DEPOSITS` - LP deposit transactions
- `LP_WITHDRAWALS` - LP withdrawal transactions
- `LP_RISK_ADJUSTMENTS` - Risk percentage changes
- `LP_PERFORMANCE_UPDATES` - Round performance snapshots

### Statistics Subscriptions

- `PROTOCOL_STATS_UPDATES` - Real-time protocol metrics
- `HOURLY_STATS_UPDATES` - New hourly statistics
- `LEADERBOARD_UPDATES` - Leaderboard position changes

## Complexity Analysis

The complexity analyzer prevents expensive queries by calculating a cost score based on:

### Scoring Factors

- **Field Count**: Each field adds to complexity
- **Query Depth**: Nested selections multiply complexity
- **List Fields**: Pagination fields increase cost significantly
- **Custom Costs**: Expensive fields have predefined higher costs

### Custom Field Costs

```typescript
{
  // High-cost analytics
  'protocolStats': 100,
  'hourlyStats': 50,
  'lpLeaderboard': 50,
  'userLeaderboard': 50,

  // Relations (potential N+1 queries)
  'tickets': 20,
  'withdrawals': 15,
  'actions': 15,

  // Standard queries
  'users': 10,
  'liquidityProviders': 10,
  'jackpotRounds': 10
}
```

### Subscription Debouncing

Subscriptions are automatically debounced to prevent overwhelming clients:

```typescript
{
  // User updates - low latency needed
  userBalanceUpdates: 100,
  userNewTickets: 100,

  // Round updates - moderate latency acceptable
  roundStatusUpdates: 200,
  currentRoundUpdates: 500,

  // Stats updates - can be debounced aggressively
  protocolStatsUpdates: 1000,
  hourlyStatsUpdates: 1000,
  leaderboardUpdates: 2000
}
```

## Error Handling

The client includes comprehensive error handling:

- **Automatic Retry**: Exponential backoff for transient failures
- **Client Error Detection**: Don't retry 4xx responses
- **Connection Pooling**: Reset connections with high error rates
- **Timeout Management**: Configurable request timeouts
- **Complexity Errors**: Helpful suggestions for optimization

## Connection Management

- **Connection Pooling**: Multiple connections for parallel requests
- **Health Checks**: Regular endpoint availability verification
- **WebSocket Reconnection**: Automatic reconnection with backoff
- **Resource Cleanup**: Proper subscription and connection cleanup
- **Session Integration**: Request correlation and session tracking

## Testing

Run the GraphQL tests:

```bash
# All GraphQL tests
npm test -- --testPathPattern=graphql

# Complexity tests only
npm test -- src/graphql/__tests__/complexity.test.ts

# Client tests (requires GraphQL endpoint)
npm test -- src/graphql/__tests__/client.test.ts
```

## Performance Considerations

1. **Query Optimization**: Use fragments to avoid duplicate field selection
2. **Pagination**: Always use `first`/`last` for list queries
3. **Depth Limiting**: Avoid deeply nested queries (>5 levels)
4. **Subscription Management**: Unsubscribe when components unmount
5. **Connection Pooling**: Configured for optimal concurrent usage

## Examples

See `src/examples/graphql-usage.example.ts` for comprehensive usage examples including:

- Query execution patterns
- Subscription management
- Error handling strategies
- Dashboard data fetching
- Real-time updates

## Integration

The GraphQL client integrates with:

- **Logging System**: Request correlation and performance tracking
- **Session Manager**: User context and rate limiting
- **Config System**: Environment-based configuration
- **MCP Server**: Resource and tool implementations
