import { describe, test, expect } from "@jest/globals";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { validateMCPToolCall, validateToolParameters } from "../middleware.js";
import { getAvailableTools } from "../../schemas/tool-schemas.js";
import { MCPError } from "../../errors/index.js";

describe("Schema Validation Middleware", () => {
  describe("validateToolParameters", () => {
    test("should validate queryUsers parameters successfully", () => {
      const params = {
        first: 10,
        skip: 0,
        orderBy: "totalWinnings",
        orderDirection: "desc",
        where: {
          isActive: true,
          totalWinnings_gt: "1000000",
        },
      };

      const result = validateToolParameters("queryUsers", params);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(params);
    });

    test("should reject invalid pagination values", () => {
      const params = {
        first: 2000,
        skip: -1,
      };

      const result = validateToolParameters("queryUsers", params);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    test("should reject invalid orderBy field", () => {
      const params = {
        orderBy: "invalidField",
      };

      const result = validateToolParameters("queryUsers", params);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);

      const errors = result.errors!;
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.message).toContain("Invalid value");
    });

    test("should validate Ethereum addresses", () => {
      const validParams = {
        address: "0x1234567890123456789012345678901234567890",
      };

      const invalidParams = {
        address: "0xinvalid",
      };

      const validResult = validateToolParameters("getUserStats", validParams);
      expect(validResult.valid).toBe(true);

      const invalidResult = validateToolParameters("getUserStats", invalidParams);
      expect(invalidResult.valid).toBe(false);
    });

    test("should handle tools with no parameters", () => {
      const result = validateToolParameters("getCurrentRound", {});
      expect(result.valid).toBe(true);
    });

    test("should remove additional properties and succeed", () => {
      const params = {
        unknownField: "value",
      };

      const result = validateToolParameters("getCurrentRound", params);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({});
    });
  });

  describe("validateMCPToolCall", () => {
    test("should validate MCP request format", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "queryUsers",
          arguments: {
            first: 20,
            orderBy: "createdAt",
            orderDirection: "desc",
          },
        },
      } as CallToolRequest;

      const result = await validateMCPToolCall(request);
      expect(result.toolName).toBe("queryUsers");
      expect(result.validatedParams).toEqual(request.params.arguments);
    });

    test("should handle missing arguments gracefully", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "getCurrentRound",
          arguments: undefined,
        },
      } as CallToolRequest;

      const result = await validateMCPToolCall(request);
      expect(result.toolName).toBe("getCurrentRound");
      expect(result.validatedParams).toEqual({});
    });

    test("should throw MCPError for validation failures", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "queryUsers",
          arguments: {
            first: "not-a-number",
          },
        },
      } as CallToolRequest;

      await expect(validateMCPToolCall(request)).rejects.toThrow(MCPError);
    });

    test("should throw error for unknown tools", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "unknownTool",
          arguments: {},
        },
      } as CallToolRequest;

      await expect(validateMCPToolCall(request)).rejects.toThrow(MCPError);
    });
  });

  describe("Schema Coverage", () => {
    test("all tools should have schemas defined", () => {
      const tools = getAvailableTools();

      expect(tools).toContain("queryUsers");
      expect(tools).toContain("queryRounds");
      expect(tools).toContain("queryTickets");
      expect(tools).toContain("queryLPs");
      expect(tools).toContain("getCurrentRound");
      expect(tools).toContain("getProtocolStats");
      expect(tools).toContain("getUserStats");
      expect(tools).toContain("getLpStats");
      expect(tools).toContain("getLeaderboard");
      expect(tools).toContain("getHourlyStats");
    });
  });

  describe("Complex Query Validation", () => {
    test("should validate complex queryTickets with all filters", () => {
      const params = {
        first: 50,
        skip: 100,
        orderBy: "timestamp",
        orderDirection: "desc",
        where: {
          roundId: "round-123",
          buyerAddress: "0x1234567890123456789012345678901234567890",
          timestamp_gte: 1700000000,
          timestamp_lte: 1800000000,
        },
      };

      const result = validateToolParameters("queryTickets", params);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(params);
    });

    test("should validate getHourlyStats with time range", () => {
      const params = {
        startTime: 1700000000,
        endTime: 1700086400,
        first: 24,
      };

      const result = validateToolParameters("getHourlyStats", params);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(params);
    });

    test("should validate getLeaderboard parameters", () => {
      const params = {
        type: "users",
        first: 25,
      };

      const result = validateToolParameters("getLeaderboard", params);
      expect(result.valid).toBe(true);

      const invalidParams = {
        type: "invalid-type",
        first: 10,
      };

      const invalidResult = validateToolParameters("getLeaderboard", invalidParams);
      expect(invalidResult.valid).toBe(false);
    });
  });
});
