import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContext, createMockEvent } from "../mocks/context-v11";
import { generateEventId } from "../../src/utils/calculations";
import { calculateReferralFee } from "../../src/utils/calculations";
import { ZERO_ADDRESS } from "../../src/utils/constants";
import { getHandlers } from "../mocks/ponder-registry";

vi.mock("../../src/config/featureFlags", () => ({
  isFeatureEnabledForRound: vi.fn(() => false),
}));

vi.mock("../../src/utils/ticket-numbering", () => ({
  ensureRoundExists: vi.fn(),
  logCriticalError: vi.fn(),
}));

describe("Ticket Handlers", () => {
  let mockContext: any;
  let handlers: Record<string, Function>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    await import("../../src/handlers/tickets");
    handlers = getHandlers();
  });

  describe("UserTicketPurchase Handler", () => {
    it("should create a new user when they don't exist", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ticketsPurchasedTotalBps: 10000n,
          referrer: ZERO_ADDRESS,
          buyer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];
      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const userInsert = inserts.find((i) => i.table === "users");
      expect(userInsert).toBeDefined();
      expect(userInsert.data).toMatchObject({
        id: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ticketsPurchasedTotalBps: 10000n,
        totalTicketsPurchased: 1n,
        totalSpent: 1000000n,
        isActive: true,
      });

      const ticketInsert = inserts.find((i) => i.table === "tickets");
      expect(ticketInsert).toBeDefined();
      expect(ticketInsert.data).toMatchObject({
        buyerAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        recipientAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ticketsPurchasedBps: 10000n,
      });
    });

    it("should update referrer's earned fees when referrer is not zero address", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserTicketPurchase",
        args: {
          recipient: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ticketsPurchasedTotalBps: 20000n,
          referrer: "0xcccccccccccccccccccccccccccccccccccccccc",
          buyer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      });

      const handler = handlers["BaseJackpot:UserTicketPurchase"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;
      const updates = mockContext.db.__dataStore.updates;

      const referrerInsert = inserts.find(
        (i) =>
          i.table === "users" &&
          i.data.id === "0xcccccccccccccccccccccccccccccccccccccccc"
      );
      expect(referrerInsert).toBeDefined();
      expect(referrerInsert.data).toMatchObject({
        id: "0xcccccccccccccccccccccccccccccccccccccccc",
        isActive: true,
      });
    });
  });

  describe("UserWinWithdrawal Handler", () => {
    it("should create win withdrawal record and update user winnings", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserWinWithdrawal",
        args: {
          user: "0xdddddddddddddddddddddddddddddddddddddddd",
          amount: 10000000n,
        },
      });

      const handler = handlers["BaseJackpot:UserWinWithdrawal"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const inserts = mockContext.db.__dataStore.inserts;

      const userUpdate = updates.find(
        (u) =>
          u.table === "users" &&
          u.filter.id === "0xdddddddddddddddddddddddddddddddddddddddd"
      );
      expect(userUpdate).toBeDefined();
      expect(userUpdate.data).toMatchObject({
        winningsClaimable: 0n,
        totalWinnings: 10000000n,
      });

      const withdrawalInsert = inserts.find((i) => i.table === "withdrawals");
      expect(withdrawalInsert).toBeDefined();
      expect(withdrawalInsert.data).toMatchObject({
        userAddress: "0xdddddddddddddddddddddddddddddddddddddddd",
        amount: 10000000n,
        withdrawalType: "WINNINGS",
      });
    });
  });

  describe("UserReferralFeeWithdrawal Handler", () => {
    it("should create referral fee withdrawal record", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:UserReferralFeeWithdrawal",
        args: {
          user: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          amount: 50000n,
        },
      });

      const handler = handlers["BaseJackpot:UserReferralFeeWithdrawal"];

      await handler({ event: mockEvent, context: mockContext });

      const updates = mockContext.db.__dataStore.updates;
      const inserts = mockContext.db.__dataStore.inserts;

      const userUpdate = updates.find(
        (u) =>
          u.table === "users" &&
          u.filter.id === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      );
      expect(userUpdate).toBeDefined();
      expect(userUpdate.data).toMatchObject({
        referralFeesClaimable: 0n,
        totalReferralFees: 50000n,
      });

      const withdrawalInsert = inserts.find((i) => i.table === "withdrawals");
      expect(withdrawalInsert).toBeDefined();
      expect(withdrawalInsert.data).toMatchObject({
        userAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        amount: 50000n,
        withdrawalType: "REFERRAL_FEES",
      });
    });
  });

  describe("ProtocolFeeWithdrawal Handler", () => {
    it("should create protocol fee withdrawal record", async () => {
      const mockEvent = createMockEvent({
        name: "BaseJackpot:ProtocolFeeWithdrawal",
        args: {
          amount: 25000n,
        },
      });

      const handler = handlers["BaseJackpot:ProtocolFeeWithdrawal"];

      await handler({ event: mockEvent, context: mockContext });

      const inserts = mockContext.db.__dataStore.inserts;

      const feeDistInsert = inserts.find((i) => i.table === "feeDistributions");
      expect(feeDistInsert).toBeDefined();
      expect(feeDistInsert.data).toMatchObject({
        feeType: "PROTOCOL_FEE",
        amount: 25000n,
      });
    });
  });
});
