# Megapot Ponder Indexer

A blockchain indexer for Megapot's smart contracts built with [Ponder](https://ponder.sh/), providing real-time and historical data through a GraphQL API.

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
- An Alchemy API key for Base network

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd megapot-ponder
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Alchemy API key:
```
PONDER_RPC_URL_8453=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

## Development

### Running the Indexer

Start the development server with hot reloading:
```bash
pnpm dev
# or
npm run dev
```

The GraphQL playground will be available at http://localhost:42069/graphql

### Building

#### TypeScript Type Checking

Run TypeScript compiler to check for type errors:
```bash
pnpm typecheck
# or
npm run typecheck
```

#### Code Generation

Generate TypeScript types from your schema:
```bash
pnpm codegen
# or
npm run codegen
```

### Linting

Run ESLint to check code quality:
```bash
pnpm lint
# or
npm run lint
```

### Testing

#### Run All Tests
```bash
pnpm test
# or
npm test
```

#### Run Tests in Watch Mode
```bash
pnpm test:watch
# or
npm run test:watch
```

#### Run Tests Once
```bash
pnpm test:run
# or
npm run test:run
```

#### Run Unit Tests Only
```bash
pnpm test:unit
# or
npm run test:unit
```

#### Run Tests with Coverage
```bash
pnpm test:coverage
# or
npm run test:coverage
```

#### View Test UI
```bash
pnpm test:ui
# or
npm run test:ui
```

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
├── ponder.config.ts   # Ponder configuration
├── ponder.schema.ts   # Database schema
└── schema.graphql     # GraphQL API schema
```

## Database Schema

The indexer tracks the following entities:
- `User` - User accounts and statistics
- `Round` - Lottery rounds
- `TicketPurchase` - Individual ticket purchases
- `LiquidityProvider` - LP positions and balances
- `LpAction` - LP deposit/withdrawal history
- `WinWithdrawal` - Winner prize claims
- `ReferralFeeWithdrawal` - Referral fee claims
- `ProtocolFeeWithdrawal` - Protocol fee withdrawals
- `LpSnapshot` - LP state snapshots per round
- `HourlyAggregation` - Hourly statistics

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm start` - Start production server
- `pnpm db` - Database management commands
- `pnpm codegen` - Generate TypeScript types
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests in watch mode
- `pnpm test:run` - Run tests once
- `pnpm test:unit` - Run unit tests only
- `pnpm test:coverage` - Run tests with coverage report
- `pnpm test:ui` - Open Vitest UI

## Production Deployment

For production deployment, see the deployment guide in `.ai/CURRENT-PLAN.md`.

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and ensure they pass
4. Run linting and fix any issues
5. Submit a pull request

## License

[License Type]