import { describe, it, expect } from "@jest/globals";
import { calculateQueryComplexity, validateQueryComplexity } from "../complexity.js";
import { parse } from "graphql";

describe("GraphQL Complexity Analysis", () => {
  describe("Basic Complexity Calculation", () => {
    it("should calculate complexity for simple queries", () => {
      const simpleQuery = parse(`
        query {
          user(id: "test") {
            id
            totalWinnings
          }
        }
      `);

      const result = calculateQueryComplexity(simpleQuery);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.fieldCount).toBeGreaterThan(0);
      expect(result.details.maxDepth).toBeGreaterThan(0);
    });

    it("should handle nested queries with higher complexity", () => {
      const nestedQuery = parse(`
        query {
          user(id: "test") {
            id
            tickets {
              id
              round {
                id
                jackpotAmount
              }
            }
          }
        }
      `);

      const result = calculateQueryComplexity(nestedQuery);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.maxDepth).toBeGreaterThan(1);
    });

    it("should handle list queries with pagination", () => {
      const listQuery = parse(`
        query {
          users(first: 10) {
            id
            totalWinnings
          }
        }
      `);

      const result = calculateQueryComplexity(listQuery);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.listFields).toBeGreaterThan(0);
    });
  });

  describe("Fragment Handling", () => {
    it("should handle fragment spreads", () => {
      const fragmentQuery = parse(`
        fragment UserFields on User {
          id
          totalWinnings
          winningsClaimable
        }
        
        query {
          user(id: "test") {
            ...UserFields
          }
        }
      `);

      const result = calculateQueryComplexity(fragmentQuery);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should handle inline fragments", () => {
      const inlineFragmentQuery = parse(`
        query {
          user(id: "test") {
            id
            ... on User {
              totalWinnings
              tickets {
                id
              }
            }
          }
        }
      `);

      const result = calculateQueryComplexity(inlineFragmentQuery);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe("Subscription Complexity", () => {
    it("should calculate subscription complexity", () => {
      const subscription = parse(`
        subscription {
          userBalanceUpdated(userId: "test") {
            id
            winningsClaimable
          }
        }
      `);

      const result = calculateQueryComplexity(subscription);
      expect(result.score).toBeGreaterThan(50);
    });
  });

  describe("Introspection Queries", () => {
    it("should handle introspection with high cost", () => {
      const introspectionQuery = parse(`
        query {
          __schema {
            types {
              name
            }
          }
        }
      `);

      const result = calculateQueryComplexity(introspectionQuery);
      expect(result.score).toBeGreaterThan(100);
    });
  });

  describe("Query Validation", () => {
    it("should validate queries under complexity limit", () => {
      const simpleQuery = parse(`
        query {
          user(id: "test") {
            id
          }
        }
      `);

      const validation = validateQueryComplexity(simpleQuery, 1000);
      expect(validation.valid).toBe(true);
      expect(validation.complexity.score).toBeLessThan(1000);
    });

    it("should reject queries over complexity limit", () => {
      const complexQuery = parse(`
        query {
          users(first: 1000) {
            id
            tickets(first: 100) {
              id
              round {
                id
                tickets(first: 100) {
                  id
                  buyer {
                    id
                    tickets(first: 100) {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const validation = validateQueryComplexity(complexQuery, 100);
      expect(validation.valid).toBe(false);
      expect(validation.message).toContain("complexity");
    });
  });

  describe("Custom Field Costs", () => {
    it("should apply custom field costs", () => {
      const expensiveQuery = parse(`
        query {
          protocolStats {
            totalTicketsSold
            totalJackpotsPaid
          }
        }
      `);

      const result = calculateQueryComplexity(expensiveQuery);
      expect(result.score).toBeGreaterThan(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty selection sets", () => {
      const emptyQuery = parse(`
        query {
          __typename
        }
      `);

      const result = calculateQueryComplexity(emptyQuery);
      expect(result.score).toBeGreaterThan(0);
    });

    it("should handle mutations", () => {
      const mutation = parse(`
        mutation {
          __typename
        }
      `);

      const result = calculateQueryComplexity(mutation);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe("Complexity Details", () => {
    it("should provide detailed complexity breakdown", () => {
      const query = parse(`
        query {
          users(first: 5) {
            id
            tickets {
              id
            }
          }
        }
      `);

      const result = calculateQueryComplexity(query);

      expect(result.details).toHaveProperty("fieldCount");
      expect(result.details).toHaveProperty("maxDepth");
      expect(result.details).toHaveProperty("listFields");
      expect(result.details).toHaveProperty("customCosts");

      expect(result.details.fieldCount).toBeGreaterThan(0);
      expect(result.details.maxDepth).toBeGreaterThan(0);
      expect(result.details.listFields).toBeGreaterThan(0);
    });
  });
});
