# Megapot MCP

A MCP server for the megapot-ponder indexer.

## Setup

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment:
   - `GRAPHQL_ENDPOINT` - Ponder GraphQL endpoint
   - `WS_ENDPOINT` - WebSocket endpoint for subscriptions
   - `MCP_BEARER_TOKEN` - Authentication token for HTTP transport

## Development

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run codegen
```

## Architecture

- **Transport**: Supports both stdio (default) and HTTP+SSE
- **Rate Limiting**: 10 requests/second per session
- **Caching**: 5-second TTL for query results
- **Type Safety**: Strict TypeScript with generated GraphQL types

## License

MIT
