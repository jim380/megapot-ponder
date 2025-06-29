import {
  type User,
  type JackpotRound,
  type QueryUsersParams,
  type MegapotResponse,
  RoundStatus,
  ToolName,
  buildResourceUri,
  parseResourceUri,
  isValidAddress,
} from "../types/index.js";

import {
  bigIntToHex,
  serializeBigInt,
  stringifyWithBigInt,
  parseWithBigInt,
} from "../utils/index.js";

import { ResourceNotFoundError, InvalidParametersError, mapGraphQLError } from "../errors/index.js";

function exampleBigIntHandling() {
  const user: User = {
    id: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49",
    ticketsPurchasedTotalBps: 150000n,
    winningsClaimable: 5000000000000000000n,
    referralFeesClaimable: 100000000000000000n,
    totalTicketsPurchased: 25n,
    totalWinnings: 10000000000000000000n,
    totalReferralFees: 500000000000000000n,
    isActive: true,
    isLP: false,
    createdAt: 1704067200,
    updatedAt: 1704153600,
  };

  const serialized = serializeBigInt(user);
  console.log("Serialized user:", JSON.stringify(serialized, null, 2));

  const jsonString = stringifyWithBigInt(user);
  console.log("JSON string:", jsonString);

  const deserialized = parseWithBigInt(jsonString);
  console.log("Deserialized user:", deserialized);
}

function exampleResourceUris() {
  const userUri = buildResourceUri.user("0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49");
  const roundUri = buildResourceUri.round("42");
  const statsUri = buildResourceUri.stats("protocol");

  console.log("User URI:", userUri);
  console.log("Round URI:", roundUri);
  console.log("Stats URI:", statsUri);

  const parsed = parseResourceUri(userUri);
  if (parsed) {
    console.log("Parsed:", parsed);
  }
}

function exampleQueryValidation(params: unknown) {
  try {
    const address = (params as any).address;
    if (!isValidAddress(address)) {
      throw new InvalidParametersError("address", "Invalid Ethereum address", address);
    }

    const queryParams: QueryUsersParams = {
      first: 100,
      skip: 0,
      orderBy: "totalWinnings",
      orderDirection: "desc",
      where: {
        isActive: true,
        totalWinnings_gt: bigIntToHex(1000000000000000000n),
      },
    };

    console.log("Valid query params:", queryParams);
  } catch (error) {
    console.error("Validation error:", error);
  }
}

async function exampleErrorHandling() {
  try {
    throw new Error("GraphQL query failed");
  } catch (error) {
    const mcpError = mapGraphQLError(error);

    console.error("MCP Error:", {
      code: mcpError.code,
      message: mcpError.message,
      details: mcpError.details,
    });

    const errorResponse: MegapotResponse<null> = {
      data: null,
      metadata: {
        timestamp: Date.now(),
        executionTime: 0,
      },
    };

    return errorResponse;
  }
}

function exampleRoundHandling() {
  const activeRound: JackpotRound = {
    id: "42",
    status: RoundStatus.ACTIVE,
    startTime: 1704067200,
    totalTicketsValue: 5000000000000000000n,
    totalLpSupplied: 100000000000000000000n,
    jackpotAmount: 4500000000000000000n,
    ticketCountTotalBps: 50000n,
    lpFeesGenerated: 250000000000000000n,
    referralFeesGenerated: 150000000000000000n,
    protocolFeesGenerated: 100000000000000000n,
    createdAt: 1704067200,
    updatedAt: 1704067200,
  };

  if (activeRound.status !== RoundStatus.ACTIVE) {
    throw new ResourceNotFoundError("JackpotRound", activeRound.id);
  }

  const response: MegapotResponse<typeof activeRound> = {
    data: activeRound,
    metadata: {
      timestamp: Date.now(),
      executionTime: 15,
    },
  };

  console.log("Round response:", stringifyWithBigInt(response, 2));
}

function exampleToolUsage() {
  const toolParams = {
    tool: ToolName.QUERY_USERS,
    params: {
      first: 10,
      orderBy: "totalWinnings",
      orderDirection: "desc",
      where: {
        isActive: true,
        isLP: false,
      },
    } satisfies QueryUsersParams,
  };

  console.log("Tool invocation:", toolParams);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("=== BigInt Handling Example ===");
  exampleBigIntHandling();

  console.log("\n=== Resource URI Example ===");
  exampleResourceUris();

  console.log("\n=== Query Validation Example ===");
  exampleQueryValidation({ address: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA49" });

  console.log("\n=== Error Handling Example ===");
  exampleErrorHandling();

  console.log("\n=== Round Handling Example ===");
  exampleRoundHandling();

  console.log("\n=== Tool Usage Example ===");
  exampleToolUsage();
}
