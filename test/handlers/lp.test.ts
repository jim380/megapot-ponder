import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, createMockEvent } from "../mocks/context-v11";
import { generateEventId } from "../../src/utils/calculations";
import { getHandlers } from "../mocks/ponder-registry";

describe("LP Handlers", () => {
  let mockContext: any;
  let handlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    await import("../../src/handlers/lp");
    handlers = getHandlers();
  });

  describe("LpDeposit Handler", () => {
    it("should create a new LP when they don't exist", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpDeposit",
        args: {
          lpAddress: "0x6666666666666666666666666666666666666666",
          amount: 10000000n,
          riskPercentage: 100n,
        },
      });

      const handler = handlers["BaseJackpot:LpDeposit"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;

      const userInsert = inserts.find((i) => i.table === "users");
      expect(userInsert).toBeDefined();
      expect(userInsert.data).toMatchObject({
        id: "0x6666666666666666666666666666666666666666",
        isLP: true,
      });

      const lpInsert = inserts.find((i) => i.table === "liquidityProviders");
      expect(lpInsert).toBeDefined();
      expect(lpInsert.data).toMatchObject({
        id: "0x6666666666666666666666666666666666666666",
        principal: 10000000n,
        totalDeposited: 10000000n,
        riskPercentage: 100,
        isActive: true,
      });

      const lpActionInsert = inserts.find((i) => i.table === "lpActions");
      expect(lpActionInsert).toBeDefined();
      expect(lpActionInsert.data).toMatchObject({
        lpAddress: "0x6666666666666666666666666666666666666666",
        actionType: "DEPOSIT",
        amount: 10000000n,
      });
    });

    it("should update existing LP's balance", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpDeposit",
        args: {
          lpAddress: "0x6666666666666666666666666666666666666666",
          amount: 5000000n,
          riskPercentage: 75n,
        },
      });

      const handler = handlers["BaseJackpot:LpDeposit"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;

      const lpUpdate = updates.find(
        (u) =>
          u.table === "liquidityProviders" &&
          u.filter?.id === "0x6666666666666666666666666666666666666666"
      );
      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        principal: 1000000n + 5000000n,
        totalDeposited: 1000000n + 5000000n,
        updatedAt: expect.any(Number),
      });
    });
  });

  describe("LpPrincipalWithdrawal Handler", () => {
    it("should update LP principal balance and mark inactive if balance is 0", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpPrincipalWithdrawal",
        args: {
          lpAddress: "0x7777777777777777777777777777777777777777",
          principalAmount: 1000000n,
        },
      });

      const handler = handlers["BaseJackpot:LpPrincipalWithdrawal"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = { principal: 1000000n, totalWithdrawn: 0n };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0x7777777777777777777777777777777777777777" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");

      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        principal: 0n,
        totalWithdrawn: 1000000n,
        isActive: false,
      });
    });
  });

  describe("LpStakeWithdrawal Handler", () => {
    it("should update LP stake balance", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpStakeWithdrawal",
        args: {
          lpAddress: "0x8888888888888888888888888888888888888888",
        },
      });

      const handler = handlers["BaseJackpot:LpStakeWithdrawal"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");

      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        stake: 0n,
      });
    });
  });

  describe("LpRiskPercentageAdjustment Handler", () => {
    it("should update LP risk percentage", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRiskPercentageAdjustment",
        args: {
          lpAddress: "0x9999999999999999999999999999999999999999",
          riskPercentage: 50n,
        },
      });

      const handler = handlers["BaseJackpot:LpRiskPercentageAdjustment"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const inserts = mockContext.db.__dataStore.inserts;

      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");
      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        riskPercentage: 50,
      });

      const lpActionInsert = inserts.find((i) => i.table === "lpActions");
      expect(lpActionInsert).toBeDefined();
      expect(lpActionInsert.data).toMatchObject({
        actionType: "RISK_ADJUSTMENT",
        amount: null,
        riskPercentage: 50,
      });
    });
  });

  describe("LpRebalance Handler", () => {
    it("should update LP balances after rebalance", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRebalance",
        args: {
          lpAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          principal: 900000n,
          stake: 150000n,
        },
      });

      const handler = handlers["BaseJackpot:LpRebalance"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;

      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");
      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        principal: 900000n,
        stake: 150000n,
      });
    });
  });
});
