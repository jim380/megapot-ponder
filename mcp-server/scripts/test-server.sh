#!/bin/bash

echo "Testing Megapot MCP Server..."

echo -e "\n1. Testing stdio mode..."
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}},"id":1}' | npx tsx src/index.ts | head -n 5

echo -e "\n2. Testing HTTP mode..."
MEGAPOT_MCP_TRANSPORT=http npx tsx src/index.ts &
SERVER_PID=$!

sleep 2

echo "Testing health endpoint..."
curl -s http://localhost:3001/health

kill $SERVER_PID 2>/dev/null

echo -e "\n\nTests completed!"