import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { DisconnectionBuffer, type BufferedUpdate } from "../disconnection-buffer.js";

describe("DisconnectionBuffer", () => {
  let buffer: DisconnectionBuffer;
  let mockReplayHandler: jest.MockedFunction<
    (subscriptionId: string, updates: BufferedUpdate[]) => void
  >;

  beforeEach(() => {
    jest.useFakeTimers();
    buffer = new DisconnectionBuffer({
      bufferDurationMs: 30_000,
      cleanupTimeoutMs: 35_000,
      maxUpdatesPerSubscription: 5,
      maxTotalUpdates: 10,
    });
    mockReplayHandler = jest.fn();
  });

  afterEach(() => {
    buffer.dispose();
    jest.useRealTimers();
  });

  describe("Basic buffering functionality", () => {
    it("should start buffering when requested", () => {
      const subscriptionIds = ["sub1", "sub2"];
      const bufferingStartedSpy = jest.fn();
      buffer.on("bufferingStarted", bufferingStartedSpy);

      buffer.startBuffering(subscriptionIds);

      expect(buffer.isBufferingActive()).toBe(true);
      expect(bufferingStartedSpy).toHaveBeenCalledWith(2);
    });

    it("should buffer updates during disconnection", () => {
      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);

      const testData = { message: "test update" };
      buffer.bufferUpdate("sub1", testData);

      const stats = buffer.getBufferStats();
      expect(stats.totalUpdates).toBe(1);
      expect(stats.subscriptionCount).toBe(1);
    });

    it("should replay buffered updates in order", () => {
      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);

      buffer.bufferUpdate("sub1", { message: "update1" });
      buffer.bufferUpdate("sub1", { message: "update2" });
      buffer.bufferUpdate("sub1", { message: "update3" });

      buffer.stopBuffering(mockReplayHandler);

      expect(mockReplayHandler).toHaveBeenCalledTimes(1);
      const call = mockReplayHandler.mock.calls[0];
      expect(call).toBeDefined();
      expect(call![0]).toBe("sub1");
      expect(call![1]).toHaveLength(3);

      const update1 = call![1][0]?.data as { message: string };
      const update2 = call![1][1]?.data as { message: string };
      const update3 = call![1][2]?.data as { message: string };
      expect(update1.message).toBe("update1");
      expect(update2.message).toBe("update2");
      expect(update3.message).toBe("update3");
    });
  });

  describe("Buffer capacity management", () => {
    it("should evict oldest updates when per-subscription limit is exceeded", () => {
      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);

      for (let i = 1; i <= 7; i++) {
        buffer.bufferUpdate("sub1", { message: `update${i}` });
      }

      const stats = buffer.getBufferStats();
      expect(stats.totalUpdates).toBe(5);

      buffer.stopBuffering(mockReplayHandler);
      const updates = mockReplayHandler.mock.calls[0]?.[1];
      expect(updates).toBeDefined();

      const firstUpdate = updates![0]?.data as { message: string };
      const lastUpdate = updates![4]?.data as { message: string };
      expect(firstUpdate.message).toBe("update3");
      expect(lastUpdate.message).toBe("update7");
    });

    it("should emit bufferOverflow event when total capacity is exceeded", () => {
      const overflowSpy = jest.fn();
      buffer.on("bufferOverflow", overflowSpy);

      const subscriptionIds = ["sub1", "sub2"];
      buffer.startBuffering(subscriptionIds);

      for (let i = 1; i <= 5; i++) {
        buffer.bufferUpdate("sub1", { message: `update1-${i}` });
      }

      for (let i = 1; i <= 5; i++) {
        buffer.bufferUpdate("sub2", { message: `update2-${i}` });
      }

      buffer.bufferUpdate("sub1", { message: "overflow" });

      expect(overflowSpy).toHaveBeenCalled();
    });
  });

  describe("Extended outage handling", () => {
    it("should emit extendedOutage event when cleanup timeout is reached", () => {
      const extendedOutageSpy = jest.fn();
      buffer.on("extendedOutage", extendedOutageSpy);

      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);

      jest.advanceTimersByTime(35_000);

      expect(extendedOutageSpy).toHaveBeenCalledWith(expect.any(Number), 1);
    });

    it("should clear buffer when cleanup timeout is reached", () => {
      const bufferClearedSpy = jest.fn();
      buffer.on("bufferCleared", bufferClearedSpy);

      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);
      buffer.bufferUpdate("sub1", { message: "test" });

      jest.advanceTimersByTime(35_000);

      expect(buffer.isBufferingActive()).toBe(false);
      expect(bufferClearedSpy).toHaveBeenCalledWith("timeout", 1);
    });

    it("should detect extended outage during reconnection", () => {
      const extendedOutageSpy = jest.fn();
      buffer.on("extendedOutage", extendedOutageSpy);

      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);

      jest.advanceTimersByTime(32_000);

      buffer.stopBuffering(mockReplayHandler);

      expect(extendedOutageSpy).toHaveBeenCalled();
    });
  });

  describe("Manual operations", () => {
    it("should allow manual buffer clearing", () => {
      const bufferClearedSpy = jest.fn();
      buffer.on("bufferCleared", bufferClearedSpy);

      const subscriptionIds = ["sub1"];
      buffer.startBuffering(subscriptionIds);
      buffer.bufferUpdate("sub1", { message: "test" });

      buffer.clearBuffer("manual");

      expect(buffer.isBufferingActive()).toBe(false);
      expect(bufferClearedSpy).toHaveBeenCalledWith("manual", 1);
    });

    it("should provide accurate buffer statistics", () => {
      const subscriptionIds = ["sub1", "sub2"];
      buffer.startBuffering(subscriptionIds);

      jest.advanceTimersByTime(100);

      buffer.bufferUpdate("sub1", { message: "test1" });
      buffer.bufferUpdate("sub2", { message: "test2" });

      const stats = buffer.getBufferStats();
      expect(stats.isBuffering).toBe(true);
      expect(stats.totalUpdates).toBe(2);
      expect(stats.subscriptionCount).toBe(2);
      expect(stats.outageMs).toBeGreaterThanOrEqual(100);
      expect(stats.oldestUpdateAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error handling", () => {
    it("should ignore buffer update when not buffering", () => {
      buffer.bufferUpdate("sub1", { message: "test" });

      const stats = buffer.getBufferStats();
      expect(stats.totalUpdates).toBe(0);
    });

    it("should ignore start buffering when already active", () => {
      const bufferingStartedSpy = jest.fn();
      buffer.on("bufferingStarted", bufferingStartedSpy);

      buffer.startBuffering(["sub1"]);
      buffer.startBuffering(["sub2"]);

      expect(bufferingStartedSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle stop buffering when not active", () => {
      buffer.stopBuffering(mockReplayHandler);

      expect(mockReplayHandler).not.toHaveBeenCalled();
    });
  });

  describe("Sequence ordering", () => {
    it("should maintain correct sequence numbers", () => {
      const subscriptionIds = ["sub1", "sub2"];
      buffer.startBuffering(subscriptionIds);

      buffer.bufferUpdate("sub1", { message: "first" });
      buffer.bufferUpdate("sub2", { message: "second" });
      buffer.bufferUpdate("sub1", { message: "third" });

      buffer.stopBuffering(mockReplayHandler);

      expect(mockReplayHandler).toHaveBeenCalledTimes(2);

      const sub1Call = mockReplayHandler.mock.calls.find((call) => call[0] === "sub1");
      const sub2Call = mockReplayHandler.mock.calls.find((call) => call[0] === "sub2");

      expect(sub1Call![1]).toHaveLength(2);
      expect(sub2Call![1]).toHaveLength(1);

      const firstSeq = sub1Call![1][0]?.sequenceNumber;
      const secondSeq = sub1Call![1][1]?.sequenceNumber;
      expect(firstSeq).toBeDefined();
      expect(secondSeq).toBeDefined();
      expect(firstSeq!).toBeLessThan(secondSeq!);
    });
  });
});
