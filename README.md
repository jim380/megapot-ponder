# Megapot Ponder Indexer

A light weight indexer for Megapot's smart contracts built with [Ponder](https://ponder.sh/), providing real-time and historical data through a GraphQL API.

## Overview

This indexer tracks all lottery activities on the Megapot platform including:

- Ticket purchases and lottery rounds
- Liquidity provider operations
- Jackpot distributions
- Fee management
- User statistics and referral tracking

## Prerequisites

- Node.js 18.14 or higher
- pnpm (recommended) or npm
- RPC API key
- Docker and Docker Compose (optional)
- PostgreSQL (optional)

## Getting Started

### Option 1: Local Development

1. Clone the repository:

```bash
git clone <repository-url>
cd megapot-ponder
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your Alchemy API key:

```
PONDER_RPC_URL_8453=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

> **Note:** For local development, the indexer will automatically use SQLite (pglite) as the database. If you want to use PostgreSQL instead, set the `DATABASE_URL` environment variable in your `.env.local` file.

5. Start the development server:

```bash
pnpm dev
```

The indexer will create a local SQLite database in `./.ponder/pglite/` for development use.

### Option 2: Docker Setup (Recommended for Production)

1. Clone the repository and navigate to it:

```bash
git clone <repository-url>
cd megapot-ponder
```

2. Copy and configure environment:

```bash
cp .env.example .env
```

3. Start with Docker Compose:

```bash
npm run docker:start

# Or manually with docker compose
docker compose --env-file .env.local up -d

# Development mode (with hot reloading)
PONDER_COMMAND="pnpm dev" NODE_ENV=development docker compose --env-file .env.local up -d
```

The GraphQL playground will be available at http://localhost:42069

### Database Configuration

The indexer uses an explicit `PONDER_DB_KIND` environment variable to select the database:

#### SQLite/pglite

```bash
# Option 1: Leave PONDER_DB_KIND unset (defaults to pglite)
# Option 2: Explicitly set it
PONDER_DB_KIND=pglite

# Optionally customize the data directory
PGLITE_DIRECTORY=./.ponder/custom-db
```

#### PostgreSQL

```bash
PONDER_DB_KIND=postgres
DATABASE_URL=postgres://user:password@localhost:5432/dbname
```

**Note**: If `PONDER_DB_KIND=postgres` but `DATABASE_URL` is not set, the app will fail with a clear error message.

## Project Structure

```
megapot-ponder/
├── abis/              # Contract ABIs
├── src/
│   ├── api/           # Custom GraphQL resolvers
│   ├── handlers/      # Event handlers
│   │   ├── tickets.ts # Ticket purchase and withdrawal handlers
│   │   ├── lp.ts      # Liquidity provider handlers
│   │   └── base.ts    # Shared handler utilities
│   └── utils/         # Utility functions
│       ├── calculations.ts # Fee calculations
│       └── constants.ts    # Contract addresses and constants
├── test/              # Test utilities and mocks
├── scripts/           # Utility scripts (backup, etc.)
├── docker compose.yml # Docker Compose configuration
├── Dockerfile         # Docker image definition
├── .dockerignore      # Docker build exclusions
├── ponder.config.ts   # Ponder configuration
├── ponder.schema.ts   # Database schema
└── schema.graphql     # GraphQL API schema
```

## Database Schema

The indexer tracks the following entities:

- `users` - User accounts and statistics
- `liquidityProviders` - LP positions and balances
- `jackpotRounds` - Lottery rounds
- `tickets` - Individual ticket purchases
- `lpActions` - LP deposit/withdrawal/rebalance history
- `lpRoundSnapshots` - LP state snapshots per round
- `withdrawals` - All withdrawal types (winnings, referral fees, protocol fees)
- `feeDistributions` - Fee distribution records
- `referrals` - Referral relationships and earnings
- `hourlyStats` - Hourly aggregated statistics

## GraphQL API

The indexer provides a GraphQL API at `http://localhost:42069` with auto-generated queries based on the database schema.

### Example Queries

#### 1. Get Users List

```graphql
{
  userss(limit: 10) {
    items {
      id
      totalTicketsPurchased
      totalWinnings
      totalReferralFees
      winningsClaimable
      referralFeesClaimable
      isActive
      isLP
    }
  }
}
```

#### 2. Get Specific User

```graphql
{
  users(id: "0xYourAddressHere") {
    id
    totalTicketsPurchased
    totalWinnings
    winningsClaimable
    referralFeesClaimable
    isLP
    createdAt
    updatedAt
  }
}
```

#### 3. Get Liquidity Providers

```graphql
{
  liquidityProviderss(limit: 20, orderBy: "stake", orderDirection: "desc") {
    items {
      id
      principal
      stake
      riskPercentage
      isActive
      totalFeesEarned
      totalDeposited
      lastActionAt
    }
  }
}
```

#### 4. Get Recent Tickets

```graphql
{
  ticketss(limit: 10, orderBy: "timestamp", orderDirection: "desc") {
    items {
      id
      roundId
      buyerAddress
      recipientAddress
      referrerAddress
      ticketsPurchasedBps
      purchasePrice
      timestamp
      blockNumber
    }
  }
}
```

#### 5. Get Jackpot Rounds

```graphql
{
  jackpotRoundss(limit: 5) {
    items {
      id
      status
      totalTicketsValue
      jackpotAmount
      ticketCountTotalBps
      winnerAddress
      startTime
      endTime
      lpFeesGenerated
      referralFeesGenerated
      protocolFeesGenerated
    }
  }
}
```

#### 6. Get LP Actions History

```graphql
{
  lpActionss(limit: 20, orderBy: "timestamp", orderDirection: "desc") {
    items {
      id
      lpAddress
      actionType
      amount
      riskPercentage
      timestamp
      transactionHash
    }
  }
}
```

#### 7. Get Withdrawals

```graphql
{
  withdrawalss(limit: 10, orderBy: "timestamp", orderDirection: "desc") {
    items {
      id
      userAddress
      amount
      withdrawalType
      transactionHash
      timestamp
    }
  }
}
```

#### 8. Check Indexing Status

```graphql
{
  _meta {
    status
  }
}
```

### Query Parameters

All list queries support the following parameters:

- `limit`: Number of items to return (pagination)
- `orderBy`: Field name to sort by
- `orderDirection`: Sort direction (`"asc"` or `"desc"`)
- `where`: Filter conditions (varies by entity type)
- `before`/`after`: Cursor-based pagination

### Filter Examples

#### Filter Active Liquidity Providers

```graphql
{
  liquidityProviderss(where: { isActive: true }, limit: 10) {
    items {
      id
      principal
      stake
    }
  }
}
```

#### Filter Tickets by Round

```graphql
{
  ticketss(where: { roundId: "1" }, limit: 50) {
    items {
      id
      buyerAddress
      ticketsPurchasedBps
    }
  }
}
```

## License

MIT
