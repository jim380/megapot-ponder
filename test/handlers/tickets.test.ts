import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, MockPonderContext } from "../mocks/context";
import {
  createUserTicketPurchaseEvent,
  createUserWinWithdrawalEvent,
  createUserReferralFeeWithdrawalEvent,
  createProtocolFeeWithdrawalEvent,
} from "../mocks/events";
import { generateEventId } from "../../src/utils/calculations";
import { ZERO_ADDRESS } from "../../src/utils/constants";
import { getHandlers } from "../mocks/ponder-registry";

import "../../src/handlers/tickets";

const handlers = getHandlers() as Record<string, Function>;

describe("Ticket Handlers", () => {
  let context: MockPonderContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe("UserTicketPurchase Handler", () => {
    it("should create a new user when they don't exist", async () => {
      const event = createUserTicketPurchaseEvent({
        recipient: "0x1111111111111111111111111111111111111111",
        ticketsPurchasedTotalBps: 100n,
        referrer: ZERO_ADDRESS,
        buyer: "0x2222222222222222222222222222222222222222",
      });

      context.db.User.findUnique.mockResolvedValue(null);
      context.db.Round.findUnique.mockResolvedValue({
        id: 1,
        jackpotAmount: 1000000n,
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      if (handler) {
        await handler({ event, context });
      }

      expect(context.db.User.upsert).toHaveBeenCalledWith({
        id: "0x1111111111111111111111111111111111111111",
        create: {
          address: "0x1111111111111111111111111111111111111111",
          totalTicketsPurchased: 100n,
          totalWinnings: 0n,
          totalReferralFeesEarned: 0n,
          isLiquidityProvider: false,
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
        update: {
          totalTicketsPurchased: 100n,
          updatedAt: expect.any(Number),
        },
      });
    });

    it("should update existing user's ticket count", async () => {
      const event = createUserTicketPurchaseEvent({
        recipient: "0x1111111111111111111111111111111111111111",
        ticketsPurchasedTotalBps: 200n,
        referrer: ZERO_ADDRESS,
        buyer: "0x1111111111111111111111111111111111111111",
      });

      const existingUser = {
        id: "0x1111111111111111111111111111111111111111",
        totalTicketsPurchased: 500n,
        totalWinnings: 0n,
        totalReferralFeesEarned: 0n,
      };

      context.db.User.findUnique.mockResolvedValue(existingUser);
      context.db.Round.findUnique.mockResolvedValue({
        id: 1,
        jackpotAmount: 2000000n,
      });

      await handlers["BaseJackpot:UserTicketPurchase"]({ event, context });

      expect(context.db.User.upsert).toHaveBeenCalledWith({
        id: "0x1111111111111111111111111111111111111111",
        create: expect.any(Object),
        update: {
          totalTicketsPurchased: 700n,
          updatedAt: expect.any(Number),
        },
      });
    });

    it("should create ticket purchase record", async () => {
      const event = createUserTicketPurchaseEvent({
        ticketsPurchasedTotalBps: 150n,
        transactionHash: "0xabc123",
        logIndex: 3,
      });

      context.db.Round.findUnique.mockResolvedValue({
        id: 1,
        jackpotAmount: 5000000n,
      });

      await handlers["BaseJackpot:UserTicketPurchase"]({ event, context });

      const expectedEventId = generateEventId("0xabc123", 3);

      expect(context.db.TicketPurchase.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          userId: expect.any(String),
          roundId: 1,
          ticketsPurchasedBps: 150n,
          amount: 750000n,
          referrer: expect.any(String),
          buyer: expect.any(String),
          transactionHash: "0xabc123",
          timestamp: expect.any(Number),
          createdAt: expect.any(Number),
        },
      });
    });

    it("should update referrer's earned fees when referrer is not zero address", async () => {
      const referrer = "0x3333333333333333333333333333333333333333";
      const event = createUserTicketPurchaseEvent({
        recipient: "0x1111111111111111111111111111111111111111",
        ticketsPurchasedTotalBps: 100n,
        referrer: referrer,
        buyer: "0x1111111111111111111111111111111111111111",
      });

      context.db.Round.findUnique.mockResolvedValue({
        id: 1,
        jackpotAmount: 10000000n,
      });

      await handlers["BaseJackpot:UserTicketPurchase"]({ event, context });

      expect(context.db.User.upsert).toHaveBeenCalledWith({
        id: referrer,
        create: expect.objectContaining({
          address: referrer,
          totalReferralFeesEarned: 10000n,
        }),
        update: expect.objectContaining({
          totalReferralFeesEarned: 10000n,
        }),
      });
    });
  });

  describe("UserWinWithdrawal Handler", () => {
    it("should create win withdrawal record and update user winnings", async () => {
      const event = createUserWinWithdrawalEvent({
        user: "0x4444444444444444444444444444444444444444",
        amount: 50000000n,
        transactionHash: "0xdef456",
        logIndex: 1,
      });

      const existingUser = {
        id: "0x4444444444444444444444444444444444444444",
        totalWinnings: 100000000n,
      };

      context.db.User.findUnique.mockResolvedValue(existingUser);

      await handlers["BaseJackpot:UserWinWithdrawal"]({ event, context });

      const expectedEventId = generateEventId("0xdef456", 1);

      expect(context.db.WinWithdrawal.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          userId: "0x4444444444444444444444444444444444444444",
          amount: 50000000n,
          transactionHash: "0xdef456",
          timestamp: expect.any(Number),
          createdAt: expect.any(Number),
        },
      });

      expect(context.db.User.update).toHaveBeenCalledWith({
        id: "0x4444444444444444444444444444444444444444",
        data: {
          totalWinnings: 150000000n,
          updatedAt: expect.any(Number),
        },
      });
    });
  });

  describe("UserReferralFeeWithdrawal Handler", () => {
    it("should create referral fee withdrawal record", async () => {
      const event = createUserReferralFeeWithdrawalEvent({
        user: "0x5555555555555555555555555555555555555555",
        amount: 25000n,
        transactionHash: "0xghi789",
        logIndex: 2,
      });

      await handlers["BaseJackpot:UserReferralFeeWithdrawal"]({
        event,
        context,
      });

      const expectedEventId = generateEventId("0xghi789", 2);

      expect(context.db.ReferralFeeWithdrawal.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          userId: "0x5555555555555555555555555555555555555555",
          amount: 25000n,
          transactionHash: "0xghi789",
          timestamp: expect.any(Number),
          createdAt: expect.any(Number),
        },
      });
    });
  });

  describe("ProtocolFeeWithdrawal Handler", () => {
    it("should create protocol fee withdrawal record", async () => {
      const event = createProtocolFeeWithdrawalEvent({
        amount: 500000n,
        transactionHash: "0xjkl012",
        logIndex: 0,
      });

      await handlers["BaseJackpot:ProtocolFeeWithdrawal"]({ event, context });

      const expectedEventId = generateEventId("0xjkl012", 0);

      expect(context.db.ProtocolFeeWithdrawal.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          amount: 500000n,
          transactionHash: "0xjkl012",
          timestamp: expect.any(Number),
          createdAt: expect.any(Number),
        },
      });
    });
  });
});
