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
    return (table: any) => {
      const tableName = table?.name || "unknown";
      return {
        values: vi.fn((data: any) => {
          let isPlainInsert = true;

          const result: any = {
            onConflictDoNothing: vi.fn(() => {
              isPlainInsert = false;
              dataStore.inserts.push({ table: tableName, data });
              return Promise.resolve();
            }),
            onConflictDoUpdate: vi.fn((updateFn: any) => {
              isPlainInsert = false;
              dataStore.inserts.push({ table: tableName, data });

              if (typeof updateFn === "function") {
                const mockExisting = {
                  ...data,
                  principal: 1000000n,
                  totalDeposited: 1000000n,
                };
                const updatedData = updateFn(mockExisting);
                dataStore.updates.push({
                  table: tableName,
                  filter: { id: data.id },
                  data: updatedData,
                });
              } else if (typeof updateFn === "object") {
                dataStore.updates.push({
                  table: tableName,
                  filter: { id: data.id },
                  data: updateFn,
                });
              }
              return Promise.resolve();
            }),
          };

          result.then = vi.fn((onFulfilled: any, _onRejected?: any) => {
            if (isPlainInsert) {
              dataStore.inserts.push({ table: tableName, data });
            }
            const value = undefined;
            if (onFulfilled) {
              return Promise.resolve(onFulfilled(value));
            }
            return Promise.resolve(value);
          });

          return result;
        }),
      };
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
    insert: createInsertChain(),
    update: createUpdateChain(),

    __dataStore: dataStore,
  };

  return mockDb;
};
