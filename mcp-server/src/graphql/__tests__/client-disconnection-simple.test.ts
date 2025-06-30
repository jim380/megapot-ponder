import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { DisconnectionBuffer } from "../disconnection-buffer.js";
import { WebSocketDisconnectionError } from "../../errors/index.js";

describe("GraphQL Client Disconnection Handling (Simplified)", () => {
  let disconnectionBuffer: DisconnectionBuffer;

  beforeEach(() => {
    jest.useFakeTimers();
    disconnectionBuffer = new DisconnectionBuffer({
      bufferDurationMs: 30_000,
      cleanupTimeoutMs: 35_000,
      maxUpdatesPerSubscription: 5,
      maxTotalUpdates: 10,
    });
  });

  afterEach(() => {
    disconnectionBuffer.dispose();
    jest.useRealTimers();
  });

  describe("Disconnection error generation", () => {
    it("should create WebSocketDisconnectionError correctly", () => {
      const error = new WebSocketDisconnectionError(30000, 5, 10);

      expect(error).toBeInstanceOf(WebSocketDisconnectionError);
      expect(error.message).toContain("WebSocket outage exceeded buffer duration");
      expect(error.message).toContain("30000ms");
      expect(error.message).toContain("5 subscriptions");
      expect(error.message).toContain("10 buffered updates");
    });
  });

  describe("Buffer behavior during disconnection", () => {
    it("should buffer updates when disconnected", () => {
      const subscriptionIds = ["sub1", "sub2"];
      disconnectionBuffer.startBuffering(subscriptionIds);

      expect(disconnectionBuffer.isBufferingActive()).toBe(true);

      disconnectionBuffer.bufferUpdate("sub1", { data: "update1" });
      disconnectionBuffer.bufferUpdate("sub2", { data: "update2" });

      const stats = disconnectionBuffer.getBufferStats();
      expect(stats.totalUpdates).toBe(2);
      expect(stats.subscriptionCount).toBe(2);
    });

    it("should emit extended outage event after timeout", () => {
      const extendedOutageHandler = jest.fn();
      disconnectionBuffer.on("extendedOutage", extendedOutageHandler);

      disconnectionBuffer.startBuffering(["sub1"]);

      jest.advanceTimersByTime(35_000);

      expect(extendedOutageHandler).toHaveBeenCalledWith(35000, 1);
    });

    it("should clear buffer on demand", () => {
      disconnectionBuffer.startBuffering(["sub1"]);
      disconnectionBuffer.bufferUpdate("sub1", { data: "update1" });

      let stats = disconnectionBuffer.getBufferStats();
      expect(stats.totalUpdates).toBe(1);

      disconnectionBuffer.clearBuffer();

      stats = disconnectionBuffer.getBufferStats();
      expect(stats.isBuffering).toBe(false);
      expect(stats.totalUpdates).toBe(0);
    });
  });
});
