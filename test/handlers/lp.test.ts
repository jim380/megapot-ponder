import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, createMockEvent } from "../mocks/context-v11";
import { generateEventId } from "../../src/utils/calculations";
import { getHandlers } from "../mocks/ponder-registry";
import { calculateEffectiveLpStake } from "../../src/types/schema";

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
        effectiveStake: calculateEffectiveLpStake(10000000n, 100),
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

    it("should calculate effectiveStake correctly with different risk percentages", async () => {
      const testCases = [
        {
          amount: 10000000n,
          riskPercentage: 100n,
          expectedEffectiveStake: 10000000n,
        },
        {
          amount: 10000000n,
          riskPercentage: 50n,
          expectedEffectiveStake: 5000000n,
        },
        {
          amount: 10000000n,
          riskPercentage: 25n,
          expectedEffectiveStake: 2500000n,
        },
        { amount: 10000000n, riskPercentage: 0n, expectedEffectiveStake: 0n },
      ];

      for (const testCase of testCases) {
        const mockEvent = createMockEvent({
          name: "BaseJackpot:LpDeposit",
          args: {
            lpAddress: `0x${testCase.riskPercentage
              .toString(16)
              .padStart(40, "0")}`,
            amount: testCase.amount,
            riskPercentage: testCase.riskPercentage,
          },
        });

        const handler = handlers["BaseJackpot:LpDeposit"];
        await handler({ event: mockEvent, context: mockContext });

        const inserts = mockContext.db.__dataStore.inserts;
        const lpInsert = inserts.find(
          (i) =>
            i.table === "liquidityProviders" &&
            i.data.id ===
              `0x${testCase.riskPercentage.toString(16).padStart(40, "0")}`
        );

        expect(lpInsert).toBeDefined();
        expect(lpInsert.data.effectiveStake).toBe(
          testCase.expectedEffectiveStake
        );
        expect(lpInsert.data.effectiveStake).toBe(
          calculateEffectiveLpStake(
            testCase.amount,
            Number(testCase.riskPercentage)
          )
        );
      }
    });

    it("should update existing LP's balance and recalculate effectiveStake", async () => {
      const existingPrincipal = 1000000n;
      const newAmount = 5000000n;
      const newRiskPercentage = 75n;
      const totalPrincipal = existingPrincipal + newAmount;
      const expectedEffectiveStake = calculateEffectiveLpStake(
        totalPrincipal,
        Number(newRiskPercentage)
      );

      const originalInsert = mockContext.db.insert;
      mockContext.db.insert = vi.fn((table) => {
        const tableName = typeof table === "object" ? table.name : table;

        if (tableName === "liquidityProviders") {
          return {
            values: vi.fn((values) => ({
              onConflictDoUpdate: vi.fn((updateFn) => {
                const currentLP = {
                  principal: existingPrincipal,
                  totalDeposited: existingPrincipal,
                  riskPercentage: 50,
                  effectiveStake: calculateEffectiveLpStake(
                    existingPrincipal,
                    50
                  ),
                };
                const updatedData = updateFn(currentLP);
                mockContext.db.__dataStore.updates.push({
                  table: "liquidityProviders",
                  filter: { id: "0x6666666666666666666666666666666666666666" },
                  data: updatedData,
                });
              }),
              onConflictDoNothing: vi.fn(() => Promise.resolve()),
            })),
          };
        }

        return originalInsert(table);
      });

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpDeposit",
        args: {
          lpAddress: "0x6666666666666666666666666666666666666666",
          amount: newAmount,
          riskPercentage: newRiskPercentage,
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
        principal: totalPrincipal,
        totalDeposited: totalPrincipal,
        riskPercentage: Number(newRiskPercentage),
        effectiveStake: expectedEffectiveStake,
        isActive: true,
        updatedAt: expect.any(Number),
      });
    });

    it("should update round totalLpSupplied on deposit", async () => {
      const depositAmount = 8000000n;
      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpDeposit",
        args: {
          lpAddress: "0x7777777777777777777777777777777777777777",
          amount: depositAmount,
          riskPercentage: 100n,
        },
      });

      const handler = handlers["BaseJackpot:LpDeposit"];
      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const roundUpdate = updates.find((u) => u.table === "jackpotRounds");

      expect(roundUpdate).toBeDefined();
      expect(roundUpdate.data).toMatchObject({
        totalLpSupplied: depositAmount,
        updatedAt: expect.any(Number),
      });
    });
  });

  describe("LpPrincipalWithdrawal Handler", () => {
    it("should update LP principal balance, effectiveStake and mark inactive if balance is 0", async () => {
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
          const mockCurrent = {
            principal: 1000000n,
            totalWithdrawn: 0n,
            riskPercentage: 50,
            stake: 0n,
            totalFeesEarned: 0n,
          };
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
        effectiveStake: 0n,
        totalWithdrawn: 1000000n,
        isActive: false,
      });
    });

    it("should update effectiveStake correctly on partial withdrawal", async () => {
      const initialPrincipal = 10000000n;
      const withdrawAmount = 3000000n;
      const riskPercentage = 75;
      const expectedPrincipal = initialPrincipal - withdrawAmount;
      const expectedEffectiveStake = calculateEffectiveLpStake(
        expectedPrincipal,
        riskPercentage
      );

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpPrincipalWithdrawal",
        args: {
          lpAddress: "0x8888888888888888888888888888888888888888",
          principalAmount: withdrawAmount,
        },
      });

      const handler = handlers["BaseJackpot:LpPrincipalWithdrawal"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = {
            principal: initialPrincipal,
            totalWithdrawn: 0n,
            riskPercentage: riskPercentage,
            stake: 0n,
            totalFeesEarned: 0n,
          };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0x8888888888888888888888888888888888888888" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");

      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        principal: expectedPrincipal,
        effectiveStake: expectedEffectiveStake,
        totalWithdrawn: withdrawAmount,
        isActive: true,
      });
    });

    it("should update round totalLpSupplied on withdrawal", async () => {
      const withdrawalAmount = 2000000n;
      const currentTotalLpSupplied = 10000000n;

      mockContext.db.update = vi.fn((table, filter) => {
        const tableName = typeof table === "object" ? table.name : table;

        if (tableName === "jackpotRounds") {
          return {
            set: vi.fn((updateFn) => {
              const mockCurrent = {
                totalLpSupplied: currentTotalLpSupplied,
              };
              const result = updateFn(mockCurrent);
              mockContext.db.__dataStore.updates.push({
                table: "jackpotRounds",
                filter: filter,
                data: result,
              });
            }),
          };
        }

        if (tableName === "liquidityProviders") {
          return {
            set: vi.fn((updateFn) => {
              const mockCurrent = {
                principal: 5000000n,
                totalWithdrawn: 0n,
                riskPercentage: 50,
                stake: 0n,
                totalFeesEarned: 0n,
              };
              const result = updateFn(mockCurrent);
              mockContext.db.__dataStore.updates.push({
                table: "liquidityProviders",
                filter: filter,
                data: result,
              });
            }),
          };
        }
      });

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpPrincipalWithdrawal",
        args: {
          lpAddress: "0x9999999999999999999999999999999999999999",
          principalAmount: withdrawalAmount,
        },
      });

      const handler = handlers["BaseJackpot:LpPrincipalWithdrawal"];
      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const roundUpdate = updates.find((u) => u.table === "jackpotRounds");

      expect(roundUpdate).toBeDefined();
      expect(roundUpdate.data).toMatchObject({
        totalLpSupplied: currentTotalLpSupplied - withdrawalAmount,
        updatedAt: expect.any(Number),
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
    it("should update LP risk percentage and recalculate effectiveStake", async () => {
      const currentPrincipal = 8000000n;
      const oldRiskPercentage = 100;
      const newRiskPercentage = 50n;
      const expectedEffectiveStake = calculateEffectiveLpStake(
        currentPrincipal,
        Number(newRiskPercentage)
      );

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRiskPercentageAdjustment",
        args: {
          lpAddress: "0x9999999999999999999999999999999999999999",
          riskPercentage: newRiskPercentage,
        },
      });

      const handler = handlers["BaseJackpot:LpRiskPercentageAdjustment"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = {
            principal: currentPrincipal,
            riskPercentage: oldRiskPercentage,
            effectiveStake: calculateEffectiveLpStake(
              currentPrincipal,
              oldRiskPercentage
            ),
          };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0x9999999999999999999999999999999999999999" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const inserts = mockContext.db.__dataStore.inserts;

      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");
      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        riskPercentage: Number(newRiskPercentage),
        effectiveStake: expectedEffectiveStake,
      });

      const lpActionInsert = inserts.find((i) => i.table === "lpActions");
      expect(lpActionInsert).toBeDefined();
      expect(lpActionInsert.data).toMatchObject({
        actionType: "RISK_ADJUSTMENT",
        amount: null,
        riskPercentage: Number(newRiskPercentage),
      });
    });

    it("should handle edge case risk percentages correctly", async () => {
      const testCases = [
        { principal: 5000000n, riskPercentage: 0n },
        { principal: 5000000n, riskPercentage: 1n },
        { principal: 5000000n, riskPercentage: 99n },
        { principal: 5000000n, riskPercentage: 100n },
      ];

      for (const testCase of testCases) {
        const expectedEffectiveStake = calculateEffectiveLpStake(
          testCase.principal,
          Number(testCase.riskPercentage)
        );

        const mockEvent = createMockEvent({
          name: "BaseJackpot:LpRiskPercentageAdjustment",
          args: {
            lpAddress: `0x${testCase.riskPercentage
              .toString()
              .padStart(40, "a")}`,
            riskPercentage: testCase.riskPercentage,
          },
        });

        const handler = handlers["BaseJackpot:LpRiskPercentageAdjustment"];

        mockContext.db.update = vi.fn(() => ({
          set: vi.fn((updateFn) => {
            const mockCurrent = {
              principal: testCase.principal,
              riskPercentage: 50,
              effectiveStake: calculateEffectiveLpStake(testCase.principal, 50),
            };
            const result = updateFn(mockCurrent);
            mockContext.db.__dataStore.updates.push({
              table: "liquidityProviders",
              filter: {
                id: `0x${testCase.riskPercentage.toString().padStart(40, "a")}`,
              },
              data: result,
            });
          }),
        }));

        await handler({ event: mockEvent, context: mockContext });

        const updates = mockContext.db.__dataStore.updates;
        const lpUpdate = updates.find(
          (u) =>
            u.table === "liquidityProviders" &&
            u.filter?.id ===
              `0x${testCase.riskPercentage.toString().padStart(40, "a")}`
        );

        expect(lpUpdate).toBeDefined();
        expect(lpUpdate.data.effectiveStake).toBe(expectedEffectiveStake);
      }
    });
  });

  describe("LpRebalance Handler", () => {
    it("should update LP balances and effectiveStake after rebalance", async () => {
      const newPrincipal = 900000n;
      const newStake = 150000n;
      const currentRiskPercentage = 80;
      const expectedEffectiveStake = calculateEffectiveLpStake(
        newPrincipal,
        currentRiskPercentage
      );

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRebalance",
        args: {
          lpAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          principal: newPrincipal,
          stake: newStake,
        },
      });

      const handler = handlers["BaseJackpot:LpRebalance"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = {
            principal: 1000000n,
            stake: 100000n,
            riskPercentage: currentRiskPercentage,
            effectiveStake: calculateEffectiveLpStake(
              1000000n,
              currentRiskPercentage
            ),
            totalFeesEarned: 500000n,
          };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;

      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");
      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data).toMatchObject({
        principal: newPrincipal,
        stake: newStake,
        effectiveStake: expectedEffectiveStake,
        totalFeesEarned: 550000n,
      });
    });

    it("should correctly calculate fee earned during rebalance", async () => {
      const oldStake = 100000n;
      const newStake = 175000n;
      const feeEarned = newStake - oldStake;
      const newPrincipal = 950000n;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRebalance",
        args: {
          lpAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          principal: newPrincipal,
          stake: newStake,
        },
      });

      const handler = handlers["BaseJackpot:LpRebalance"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = {
            principal: 1000000n,
            stake: oldStake,
            riskPercentage: 75,
            effectiveStake: calculateEffectiveLpStake(1000000n, 75),
            totalFeesEarned: 200000n,
          };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");

      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data.totalFeesEarned).toBe(200000n + feeEarned);
    });

    it("should handle rebalance with no fee earned (stake decrease)", async () => {
      const oldStake = 200000n;
      const newStake = 150000n;
      const newPrincipal = 850000n;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:LpRebalance",
        args: {
          lpAddress: "0xcccccccccccccccccccccccccccccccccccccccc",
          principal: newPrincipal,
          stake: newStake,
        },
      });

      const handler = handlers["BaseJackpot:LpRebalance"];

      mockContext.db.update = vi.fn(() => ({
        set: vi.fn((updateFn) => {
          const mockCurrent = {
            principal: 900000n,
            stake: oldStake,
            riskPercentage: 60,
            effectiveStake: calculateEffectiveLpStake(900000n, 60),
            totalFeesEarned: 300000n,
          };
          const result = updateFn(mockCurrent);
          mockContext.db.__dataStore.updates.push({
            table: "liquidityProviders",
            filter: { id: "0xcccccccccccccccccccccccccccccccccccccccc" },
            data: result,
          });
        }),
      }));

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const lpUpdate = updates.find((u) => u.table === "liquidityProviders");

      expect(lpUpdate).toBeDefined();
      expect(lpUpdate.data.totalFeesEarned).toBe(300000n);
    });
  });
});
