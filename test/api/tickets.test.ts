import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getUserTickets,
  getTicketOwner,
  getRoundTicketHolders,
} from "../../src/api/tickets";
import {
  calculateTicketNumbers,
  findWinnerByBps,
} from "../../src/api/ticket-numbering";

vi.mock("ponder:api", () => ({
  db: {
    query: {
      ticketRanges: {
        findMany: vi.fn(),
      },
      jackpotRounds: {
        findFirst: vi.fn(),
      },
    },
  },
}));

// @ts-expect-error - ponder:api is a virtual module
import { db } from "ponder:api";

describe("Ticket API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserTickets", () => {
    it("should return user tickets with decimal format", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
          startTicketNumber: 350000n,
          endTicketNumber: 350000n,
          ticketCount: 350000n,
          blockNumber: 27770473n,
          timestamp: 1742330293,
          transactionHash: "0x0b298d4e",
          logIndex: 432,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getUserTickets(
        "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
        "20165"
      );

      expect(result).toEqual({
        success: true,
        userAddress: "0x6735bd97d6002d9b2989c653304216c3b810a02b",
        roundId: "20165",
        totalBps: "350000",
        totalTickets: "35.0000",
        ticketCount: 1,
        ranges: [
          {
            roundId: "20165",
            bpsAmount: "350000",
            ticketCount: "35.0000",
            purchaseTime: 1742330293,
            transactionHash: "0x0b298d4e",
            blockNumber: "27770473",
          },
        ],
      });
    });

    it("should handle multiple purchases by same user", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
          startTicketNumber: 70000n,
          endTicketNumber: 70000n,
          ticketCount: 70000n,
          blockNumber: 27770473n,
          timestamp: 1742330293,
          transactionHash: "0x0b298d4e",
          logIndex: 432,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
          startTicketNumber: 35000n,
          endTicketNumber: 35000n,
          ticketCount: 35000n,
          blockNumber: 27770500n,
          timestamp: 1742330300,
          transactionHash: "0x0b298d4f",
          logIndex: 433,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getUserTickets(
        "0x6735Bd97D6002D9b2989c653304216c3b810A02B"
      );

      expect(result.success).toBe(true);
      expect(result.totalBps).toBe("105000");
      expect(result.totalTickets).toBe("10.5000");
      expect(result.ticketCount).toBe(2);
    });

    it("should handle case-insensitive address matching", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
          ticketCount: 70000n,
          timestamp: 1742330293,
          transactionHash: "0x0b298d4e",
          blockNumber: 27770473n,
          logIndex: 432,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getUserTickets(
        "0x6735bd97d6002d9b2989c653304216c3b810a02b"
      );

      expect(result.success).toBe(true);
      expect(result.totalTickets).toBe("7.0000");
    });
  });

  describe("getTicketOwner", () => {
    it("should find the correct ticket owner with cumulative calculation", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0xUser2",
          ticketCount: 350000n,
          blockNumber: 2n,
          timestamp: 200,
          transactionHash: "0x2",
          logIndex: 2,
        },
        {
          id: "event-3",
          roundId: "20165",
          userAddress: "0xUser3",
          ticketCount: 140000n,
          blockNumber: 3n,
          timestamp: 300,
          transactionHash: "0x3",
          logIndex: 3,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getTicketOwner("20165", 25n);

      expect(result).toEqual({
        success: true,
        ticketNumber: "25",
        roundId: "20165",
        owner: "0xUser2",
        purchaseTime: 200,
        transactionHash: "0x2",
        rangeInfo: {
          startTicket: "8",
          endTicket: "42",
          totalTicketsInRange: "35.0000",
          bpsInRange: "350000",
        },
      });
    });

    it("should handle ticket not found", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getTicketOwner("20165", 10n);

      expect(result).toEqual({
        success: false,
        error: "No owner found for ticket 10 in round 20165",
      });
    });
  });

  describe("getRoundTicketHolders", () => {
    it("should aggregate multiple purchases by same user", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0xUser2",
          ticketCount: 350000n,
          blockNumber: 2n,
          timestamp: 200,
          transactionHash: "0x2",
          logIndex: 2,
        },
        {
          id: "event-3",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 140000n,
          blockNumber: 3n,
          timestamp: 300,
          transactionHash: "0x3",
          logIndex: 3,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getRoundTicketHolders("20165");

      expect(result.success).toBe(true);
      expect(result.totalTickets).toBe("56.0000");
      expect(result.totalBps).toBe("560000");
      expect(result.uniqueHolders).toBe(2);

      // Type guard for holders
      if (result.success && result.holders) {
        expect(result.holders[0]).toMatchObject({
          userAddress: "0xUser2".toLowerCase(),
          ticketCount: "35.0000",
          percentage: "62.50",
        });

        expect(result.holders[1]).toMatchObject({
          userAddress: "0xUser1".toLowerCase(),
          ticketCount: "21.0000",
          percentage: "37.50",
        });
      }
    });

    it("should calculate correct ticket ranges", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 30000n,
          blockNumber: 2n,
          timestamp: 200,
          transactionHash: "0x2",
          logIndex: 2,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const result = await getRoundTicketHolders("20165");

      // Type guard for holders
      if (result.success && result.holders) {
        expect(result.holders[0]).toMatchObject({
          userAddress: "0xUser1".toLowerCase(),
          ticketCount: "10.0000",
          startTicket: "1",
          endTicket: "10",
        });
      }
    });
  });

  describe("calculateTicketNumbers", () => {
    it("should calculate cumulative ticket positions correctly", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 7000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0xUser2",
          ticketCount: 7000n,
          blockNumber: 2n,
          timestamp: 200,
          transactionHash: "0x2",
          logIndex: 2,
        },
        {
          id: "event-3",
          roundId: "20165",
          userAddress: "0xUser3",
          ticketCount: 7000n,
          blockNumber: 3n,
          timestamp: 300,
          transactionHash: "0x3",
          logIndex: 3,
        },
      ];

      const mockRound = {
        id: "20165",
        ticketCountTotalBps: 21000n,
      };

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);
      (db.query.jackpotRounds.findFirst as any).mockResolvedValue(mockRound);

      const result = await calculateTicketNumbers("20165");

      expect(result.success).toBe(true);
      expect(result.totalTickets).toBe("2.1000");
      
      // Type guard for ranges
      if (result.success && result.ranges) {
        expect(result.ranges).toHaveLength(3);

        expect(result.ranges[0]).toMatchObject({
          startBps: "0",
          endBps: "7000",
          startTicket: "1",
          endTicket: "1",
          ticketsDecimal: "0.7000",
        });

        expect(result.ranges[1]).toMatchObject({
          startBps: "7000",
          endBps: "14000",
          startTicket: "1",
          endTicket: "2",
        });

        expect(result.ranges[2]).toMatchObject({
          startBps: "14000",
          endBps: "21000",
          startTicket: "2",
          endTicket: "3",
        });
      }
    });
  });

  describe("findWinnerByBps", () => {
    it("should find winner by BPS position", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
        {
          id: "event-2",
          roundId: "20165",
          userAddress: "0xUser2",
          ticketCount: 140000n,
          blockNumber: 2n,
          timestamp: 200,
          transactionHash: "0x2",
          logIndex: 2,
        },
      ];

      const mockRound = {
        id: "20165",
        ticketCountTotalBps: 210000n,
      };

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);
      (db.query.jackpotRounds.findFirst as any).mockResolvedValue(mockRound);

      const result = await findWinnerByBps("20165", 150000n);

      expect(result).toMatchObject({
        success: true,
        winner: "0xUser2",
        winningBps: "150000",
        winningTicket: "16",
        rangeInfo: {
          startBps: "70000",
          endBps: "210000",
          startTicket: "8",
          endTicket: "21",
          ticketsBps: "140000",
          ticketsDecimal: "14.0000",
        },
      });
    });

    it("should handle winner not found", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 70000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
      ];

      const mockRound = {
        id: "20165",
        ticketCountTotalBps: 70000n,
      };

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);
      (db.query.jackpotRounds.findFirst as any).mockResolvedValue(mockRound);

      const result = await findWinnerByBps("20165", 80000n);

      expect(result).toMatchObject({
        success: false,
        error: "No winner found for BPS position 80000 in round 20165",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      (db.query.ticketRanges.findMany as any).mockRejectedValue(
        new Error("Database error")
      );

      const result = await getUserTickets("0xUser1");

      expect(result).toEqual({
        success: false,
        error: "Failed to fetch tickets: Database error",
      });
    });
  });
});
