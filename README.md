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
- `ticketRanges` - Ticket number ranges for each purchase
- `ticketIntegrityChecks` - Ticket numbering integrity validations
- `ticketFailures` - Failed ticket assignments for recovery

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

## Ticket Numbering API

The indexer provides REST API endpoints for querying ticket numbers and ownership. In Megapot, tickets are represented as basis points (BPS) where **10,000 BPS = 1 full ticket**, allowing for fractional ticket purchases (e.g., 7,000 BPS = 0.7 tickets).

### Base URL

```
http://localhost:42069/api
```

### Endpoints

#### 1. Get User's Tickets

```http
GET /api/tickets/user/:userAddress?roundId=:roundId
```

Returns all tickets owned by a specific user.

**Parameters:**

- `userAddress` (required): The user's wallet address
- `roundId` (optional): Filter by specific round

**Example Request:**

```bash
curl "http://localhost:42069/api/tickets/user/0x6735Bd97D6002D9b2989c653304216c3b810A02B?roundId=20165"
```

**Example Response:**

```json
{
  "success": true,
  "userAddress": "0x6735bd97d6002d9b2989c653304216c3b810a02b",
  "roundId": "20165",
  "totalBps": "350000",
  "totalTickets": "35.0000",
  "ticketCount": 1,
  "ranges": [
    {
      "roundId": "20165",
      "bpsAmount": "350000",
      "ticketCount": "35.0000",
      "purchaseTime": 1742330293,
      "transactionHash": "0x0b298d4eba0281bbb7a76c58ce59fb07e6d77b1e9d5a806f74ed4346861a1294",
      "blockNumber": "27770473"
    }
  ]
}
```

#### 2. Get All Ticket Holders for a Round

```http
GET /api/tickets/round/:roundId/holders
```

Returns all ticket holders for a specific round with their ticket counts and ownership percentages.

**Example Request:**

```bash
curl http://localhost:42069/api/tickets/round/20165/holders
```

**Example Response:**

```json
{
  "success": true,
  "roundId": "20165",
  "totalTickets": "176.4000",
  "totalBps": "1764000",
  "uniqueHolders": 114,
  "holders": [
    {
      "userAddress": "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
      "ticketCount": "35.0000",
      "startTicket": "57",
      "endTicket": "92",
      "percentage": "19.84",
      "bpsAmount": "350000"
    }
  ]
}
```

#### 3. Calculate Ticket Numbers for a Round

```http
GET /api/tickets/round/:roundId/numbers
```

Shows all ticket purchases with calculated cumulative positions and ticket number ranges.

**Example Request:**

```bash
curl http://localhost:42069/api/tickets/round/20165/numbers
```

**Example Response:**

```json
{
  "success": true,
  "roundId": "20165",
  "totalBps": "1764000",
  "totalTickets": "176.4000",
  "uniqueHolders": 114,
  "ranges": [
    {
      "id": "0xda88339b8ccbcaa41c8b7ee9c61b89dd3d331e8357721b507b34f4f0d6c056da-432",
      "userAddress": "0xf74546F7b7225F36b8D03B4A8659BaDF6e110086",
      "startBps": "0",
      "endBps": "7000",
      "startTicket": "1",
      "endTicket": "1",
      "ticketsBps": "7000",
      "ticketsDecimal": "0.7000",
      "timestamp": 1742279761,
      "transactionHash": "0xda88339b8ccbcaa41c8b7ee9c61b89dd3d331e8357721b507b34f4f0d6c056da"
    }
  ]
}
```

#### 4. Find Winner by BPS Position

```http
GET /api/tickets/round/:roundId/winner/:bps
```

Finds the winner for a specific BPS position (as used by the smart contract for winner selection).

**Example Request:**

```bash
curl http://localhost:42069/api/tickets/round/20165/winner/175000
```

**Example Response:**

```json
{
  "success": true,
  "winner": "0xE765185a42D623a99864C790a88cd29825d8A4b9",
  "winningBps": "175000",
  "winningTicket": "18",
  "rangeInfo": {
    "startBps": "168000",
    "endBps": "182000",
    "startTicket": "17",
    "endTicket": "19",
    "ticketsBps": "14000",
    "ticketsDecimal": "1.4000"
  },
  "transactionHash": "0x9a553e487f71114fdd2f7d36c25007ae152f7d6af6c514d77976f1dd020f2aa0"
}
```

#### 5. Find Ticket Owner

```http
GET /api/tickets/owner/:roundId/:ticketNumber
```

Find who owns a specific ticket number in a round.

**Example Request:**

```bash
curl http://localhost:42069/api/tickets/owner/20165/42
```

**Example Response:**

```json
{
  "success": true,
  "ticketNumber": "42",
  "roundId": "20165",
  "owner": "0x...",
  "purchaseTime": 1742330293,
  "transactionHash": "0x...",
  "rangeInfo": {
    "startTicket": "40",
    "endTicket": "45",
    "totalTicketsInRange": "0.6000",
    "bpsInRange": "6000"
  }
}
```

### Ticket Numbering System

- **BPS to Tickets**: 10,000 BPS = 1 ticket
- **Fractional Tickets**: Users can own fractions of tickets (e.g., 7,000 BPS = 0.7 tickets)
- **Sequential Numbering**: Tickets are numbered sequentially based on purchase order
- **Winner Selection**: The smart contract selects winners based on BPS position, not ticket number

## License

MIT
