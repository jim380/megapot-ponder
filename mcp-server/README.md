# Megapot MCP Server

A MCP server for the megapot-ponder indexer.

## Setup

1. **Copy environment variables:**

   ```bash
   cp .env.example .env
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment:**

   Edit `.env` file with your settings:
   - `GRAPHQL_ENDPOINT` - Ponder GraphQL endpoint (e.g., `http://localhost:42069/graphql`)
   - `MEGAPOT_MCP_TRANSPORT` - Transport type (`stdio` or `http`, default: `stdio`)
   - `MEGAPOT_MCP_PORT` - HTTP server port (default: `3001`)
   - `MEGAPOT_MCP_HOST` - HTTP server host (default: `0.0.0.0`)
   - `LOG_LEVEL` - Logging level (default: `info`)

4. **Build the project:**
   ```bash
   npm run build
   ```

## Architecture

### Core Components

1. **MegapotMCPServer** (`src/server.ts`)
   - Extends the base MCP SDK Server class
   - Handles all MCP protocol requests
   - Manages server lifecycle and graceful shutdown

2. **TransportFactory** (`src/server.ts`)
   - Creates appropriate transport based on configuration
   - Supports stdio for local CLI usage
   - Supports HTTP+SSE for remote access

3. **GraphQL Client Layer**
   - Connection pooling with automatic retry
   - WebSocket subscriptions with disconnection buffering
   - Query complexity analysis (5000 cost unit ceiling)

4. **Validation Layer**
   - JSON Schema definitions for all tools
   - AJV-based parameter validation
   - Custom format validators (Ethereum addresses, BigInt strings)

## Usage

### Stdio Mode (Default)

For local CLI integration:

```bash
# Run directly
npm run dev

# Or build and run
npm run build
npm start
```

### HTTP+SSE Mode

For remote access or web-based clients:

```bash
# Using environment variable
MEGAPOT_MCP_TRANSPORT=http npm run dev

# Using command line argument
npm run dev -- --http

# Configure port and host
MEGAPOT_MCP_PORT=8080 MEGAPOT_MCP_HOST=127.0.0.1 npm run dev -- --http
```

### HTTP Endpoints

When running in HTTP mode:

- `GET /health`: Health check endpoint with session statistics
- `GET /metrics`: Detailed metrics (when `ENABLE_METRICS=true`)
- `GET /sse`: Server-Sent Events endpoint for MCP communication
- `OPTIONS /*`: CORS preflight support

## Testing

### Test with MCP Inspector (Recommended)

Run this command to open the MCP inspector in your browser:

```bash
npx @modelcontextprotocol/inspector dist/server.js
```

This will open a web interface where you can:

1. See all available tools
2. Test tool calls interactively
3. View resources
4. See real-time responses

### Manual Testing

#### 1. Verify your indexer is accessible:

```bash
curl http://localhost:42069/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

#### 2. Test health endpoint (HTTP mode):

```bash
npm run dev -- --http
# In another terminal:
curl http://localhost:3001/health | jq .
```

### Test with Claude Desktop

1. Add to your Claude Desktop config file:
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "megapot": {
      "command": "node",
      "args": ["/path/to/megapot-ponder/mcp-server/dist/server.js"],
      "env": {
        "GRAPHQL_ENDPOINT": "http://localhost:42069/graphql"
      }
    }
  }
}
```

2. Restart Claude Desktop

**Note**: Make sure to replace `/path/to/megapot-ponder/mcp-server/dist/server.js` with the actual absolute path to your server.js file.

Example for macOS: `/Users/yourname/Documents/megapot-ponder/mcp-server/dist/server.js`

## Available Tools

Once connected via MCP, you can test these tools:

### Query Tools

- **`queryUsers`** - Query user data with filtering, pagination, and sorting

  ```json
  {
    "name": "queryUsers",
    "arguments": {
      "first": 10,
      "orderBy": "totalWinnings",
      "orderDirection": "desc",
      "where": {
        "isActive": true,
        "totalWinnings_gt": "1000000000000000000"
      }
    }
  }
  ```

- **`queryRounds`** - Query jackpot rounds

  ```json
  {
    "name": "queryRounds",
    "arguments": {
      "first": 5,
      "orderBy": "startTime",
      "orderDirection": "desc",
      "where": {
        "status": "RESOLVED"
      }
    }
  }
  ```

- **`queryTickets`** - Query ticket purchases
- **`queryLPs`** - Query liquidity providers

### Simple Tools

- **`getCurrentRound`** - Get current active round (no parameters)
- **`getProtocolStats`** - Get protocol statistics (no parameters)

### User/LP Specific Tools

- **`getUserStats`** - Get stats for a specific user

  ```json
  {
    "name": "getUserStats",
    "arguments": {
      "address": "0x1234567890123456789012345678901234567890"
    }
  }
  ```

- **`getLpStats`** - Get LP statistics

### Analytics Tools

- **`getLeaderboard`** - Get top users/LPs

  ```json
  {
    "name": "getLeaderboard",
    "arguments": {
      "type": "users",
      "first": 10
    }
  }
  ```

- **`getHourlyStats`** - Get hourly statistics

## Resources

Resources available for direct access:

- `megapot://user/{id}` - User profile data
- `megapot://round/{id}` - Jackpot round information
- `megapot://lp/{id}` - Liquidity provider data
- `megapot://ticket/{id}` - Ticket information
- `megapot://stats/hourly/{timestamp}` - Hourly statistics

## Development

### Running in Development

```bash
# Watch mode with auto-reload
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Generate GraphQL types
npm run codegen
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Clean build artifacts
npm run clean
```

### Scripts

- `npm run dev` - Run in development mode with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run typecheck` - Type check without building
- `npm run codegen` - Generate GraphQL types
- `npm run clean` - Clean build artifacts

## Integration Examples

### With Custom Client

```typescript
// Example client connection
const client = new Client({
  name: "my-client",
  version: "1.0.0",
});

// For stdio
const transport = new StdioClientTransport({
  command: "node",
  args: ["path/to/dist/server.js"],
});

// For HTTP+SSE
const transport = new SSEClientTransport("http://localhost:3001/sse");

await client.connect(transport);
```

## Troubleshooting

### Connection Errors

1. If you see connection errors, verify your indexer is running:

   ```bash
   curl http://localhost:42069/graphql \
     -H "Content-Type: application/json" \
     -d '{"query": "{ __typename }"}'
   ```

2. Check server logs - they show detailed information about each request

3. For development, you can enable debug logging:
   ```bash
   LOG_LEVEL=debug npm run dev
   ```

### Common Issues

- **Port already in use**: Change the port using `MEGAPOT_MCP_PORT` environment variable
- **GraphQL connection failed**: Ensure your indexer is running and the endpoint is correct in `.env`
- **Rate limit exceeded**: The server limits to 10 requests per second per session

## Error Handling

The server includes comprehensive error handling:

- Protocol-level errors are properly formatted and returned
- Transport errors trigger reconnection attempts
- WebSocket disconnections are buffered for 30 seconds
- Uncaught exceptions and promise rejections are logged before shutdown
- Graceful shutdown on SIGINT/SIGTERM signals

## Security Considerations

- CORS headers configured for browser clients
- Input validation via JSON schemas
- Rate limiting per session (10 req/s)
- Sensitive data redaction in logs
- No authentication implemented yet (add as needed)

## License

MIT
