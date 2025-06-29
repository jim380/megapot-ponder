import { EventEmitter } from "node:events";
import { getLogger } from "../logging/index.js";

const logger = getLogger("disconnection-buffer");

export interface BufferedUpdate {
  subscriptionId: string;
  data: any;
  timestamp: number;
  sequenceNumber: number;
}

export interface DisconnectionBufferConfig {
  bufferDurationMs: number;

  cleanupTimeoutMs: number;

  maxUpdatesPerSubscription: number;

  maxTotalUpdates: number;
}

export interface BufferEvents {
  bufferingStarted: (subscriptionCount: number) => void;

  updatesReplayed: (updateCount: number, subscriptionCount: number) => void;

  bufferCleared: (reason: "timeout" | "manual", updateCount: number) => void;

  extendedOutage: (outageMs: number, subscriptionCount: number) => void;

  bufferOverflow: (droppedUpdates: number) => void;
}

export class DisconnectionBuffer extends EventEmitter {
  private bufferedUpdates: Map<string, BufferedUpdate[]> = new Map();
  private isBuffering = false;
  private bufferStartTime = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private sequenceCounter = 0;
  private config: DisconnectionBufferConfig;

  constructor(config: Partial<DisconnectionBufferConfig> = {}) {
    super();

    this.config = {
      bufferDurationMs: 30_000,
      cleanupTimeoutMs: 35_000,
      maxUpdatesPerSubscription: 100,
      maxTotalUpdates: 1000,
      ...config,
    };

    logger.debug(
      {
        config: this.config,
      },
      "Disconnection buffer initialized"
    );
  }

  startBuffering(subscriptionIds: string[]): void {
    if (this.isBuffering) {
      logger.warn("Buffer already active, ignoring start request");
      return;
    }

    this.isBuffering = true;
    this.bufferStartTime = Date.now();
    this.sequenceCounter = 0;

    for (const subscriptionId of subscriptionIds) {
      if (!this.bufferedUpdates.has(subscriptionId)) {
        this.bufferedUpdates.set(subscriptionId, []);
      }
    }

    logger.info(
      {
        subscriptionCount: subscriptionIds.length,
        subscriptionIds,
      },
      "Started buffering subscription updates"
    );

    this.emit("bufferingStarted", subscriptionIds.length);

    this.cleanupTimer = setTimeout(() => {
      const outageMs = Date.now() - this.bufferStartTime;
      logger.warn(
        {
          outageMs,
          subscriptionCount: this.bufferedUpdates.size,
        },
        "Extended outage detected, propagating error"
      );

      this.emit("extendedOutage", outageMs, this.bufferedUpdates.size);
      this.clearBuffer("timeout");
    }, this.config.cleanupTimeoutMs);
  }

  stopBuffering(replayHandler: (subscriptionId: string, updates: BufferedUpdate[]) => void): void {
    if (!this.isBuffering) {
      logger.debug("Buffer not active, ignoring stop request");
      return;
    }

    const outageMs = Date.now() - this.bufferStartTime;
    const totalUpdates = this.getTotalBufferedUpdateCount();

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (outageMs > this.config.bufferDurationMs) {
      logger.warn(
        {
          outageMs,
          bufferDurationMs: this.config.bufferDurationMs,
          totalUpdates,
        },
        "Extended outage detected during reconnection"
      );

      this.emit("extendedOutage", outageMs, this.bufferedUpdates.size);
    }

    let replayedCount = 0;
    Array.from(this.bufferedUpdates.entries()).forEach(([subscriptionId, updates]) => {
      if (updates.length > 0) {
        updates.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        try {
          replayHandler(subscriptionId, updates);
          replayedCount += updates.length;
        } catch (error) {
          logger.error(
            {
              subscriptionId,
              updateCount: updates.length,
              error,
            },
            "Failed to replay buffered updates"
          );
        }
      }
    });

    logger.info(
      {
        outageMs,
        totalUpdates,
        replayedCount,
        subscriptionCount: this.bufferedUpdates.size,
      },
      "Stopped buffering and replayed updates"
    );

    this.emit("updatesReplayed", replayedCount, this.bufferedUpdates.size);

    this.isBuffering = false;
    this.bufferStartTime = 0;
    this.bufferedUpdates.clear();
    this.sequenceCounter = 0;
  }

  bufferUpdate(subscriptionId: string, data: any): void {
    if (!this.isBuffering) {
      return;
    }

    const totalUpdates = this.getTotalBufferedUpdateCount();
    if (totalUpdates >= this.config.maxTotalUpdates) {
      const droppedCount = this.evictOldestUpdates();
      this.emit("bufferOverflow", droppedCount);
    }

    let subscriptionBuffer = this.bufferedUpdates.get(subscriptionId);
    if (!subscriptionBuffer) {
      subscriptionBuffer = [];
      this.bufferedUpdates.set(subscriptionId, subscriptionBuffer);
    }

    if (subscriptionBuffer.length >= this.config.maxUpdatesPerSubscription) {
      subscriptionBuffer.shift();
      logger.debug(
        {
          subscriptionId,
          maxUpdates: this.config.maxUpdatesPerSubscription,
        },
        "Evicted oldest update for subscription"
      );
    }

    const update: BufferedUpdate = {
      subscriptionId,
      data,
      timestamp: Date.now(),
      sequenceNumber: ++this.sequenceCounter,
    };

    subscriptionBuffer.push(update);

    logger.debug(
      {
        subscriptionId,
        sequenceNumber: update.sequenceNumber,
        bufferSize: subscriptionBuffer.length,
        totalBuffered: this.getTotalBufferedUpdateCount(),
      },
      "Buffered subscription update"
    );
  }

  isBufferingActive(): boolean {
    return this.isBuffering;
  }

  getBufferStats(): {
    isBuffering: boolean;
    outageMs: number;
    totalUpdates: number;
    subscriptionCount: number;
    oldestUpdateAge: number;
  } {
    const now = Date.now();
    let oldestUpdateAge = 0;

    if (this.isBuffering) {
      Array.from(this.bufferedUpdates.values()).forEach((updates) => {
        updates.forEach((update) => {
          const age = now - update.timestamp;
          if (oldestUpdateAge === 0 || age > oldestUpdateAge) {
            oldestUpdateAge = age;
          }
        });
      });
    }

    return {
      isBuffering: this.isBuffering,
      outageMs: this.isBuffering ? now - this.bufferStartTime : 0,
      totalUpdates: this.getTotalBufferedUpdateCount(),
      subscriptionCount: this.bufferedUpdates.size,
      oldestUpdateAge,
    };
  }

  clearBuffer(reason: "timeout" | "manual" = "manual"): void {
    const updateCount = this.getTotalBufferedUpdateCount();

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isBuffering = false;
    this.bufferStartTime = 0;
    this.bufferedUpdates.clear();
    this.sequenceCounter = 0;

    logger.info(
      {
        reason,
        updateCount,
      },
      "Buffer cleared"
    );

    this.emit("bufferCleared", reason, updateCount);
  }

  dispose(): void {
    this.clearBuffer("manual");
    this.removeAllListeners();
  }

  private getTotalBufferedUpdateCount(): number {
    let total = 0;
    Array.from(this.bufferedUpdates.values()).forEach((updates) => {
      total += updates.length;
    });
    return total;
  }

  private evictOldestUpdates(): number {
    const targetReduction = Math.floor(this.config.maxTotalUpdates * 0.1);
    let removedCount = 0;

    const allUpdates: Array<BufferedUpdate & { subscriptionId: string }> = [];
    Array.from(this.bufferedUpdates.entries()).forEach(([subscriptionId, updates]) => {
      updates.forEach((update) => {
        allUpdates.push({ ...update, subscriptionId });
      });
    });

    allUpdates.sort((a, b) => a.timestamp - b.timestamp);

    const toRemove = allUpdates.slice(0, targetReduction);
    for (const update of toRemove) {
      const subscriptionBuffer = this.bufferedUpdates.get(update.subscriptionId);
      if (subscriptionBuffer) {
        const index = subscriptionBuffer.findIndex(
          (u) => u.sequenceNumber === update.sequenceNumber
        );
        if (index !== -1) {
          subscriptionBuffer.splice(index, 1);
          removedCount++;
        }
      }
    }

    logger.debug(
      {
        targetReduction,
        removedCount,
        remainingUpdates: this.getTotalBufferedUpdateCount(),
      },
      "Evicted oldest updates to manage buffer capacity"
    );

    return removedCount;
  }
}
