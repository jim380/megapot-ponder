import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, MockPonderContext } from "../mocks/context";
import {
  createLpDepositEvent,
  createLpPrincipalWithdrawalEvent,
  createLpStakeWithdrawalEvent,
  createLpRiskPercentageAdjustmentEvent,
  createLpRebalanceEvent,
} from "../mocks/events";
import { generateEventId } from "../../src/utils/calculations";
import { getHandlers } from "../mocks/ponder-registry";

import "../../src/handlers/lp";

const handlers = getHandlers() as Record<string, Function>;

describe("LP Handlers", () => {
  let context: MockPonderContext;

  beforeEach(() => {
    context = createMockContext();
  });

  describe("LpDeposit Handler", () => {
    it("should create a new LP when they don't exist", async () => {
      const event = createLpDepositEvent({
        user: "0x6666666666666666666666666666666666666666",
        amount: 10000000n,
      });

      context.db.LiquidityProvider.findUnique.mockResolvedValue(null);

      await handlers["BaseJackpot:LpDeposit"]({ event, context });

      expect(context.db.User.upsert).toHaveBeenCalledWith({
        id: "0x6666666666666666666666666666666666666666",
        create: expect.objectContaining({
          address: "0x6666666666666666666666666666666666666666",
          isLiquidityProvider: true,
        }),
        update: expect.objectContaining({
          isLiquidityProvider: true,
        }),
      });

      expect(context.db.LiquidityProvider.create).toHaveBeenCalledWith({
        id: "0x6666666666666666666666666666666666666666",
        data: {
          userId: "0x6666666666666666666666666666666666666666",
          principalBalance: 10000000n,
          stakeBalance: 0n,
          totalDeposited: 10000000n,
          totalWithdrawn: 0n,
          totalStakeWithdrawn: 0n,
          riskPercentage: 100,
          isActive: true,
          lastActivityAt: expect.any(Number),
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });
    });

    it("should update existing LP's balance", async () => {
      const event = createLpDepositEvent({
        user: "0x6666666666666666666666666666666666666666",
        amount: 5000000n,
      });

      const existingLp = {
        id: "0x6666666666666666666666666666666666666666",
        principalBalance: 20000000n,
        totalDeposited: 20000000n,
        riskPercentage: 75,
      };

      context.db.LiquidityProvider.findUnique.mockResolvedValue(existingLp);

      await handlers["BaseJackpot:LpDeposit"]({ event, context });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0x6666666666666666666666666666666666666666",
        data: {
          principalBalance: 25000000n,
          totalDeposited: 25000000n,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });
    });

    it("should create LP action record", async () => {
      const event = createLpDepositEvent({
        user: "0x6666666666666666666666666666666666666666",
        amount: 5000000n,
        transactionHash: "0xmno345",
        logIndex: 4,
      });

      context.db.LiquidityProvider.findUnique.mockResolvedValue({
        riskPercentage: 80,
      });

      await handlers["BaseJackpot:LpDeposit"]({ event, context });

      const expectedEventId = generateEventId("0xmno345", 4);

      expect(context.db.LpAction.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          lpId: "0x6666666666666666666666666666666666666666",
          actionType: "deposit",
          amount: 5000000n,
          riskPercentage: 80,
          timestamp: expect.any(Number),
          transactionHash: "0xmno345",
          createdAt: expect.any(Number),
        },
      });
    });
  });

  describe("LpPrincipalWithdrawal Handler", () => {
    it("should update LP principal balance and mark inactive if balance is 0", async () => {
      const event = createLpPrincipalWithdrawalEvent({
        user: "0x7777777777777777777777777777777777777777",
        amount: 15000000n,
      });

      const existingLp = {
        id: "0x7777777777777777777777777777777777777777",
        principalBalance: 15000000n,
        totalWithdrawn: 5000000n,
        riskPercentage: 90,
      };

      context.db.LiquidityProvider.findUnique.mockResolvedValue(existingLp);

      await handlers["BaseJackpot:LpPrincipalWithdrawal"]({ event, context });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0x7777777777777777777777777777777777777777",
        data: {
          principalBalance: 0n,
          totalWithdrawn: 20000000n,
          isActive: false,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });
    });

    it("should keep LP active if balance remains positive", async () => {
      const event = createLpPrincipalWithdrawalEvent({
        user: "0x7777777777777777777777777777777777777777",
        amount: 5000000n,
      });

      const existingLp = {
        id: "0x7777777777777777777777777777777777777777",
        principalBalance: 15000000n,
        totalWithdrawn: 0n,
        riskPercentage: 90,
      };

      context.db.LiquidityProvider.findUnique.mockResolvedValue(existingLp);

      await handlers["BaseJackpot:LpPrincipalWithdrawal"]({ event, context });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0x7777777777777777777777777777777777777777",
        data: {
          principalBalance: 10000000n,
          totalWithdrawn: 5000000n,
          isActive: true,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });
    });
  });

  describe("LpStakeWithdrawal Handler", () => {
    it("should update LP stake balance", async () => {
      const event = createLpStakeWithdrawalEvent({
        user: "0x8888888888888888888888888888888888888888",
        amount: 100000n,
      });

      const existingLp = {
        id: "0x8888888888888888888888888888888888888888",
        stakeBalance: 500000n,
        totalStakeWithdrawn: 200000n,
        riskPercentage: 50,
      };

      context.db.LiquidityProvider.findUnique.mockResolvedValue(existingLp);

      await handlers["BaseJackpot:LpStakeWithdrawal"]({ event, context });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0x8888888888888888888888888888888888888888",
        data: {
          stakeBalance: 400000n,
          totalStakeWithdrawn: 300000n,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });
    });
  });

  describe("LpRiskPercentageAdjustment Handler", () => {
    it("should update LP risk percentage and track old value", async () => {
      const event = createLpRiskPercentageAdjustmentEvent({
        user: "0x9999999999999999999999999999999999999999",
        newRiskPercentage: 60n,
        transactionHash: "0xpqr678",
        logIndex: 5,
      });

      const existingLp = {
        id: "0x9999999999999999999999999999999999999999",
        riskPercentage: 100,
      };

      context.db.LiquidityProvider.findUnique.mockResolvedValue(existingLp);

      await handlers["BaseJackpot:LpRiskPercentageAdjustment"]({
        event,
        context,
      });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0x9999999999999999999999999999999999999999",
        data: {
          riskPercentage: 60,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });

      const expectedEventId = generateEventId("0xpqr678", 5);

      expect(context.db.LpAction.create).toHaveBeenCalledWith({
        id: expectedEventId,
        data: {
          lpId: "0x9999999999999999999999999999999999999999",
          actionType: "risk_adjustment",
          amount: 100n,
          riskPercentage: 60,
          timestamp: expect.any(Number),
          transactionHash: "0xpqr678",
          createdAt: expect.any(Number),
        },
      });
    });
  });

  describe("LpRebalance Handler", () => {
    it("should distribute rebalance proportionally to active LPs", async () => {
      const event = createLpRebalanceEvent({
        totalRebalanced: 1000000n,
        transactionHash: "0xstu901",
        logIndex: 6,
      });

      const activeLps = [
        {
          id: "0xaaaa",
          principalBalance: 3000000n,
          stakeBalance: 100000n,
          riskPercentage: 100,
        },
        {
          id: "0xbbbb",
          principalBalance: 4000000n,
          stakeBalance: 200000n,
          riskPercentage: 50,
        },
      ];

      context.db.LiquidityProvider.findMany.mockResolvedValue(activeLps);

      await handlers["BaseJackpot:LpRebalance"]({ event, context });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0xaaaa",
        data: {
          stakeBalance: 700000n,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });

      expect(context.db.LiquidityProvider.update).toHaveBeenCalledWith({
        id: "0xbbbb",
        data: {
          stakeBalance: 600000n,
          lastActivityAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
      });

      expect(context.db.LpAction.create).toHaveBeenCalledWith({
        id: expect.stringContaining("0xstu901"),
        data: expect.objectContaining({
          lpId: "0xaaaa",
          actionType: "rebalance",
          amount: 600000n,
          riskPercentage: 100,
        }),
      });

      expect(context.db.LpAction.create).toHaveBeenCalledWith({
        id: expect.stringContaining("0xstu901"),
        data: expect.objectContaining({
          lpId: "0xbbbb",
          actionType: "rebalance",
          amount: 400000n,
          riskPercentage: 50,
        }),
      });

      expect(context.db.LpAction.create).toHaveBeenCalledWith({
        id: generateEventId("0xstu901", 6),
        data: expect.objectContaining({
          lpId: "system",
          actionType: "rebalance",
          amount: 1000000n,
          riskPercentage: 0,
        }),
      });
    });

    it("should handle case with no active LPs", async () => {
      const event = createLpRebalanceEvent({
        totalRebalanced: 1000000n,
      });

      context.db.LiquidityProvider.findMany.mockResolvedValue([]);

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await handlers["BaseJackpot:LpRebalance"]({ event, context });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "No active LPs found during rebalance"
      );
      expect(context.db.LiquidityProvider.update).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle LPs with 0% risk (no distribution)", async () => {
      const event = createLpRebalanceEvent({
        totalRebalanced: 1000000n,
      });

      const activeLps = [
        {
          id: "0xcccc",
          principalBalance: 5000000n,
          stakeBalance: 0n,
          riskPercentage: 0,
        },
      ];

      context.db.LiquidityProvider.findMany.mockResolvedValue(activeLps);

      await handlers["BaseJackpot:LpRebalance"]({ event, context });

      expect(context.db.LiquidityProvider.update).not.toHaveBeenCalled();
      expect(context.db.LpAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lpId: "system",
            amount: 1000000n,
          }),
        })
      );
    });
  });
});
