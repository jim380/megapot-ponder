import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../src/api/index";

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

vi.mock("ponder", () => ({
  client: () => (_ctx: any, next: any) => next(),
  graphql: () => (_ctx: any, next: any) => next(),
}));

// @ts-expect-error - ponder:api is a virtual module
import { db } from "ponder:api";

describe("Ticket API Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/tickets/user/:userAddress", () => {
    it("should return user tickets", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0x6735Bd97D6002D9b2989c653304216c3b810A02B",
          ticketCount: 350000n,
          blockNumber: 27770473n,
          timestamp: 1742330293,
          transactionHash: "0x0b298d4e",
          logIndex: 432,
        },
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const res = await app.request(
        "/api/tickets/user/0x6735Bd97D6002D9b2989c653304216c3b810A02B?roundId=20165"
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        totalTickets: "35.0000",
        totalBps: "350000",
      });
    });
  });

  describe("GET /api/tickets/round/:roundId/holders", () => {
    it("should return round ticket holders", async () => {
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
      ];

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const res = await app.request("/api/tickets/round/20165/holders");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        totalTickets: "42.0000",
        uniqueHolders: 2,
      });
      expect(json.holders[0].ticketCount).toBe("35.0000");
      expect(json.holders[1].ticketCount).toBe("7.0000");
    });
  });

  describe("GET /api/tickets/owner/:roundId/:ticketNumber", () => {
    it("should find ticket owner", async () => {
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

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);

      const res = await app.request("/api/tickets/owner/20165/15");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        owner: "0xUser2",
        rangeInfo: {
          startTicket: "8",
          endTicket: "21",
          totalTicketsInRange: "14.0000",
        },
      });
    });
  });

  describe("GET /api/tickets/round/:roundId/numbers", () => {
    it("should calculate ticket numbers", async () => {
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
      ];

      const mockRound = {
        id: "20165",
        ticketCountTotalBps: 7000n,
      };

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);
      (db.query.jackpotRounds.findFirst as any).mockResolvedValue(mockRound);

      const res = await app.request("/api/tickets/round/20165/numbers");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        totalTickets: "0.7000",
        totalBps: "7000",
      });
    });
  });

  describe("GET /api/tickets/round/:roundId/winner/:bps", () => {
    it("should find winner by BPS", async () => {
      const mockRanges = [
        {
          id: "event-1",
          roundId: "20165",
          userAddress: "0xUser1",
          ticketCount: 100000n,
          blockNumber: 1n,
          timestamp: 100,
          transactionHash: "0x1",
          logIndex: 1,
        },
      ];

      const mockRound = {
        id: "20165",
        ticketCountTotalBps: 100000n,
      };

      (db.query.ticketRanges.findMany as any).mockResolvedValue(mockRanges);
      (db.query.jackpotRounds.findFirst as any).mockResolvedValue(mockRound);

      const res = await app.request("/api/tickets/round/20165/winner/50000");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        winner: "0xUser1",
        winningBps: "50000",
      });
    });
  });

  describe("Error handling", () => {
    it("should handle invalid ticket number", async () => {
      const res = await app.request("/api/tickets/owner/20165/invalid");

      expect(res.status).toBe(500);
    });

    it("should handle missing parameters", async () => {
      const res = await app.request("/api/tickets/user/");
      expect(res.status).toBe(404);
    });
  });
});
