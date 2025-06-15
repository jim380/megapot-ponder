import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, createMockEvent } from "../mocks/context-v11";
import { generateEventId } from "../../src/utils/calculations";
import { getCurrentRoundId } from "../../src/types/schema";
import {
  TOTAL_FEE_BPS,
  BPS_DIVISOR,
  LP_FEE_BPS,
  REFERRAL_FEE_BPS,
  PROTOCOL_FEE_BPS,
  USER_POOL_BPS,
} from "../../src/utils/constants";
import { getHandlers } from "../mocks/ponder-registry";

describe("Jackpot Handlers", () => {
  let mockContext: any;
  let handlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    await import("../../src/handlers/jackpot");
    handlers = getHandlers();
  });

  describe("JackpotRunRequested Handler", () => {
    it("should create round if not exists and update status to DRAWING", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:JackpotRunRequested",
        args: {
          user: "0x1234567890123456789012345678901234567890",
        },
        blockTimestamp: 1700000000n,
      });

      const handler = handlers["BaseJackpot:JackpotRunRequested"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const updates = mockContext.db.__dataStore.updates;

      expect(inserts).toHaveLength(1);
      expect(inserts[0]).toMatchObject({
        table: "jackpotRounds",
        data: expect.objectContaining({
          id: getCurrentRoundId(1700000000),
          status: "ACTIVE",
          startTime: 1700000000,
        }),
      });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        table: "jackpotRounds",
        filter: { id: getCurrentRoundId(1700000000) },
        data: {
          status: "DRAWING",
          updatedAt: 1700000000,
        },
      });
    });
  });

  describe("EntropyResult Handler", () => {
    it("should update round with random number", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:EntropyResult",
        args: {
          sequenceNumber: 12345n,
          randomNumber: "0xdeadbeef",
        },
        blockTimestamp: 1700000100n,
      });

      const handler = handlers["BaseJackpot:EntropyResult"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        table: "jackpotRounds",
        filter: { id: getCurrentRoundId(1700000100) },
        data: {
          randomNumber: "0xdeadbeef",
          updatedAt: 1700000100,
        },
      });
    });
  });

  describe("JackpotRun Handler", () => {
    it("should finalize round, update winner, and create next round", async () => {
      const winAmount = 1000000n;
      const mockEvent = createMockEvent({
        name: "BaseJackpot:JackpotRun",
        args: {
          time: 1700086400n,
          winner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          winningTicket: 42n,
          winAmount,
          ticketsPurchasedTotalBps: 100000n,
        },
        blockTimestamp: 1700086400n,
      });

      const handler = handlers["BaseJackpot:JackpotRun"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const updates = mockContext.db.__dataStore.updates;

      const totalTicketValue = (winAmount * BPS_DIVISOR) / USER_POOL_BPS;
      const lpFees = (totalTicketValue * LP_FEE_BPS) / BPS_DIVISOR;
      const referralFees = (totalTicketValue * REFERRAL_FEE_BPS) / BPS_DIVISOR;
      const protocolFees = (totalTicketValue * PROTOCOL_FEE_BPS) / BPS_DIVISOR;

      expect(updates[0]).toMatchObject({
        table: "jackpotRounds",
        filter: { id: getCurrentRoundId(1700086400) },
        data: {
          status: "RESOLVED",
          endTime: 1700086400,
          winnerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          winningTicketNumber: 42n,
          jackpotAmount: winAmount,
          ticketCountTotalBps: 100000n,
          totalTicketsValue: totalTicketValue,
          lpFeesGenerated: lpFees,
          referralFeesGenerated: referralFees,
          protocolFeesGenerated: protocolFees,
          updatedAt: 1700086400,
        },
      });

      const winnerUpdate = updates.find(
        (u) =>
          u.table === "users" &&
          u.filter.id === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      expect(winnerUpdate).toBeDefined();
      expect(winnerUpdate.data).toMatchObject({
        winningsClaimable: winAmount,
        updatedAt: 1700086400,
      });

      const nextRoundInsert = inserts.find(
        (i) => i.table === "jackpotRounds" && i.data.status === "ACTIVE"
      );
      expect(nextRoundInsert).toBeDefined();
      expect(nextRoundInsert.data).toMatchObject({
        id: getCurrentRoundId(1700086400),
        status: "ACTIVE",
        startTime: 1700086400,
      });

      const lpFeeInsert = inserts.find(
        (i) => i.table === "feeDistributions" && i.data.feeType === "LP_FEE"
      );
      expect(lpFeeInsert).toBeDefined();
      expect(lpFeeInsert.data).toMatchObject({
        feeType: "LP_FEE",
        amount: lpFees,
        roundId: getCurrentRoundId(1700086400),
      });
    });

    it("should handle zero fee amounts correctly", async () => {
      const winAmount = 1000000n;
      const mockEvent = createMockEvent({
        name: "BaseJackpot:JackpotRun",
        args: {
          time: 1700086400n,
          winner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          winningTicket: 1n,
          winAmount,
          ticketsPurchasedTotalBps: 50000n,
        },
        blockTimestamp: 1700086400n,
      });

      const handler = handlers["BaseJackpot:JackpotRun"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;

      const totalTicketValue = (winAmount * BPS_DIVISOR) / USER_POOL_BPS;
      const protocolFees = (totalTicketValue * PROTOCOL_FEE_BPS) / BPS_DIVISOR;

      expect(protocolFees).toBe(62500n);

      const protocolFeeInserts = inserts.filter(
        (i) =>
          i.table === "feeDistributions" && i.data.feeType === "PROTOCOL_FEE"
      );
      expect(protocolFeeInserts).toHaveLength(1);
      expect(protocolFeeInserts[0].data.amount).toBe(62500n);
    });
  });
});
