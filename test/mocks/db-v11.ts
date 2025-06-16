import { vi } from "vitest";

export const mockTables = {
  users: { name: "users" },
  liquidityProviders: { name: "liquidityProviders" },
  jackpotRounds: { name: "jackpotRounds" },
  tickets: { name: "tickets" },
  lpActions: { name: "lpActions" },
  withdrawals: { name: "withdrawals" },
  feeDistributions: { name: "feeDistributions" },
  referrals: { name: "referrals" },
  lpRoundSnapshots: { name: "lpRoundSnapshots" },
  hourlyStats: { name: "hourlyStats" },
};

export const createMockDbV11 = () => {
  const dataStore: Record<string, any[]> = {
    inserts: [],
    updates: [],
  };

  const createInsertChain = () => {
    let pendingData: any = null;
    let tableName: string = "";

    const chain = {
      values: vi.fn((data: any) => {
        pendingData = data;
        dataStore.inserts.push({ table: tableName, data });
        return chain;
      }),
      onConflictDoNothing: vi.fn(() => {
        return chain;
      }),
      onConflictDoUpdate: vi.fn((updateFn: any) => {
        if (typeof updateFn === "function" && pendingData) {
          const mockExisting = {
            ...pendingData,
            principal: 1000000n,
            totalDeposited: 1000000n,
          };
          const updatedData = updateFn(mockExisting);
          dataStore.updates.push({
            table: tableName,
            filter: { id: pendingData.id },
            data: updatedData,
          });
        } else if (typeof updateFn === "object") {
          dataStore.updates.push({
            table: tableName,
            filter: { id: pendingData.id },
            data: updateFn,
          });
        }
        return chain;
      }),
    };

    return (table: any) => {
      tableName = table?.name || "unknown";
      return chain;
    };
  };

  const createUpdateChain = () => {
    let tableName: string = "";
    let filter: any = null;

    const chain = {
      set: vi.fn((updateData: any) => {
        if (typeof updateData === "function") {
          const mockCurrent = {
            winningsClaimable: 0n,
            referralFeesClaimable: 0n,
            totalWinnings: 0n,
            totalReferralFees: 0n,
            ticketsPurchasedTotalBps: 0n,
            totalTicketsPurchased: 0n,
            totalSpent: 0n,
            ticketCountTotalBps: 0n,
            principal: 1000000n,
            stake: 100000n,
            totalDeposited: 1000000n,
            totalWithdrawn: 0n,
            totalFeesEarned: 0n,
            riskPercentage: 50,
            isActive: true,
            totalLpSupplied: 0n,
            updatedAt: 0,
          };
          const result = updateData(mockCurrent);
          dataStore.updates.push({ table: tableName, filter, data: result });
        } else {
          dataStore.updates.push({
            table: tableName,
            filter,
            data: updateData,
          });
        }
        return chain;
      }),
    };

    return (table: any, filterArg: any) => {
      tableName = table?.name || "unknown";
      filter = filterArg;
      return chain;
    };
  };

  const mockDb = {
    insert: vi.fn(createInsertChain()),
    update: vi.fn(createUpdateChain()),

    __dataStore: dataStore,
  };

  return mockDb;
};
