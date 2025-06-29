import { MegapotGraphQLClient } from "./client.js";
import { WebSocketDisconnectionError } from "../errors/index.js";

async function demonstrateDisconnectionBuffering() {
  console.log("🚀 Starting WebSocket Disconnection Buffer Demo");

  const client = new MegapotGraphQLClient({
    wsEndpoint: "ws://localhost:8080/graphql",
  });

  console.log("📡 Setting up subscription with disconnection buffer...");

  const subscription = await client.subscribe(
    `subscription CurrentRoundUpdates {
      currentRoundUpdated {
        id
        status
        jackpotAmount
        totalTicketsValue
      }
    }`,
    (data) => {
      console.log("📊 Received update:", data);
    },
    {
      onError: (error) => {
        if (error instanceof WebSocketDisconnectionError) {
          console.log(`❌ Extended outage detected:`);
          const details = error.details as {
            outageMs: number;
            subscriptionCount: number;
            bufferSize: number;
          };
          console.log(`   Duration: ${details.outageMs}ms`);
          console.log(`   Affected subscriptions: ${details.subscriptionCount}`);
          console.log(`   Buffered updates: ${details.bufferSize}`);
        } else {
          console.log("❌ Subscription error:", error.message);
        }
      },
      onComplete: () => {
        console.log("✅ Subscription completed");
      },
    }
  );

  setInterval(() => {
    const status = client.getConnectionStatus();
    console.log("🔍 Connection Status:", {
      connected: status.connected,
      subscriptions: status.subscriptionCount,
      buffering: status.bufferStats.isBuffering,
      bufferSize: status.bufferStats.totalUpdates,
      outageMs: status.bufferStats.outageMs,
    });
  }, 5000);

  setTimeout(async () => {
    console.log("🧹 Cleaning up...");
    subscription.unsubscribe();
    await client.shutdown();
    console.log("✅ Demo completed");
  }, 60000);
}

export { demonstrateDisconnectionBuffering, MegapotGraphQLClient, WebSocketDisconnectionError };

export const BUFFER_CONFIG_EXAMPLE = {
  bufferDurationMs: 30_000,

  cleanupTimeoutMs: 35_000,

  maxUpdatesPerSubscription: 100,

  maxTotalUpdates: 1000,
};

export function setupBufferMonitoring() {
  console.log("🎯 Buffer monitoring setup complete");
  console.log("   - 30s disconnection tolerance");
  console.log("   - 35s cleanup timeout");
  console.log("   - Automatic error propagation for extended outages");
  console.log("   - Capacity-managed buffering with overflow protection");
}
