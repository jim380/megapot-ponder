import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { validateMCPToolCall, validateToolParameters } from "../validation/index.js";
import { getAvailableTools, getToolSchema } from "../schemas/index.js";

async function exampleDirectValidation() {
  console.log("=== Example 1: Direct Parameter Validation ===\n");

  const validParams = {
    first: 20,
    skip: 0,
    orderBy: "totalWinnings",
    orderDirection: "desc",
    where: {
      isActive: true,
      totalWinnings_gt: "1000000",
    },
  };

  const validResult = validateToolParameters("queryUsers", validParams);
  console.log("Valid parameters:", validResult.valid);
  console.log("Validated data:", validResult.data);

  const invalidParams = {
    first: 2000,
    orderBy: "invalidField",
    where: {
      isActive: "yes",
      unknownField: "value",
    },
  };

  const invalidResult = validateToolParameters("queryUsers", invalidParams);
  console.log("\nInvalid parameters:", invalidResult.valid);
  console.log("Validation errors:", invalidResult.errors);
}

async function exampleMCPValidation() {
  console.log("\n=== Example 2: MCP Request Validation ===\n");

  const validRequest: CallToolRequest = {
    method: "tools/call",
    params: {
      name: "getUserStats",
      arguments: {
        address: "0x1234567890123456789012345678901234567890",
      },
    },
  } as CallToolRequest;

  try {
    const result = await validateMCPToolCall(validRequest);
    console.log("Tool name:", result.toolName);
    console.log("Validated params:", result.validatedParams);
  } catch (error) {
    console.error("Validation failed:", error);
  }

  const invalidRequest: CallToolRequest = {
    method: "tools/call",
    params: {
      name: "getUserStats",
      arguments: {
        address: "0xINVALID",
      },
    },
  } as CallToolRequest;

  try {
    await validateMCPToolCall(invalidRequest);
  } catch (error: any) {
    console.log("\nExpected validation error:");
    console.log("Error code:", error.code);
    console.log("Error message:", error.message);
    console.log("Error details:", error.details);
  }
}

async function exampleComplexQuery() {
  console.log("\n=== Example 3: Complex Query Validation ===\n");

  const complexQuery = {
    first: 50,
    skip: 100,
    orderBy: "timestamp",
    orderDirection: "desc",
    where: {
      roundId: "round-123",
      buyerAddress: "0xabcdef1234567890123456789012345678901234",
      recipientAddress: "0x1234567890abcdef123456789012345678901234",
      timestamp_gte: 1700000000,
      timestamp_lte: 1800000000,
    },
  };

  const result = validateToolParameters("queryTickets", complexQuery);
  console.log("Complex query valid:", result.valid);
  if (result.valid) {
    console.log("All filters validated successfully");
  }
}

function exampleSchemaIntrospection() {
  console.log("\n=== Example 4: Schema Introspection ===\n");

  const tools = getAvailableTools();
  console.log("Available tools:", tools);

  const schema = getToolSchema("getLeaderboard");
  if (schema) {
    console.log("\ngetLeaderboard schema:");
    console.log("Required fields:", schema.required);
    console.log("Properties:", Object.keys(schema.properties || {}));

    // @ts-ignore - accessing nested schema properties
    const typeProperty = schema.properties?.type as any;
    if (typeProperty && "enum" in typeProperty) {
      console.log("Allowed types:", typeProperty.enum);
    }
  }
}

async function exampleErrorHandling() {
  console.log("\n=== Example 5: Error Handling ===\n");

  const testCases = [
    {
      tool: "queryUsers",
      params: { first: "not-a-number" },
      description: "Invalid type",
    },
    {
      tool: "getLeaderboard",
      params: { type: "invalid-type" },
      description: "Invalid enum value",
    },
    {
      tool: "queryLPs",
      params: { where: { riskPercentage_gte: 150 } },
      description: "Value out of range",
    },
    {
      tool: "getUserStats",
      params: {},
      description: "Missing required field",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\nTesting: ${testCase.description}`);
    const result = validateToolParameters(testCase.tool, testCase.params);

    if (!result.valid && result.errors) {
      for (const error of result.errors) {
        console.log(`  Field: ${error.field}`);
        console.log(`  Error: ${error.message}`);
        if (error.allowedValues) {
          console.log(`  Allowed: ${error.allowedValues.join(", ")}`);
        }
      }
    }
  }
}

async function runExamples() {
  await exampleDirectValidation();
  await exampleMCPValidation();
  await exampleComplexQuery();
  exampleSchemaIntrospection();
  await exampleErrorHandling();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export {
  exampleDirectValidation,
  exampleMCPValidation,
  exampleComplexQuery,
  exampleSchemaIntrospection,
  exampleErrorHandling,
};
