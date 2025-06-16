import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, createMockEvent } from "../mocks/context-v11";
import { generateEventId } from "../../src/utils/calculations";
import {
  ZERO_ADDRESS,
  TICKET_PRICE,
  BPS_DIVISOR,
} from "../../src/utils/constants";
import { getHandlers } from "../mocks/ponder-registry";

describe("Tickets Balance Tracking - totalSpent", () => {
  let mockContext: any;
  let handlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    await import("../../src/handlers/tickets");
    handlers = getHandlers();
  });

  describe("UserTicketPurchase - totalSpent tracking", () => {
    it("should correctly calculate and set totalSpent for new user", async () => {
      const ticketBps = 100n;
      const expectedSpent = (ticketBps * TICKET_PRICE) / BPS_DIVISOR;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ticketsPurchasedTotalBps: ticketBps,
          referrer: ZERO_ADDRESS,
          buyer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find((i) => i.table === "users");

      expect(userInsert).toBeDefined();
      expect(userInsert.data.totalSpent).toBe(expectedSpent);
      expect(userInsert.data).toMatchObject({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ticketsPurchasedTotalBps: ticketBps,
        totalTicketsPurchased: 1n,
        totalSpent: expectedSpent,
        isActive: true,
      });
    });

    it("should accumulate totalSpent for existing user", async () => {
      const firstPurchaseBps = 200n;
      const secondPurchaseBps = 300n;
      const firstSpent = (firstPurchaseBps * TICKET_PRICE) / BPS_DIVISOR;
      const secondSpent = (secondPurchaseBps * TICKET_PRICE) / BPS_DIVISOR;
      const totalExpectedSpent = firstSpent + secondSpent;

      mockContext.db.__dataStore.inserts.push({
        table: "users",
        data: {
          id: "0xcccccccccccccccccccccccccccccccccccccccc",
          ticketsPurchasedTotalBps: firstPurchaseBps,
          totalTicketsPurchased: 1n,
          totalSpent: firstSpent,
          winningsClaimable: 0n,
          referralFeesClaimable: 0n,
          totalWinnings: 0n,
          totalReferralFees: 0n,
          isActive: true,
          isLP: false,
          createdAt: 1000000,
          updatedAt: 1000000,
        },
      });

      const originalInsert = mockContext.db.insert;
      mockContext.db.insert = vi.fn((table) => {
        const tableName = typeof table === "object" ? table.name : table;

        if (tableName === "users") {
          return {
            values: vi.fn((values) => ({
              onConflictDoUpdate: vi.fn((updateFn) => {
                const existingUser = {
                  ticketsPurchasedTotalBps: firstPurchaseBps,
                  totalTicketsPurchased: 1n,
                  totalSpent: firstSpent,
                  winningsClaimable: 0n,
                  referralFeesClaimable: 0n,
                  totalWinnings: 0n,
                  totalReferralFees: 0n,
                  isActive: true,
                  isLP: false,
                };

                const updatedData = updateFn(existingUser);
                mockContext.db.__dataStore.updates.push({
                  table: "users",
                  filter: { id: values.id },
                  data: updatedData,
                });
                return Promise.resolve();
              }),
              onConflictDoNothing: vi.fn(() => Promise.resolve()),
            })),
          };
        }

        return originalInsert(table);
      });

      const secondEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xcccccccccccccccccccccccccccccccccccccccc",
          ticketsPurchasedTotalBps: secondPurchaseBps,
          referrer: ZERO_ADDRESS,
          buyer: "0xcccccccccccccccccccccccccccccccccccccccc",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: secondEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const userUpdate = updates.find(
        (u) =>
          u.table === "users" &&
          u.filter?.id === "0xcccccccccccccccccccccccccccccccccccccccc"
      );

      expect(userUpdate).toBeDefined();
      expect(userUpdate.data).toMatchObject({
        ticketsPurchasedTotalBps: firstPurchaseBps + secondPurchaseBps,
        totalTicketsPurchased: 2n,
        totalSpent: totalExpectedSpent,
        isActive: true,
      });
    });

    it("should handle large ticket purchases correctly", async () => {
      const largeBps = 5000n;
      const expectedSpent = (largeBps * TICKET_PRICE) / BPS_DIVISOR;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xdddddddddddddddddddddddddddddddddddddddd",
          ticketsPurchasedTotalBps: largeBps,
          referrer: ZERO_ADDRESS,
          buyer: "0xdddddddddddddddddddddddddddddddddddddddd",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0xdddddddddddddddddddddddddddddddddddddddd"
      );

      expect(userInsert).toBeDefined();
      expect(userInsert.data.totalSpent).toBe(expectedSpent);
    });

    it("should track totalSpent separately from referrer fees", async () => {
      const ticketBps = 1000n;
      const expectedSpent = (ticketBps * TICKET_PRICE) / BPS_DIVISOR;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          ticketsPurchasedTotalBps: ticketBps,
          referrer: "0xffffffffffffffffffffffffffffffffffffffff",
          buyer: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;

      const buyerInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      );
      expect(buyerInsert).toBeDefined();
      expect(buyerInsert.data.totalSpent).toBe(expectedSpent);

      const referrerInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0xffffffffffffffffffffffffffffffffffffffff"
      );
      expect(referrerInsert).toBeDefined();
      expect(referrerInsert.data.totalSpent).toBe(0n);
    });

    it("should handle multiple simultaneous purchases", async () => {
      const purchases = [
        { recipient: "0x1111111111111111111111111111111111111111", bps: 100n },
        { recipient: "0x2222222222222222222222222222222222222222", bps: 200n },
        { recipient: "0x3333333333333333333333333333333333333333", bps: 300n },
      ];

      for (const purchase of purchases) {
        const mockEvent = createMockEvent({
          name: "BaseJackpot:UserTicketPurchase",
          args: {
            recipient: purchase.recipient,
            ticketsPurchasedTotalBps: purchase.bps,
            referrer: ZERO_ADDRESS,
            buyer: purchase.recipient,
          },
        });

        const handler = handlers["BaseJackpot:UserTicketPurchase"];
        await handler({ event: mockEvent, context: mockContext });
      }

      const inserts = mockContext.db.__dataStore.inserts;
      const userInserts = inserts.filter((i) => i.table === "users");

      expect(userInserts).toHaveLength(purchases.length);

      purchases.forEach((purchase, index) => {
        const userInsert = userInserts.find(
          (i) => i.data.id === purchase.recipient
        );
        const expectedSpent = (purchase.bps * TICKET_PRICE) / BPS_DIVISOR;
        expect(userInsert).toBeDefined();
        expect(userInsert.data.totalSpent).toBe(expectedSpent);
      });
    });

    it("should maintain totalSpent integrity with withdrawals", async () => {
      const ticketBps = 500n;
      const expectedSpent = (ticketBps * TICKET_PRICE) / BPS_DIVISOR;

      const purchaseEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0x4444444444444444444444444444444444444444",
          ticketsPurchasedTotalBps: ticketBps,
          referrer: ZERO_ADDRESS,
          buyer: "0x4444444444444444444444444444444444444444",
        },
      });

      const purchaseHandler = handlers["BaseJackpot:UserTicketPurchase"];
      await purchaseHandler({ event: purchaseEvent, context: mockContext });

      const withdrawalEvent = createMockEvent({
        name: "BaseJackpot:UserWinWithdrawal",
        args: {
          user: "0x4444444444444444444444444444444444444444",
          amount: 1000000n,
        },
      });

      const withdrawalHandler = handlers["BaseJackpot:UserWinWithdrawal"];
      await withdrawalHandler({ event: withdrawalEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0x4444444444444444444444444444444444444444"
      );

      expect(userInsert).toBeDefined();
      expect(userInsert.data.totalSpent).toBe(expectedSpent);
    });
  });

  describe("Edge cases for totalSpent tracking", () => {
    it("should handle zero BPS ticket purchase", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0x5555555555555555555555555555555555555555",
          ticketsPurchasedTotalBps: 0n,
          referrer: ZERO_ADDRESS,
          buyer: "0x5555555555555555555555555555555555555555",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0x5555555555555555555555555555555555555555"
      );

      expect(userInsert).toBeDefined();
      expect(userInsert.data.totalSpent).toBe(0n);
    });

    it("should handle max BPS ticket purchase", async () => {
      const maxBps = 10000n;
      const expectedSpent = (maxBps * TICKET_PRICE) / BPS_DIVISOR;

      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0x6666666666666666666666666666666666666666",
          ticketsPurchasedTotalBps: maxBps,
          referrer: ZERO_ADDRESS,
          buyer: "0x6666666666666666666666666666666666666666",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0x6666666666666666666666666666666666666666"
      );

      expect(userInsert).toBeDefined();
      expect(userInsert.data.totalSpent).toBe(expectedSpent);
    });
  });
});
