import { describe, test, expect } from "@jest/globals";
import { buildResourceUri, parseResourceUri } from "../../src/types/index.js";
import { bigIntToHex, hexToBigInt } from "../../src/utils/bigint.js";

describe("MCP Integration Tests", () => {
  describe("URI Parsing", () => {
    test("should correctly parse resource URIs", () => {
      const testCases = [
        { uri: "megapot://users/user123", expected: { type: "user", id: "user123" } },
        { uri: "megapot://rounds/42", expected: { type: "round", id: "42" } },
        {
          uri: "megapot://stats/hourly/1640995200",
          expected: { type: "stats", id: "hourly/1640995200" },
        },
      ];

      testCases.forEach(({ uri, expected }) => {
        const result = parseResourceUri(uri);
        expect(result).toEqual(expected);
      });
    });

    test("should build correct resource URIs", () => {
      expect(buildResourceUri.user("user123")).toBe("megapot://users/user123");
      expect(buildResourceUri.round("42")).toBe("megapot://rounds/42");
      expect(buildResourceUri.stats("hourly/1640995200")).toBe("megapot://stats/hourly/1640995200");
    });

    test("should handle invalid URIs", () => {
      const result = parseResourceUri("invalid://test/123");
      expect(result).toBeNull();
    });
  });

  describe("BigInt Utilities", () => {
    test("should convert BigInt to hex and back", () => {
      const testValue = 1000000n;
      const hex = bigIntToHex(testValue);
      const converted = hexToBigInt(hex);
      
      expect(hex).toBe("0xf4240");
      expect(converted).toBe(testValue);
    });

    test("should handle zero values", () => {
      expect(bigIntToHex(0n)).toBe("0x0");
      expect(hexToBigInt("0x0")).toBe(0n);
    });
  });
});