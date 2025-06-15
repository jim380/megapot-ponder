import { vi } from "vitest";
import { createMockDb } from "./db";

export type MockDatabase = {
  User: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  Round: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  TicketPurchase: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  LiquidityProvider: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  LpAction: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  WinWithdrawal: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  ReferralFeeWithdrawal: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  ProtocolFeeWithdrawal: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  LpSnapshot: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  HourlyAggregation: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

export type MockPonderContext = {
  db: ReturnType<typeof createMockDb>;
  network: {
    name: string;
    chainId: number;
  };
  contracts: {
    BaseJackpot: {
      address: `0x${string}`;
      abi: any[];
    };
  };
  client: {
    readContract: ReturnType<typeof vi.fn>;
  };
};

export const createMockContext = (): MockPonderContext => ({
  db: createMockDb(),
  network: {
    name: "base",
    chainId: 8453,
  },
  contracts: {
    BaseJackpot: {
      address: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13",
      abi: [],
    },
  },
  client: {
    readContract: vi.fn(),
  },
});

export interface MockEventOptions {
  name: string;
  args: Record<string, any>;
  blockNumber?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}

export const createMockEvent = (options: MockEventOptions) => {
  const {
    name,
    args,
    blockNumber = 27077440n,
    blockTimestamp = BigInt(Math.floor(Date.now() / 1000)),
    transactionHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    logIndex = 0,
  } = options;

  return {
    name,
    args,
    log: {
      blockNumber,
      blockHash:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      transactionIndex: 0,
      removed: false,
      address: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13",
      data: "0x",
      topics: [],
      transactionHash,
      logIndex,
    },
    block: {
      number: blockNumber,
      timestamp: blockTimestamp,
      hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    },
    transaction: {
      hash: transactionHash,
      from: "0x1111111111111111111111111111111111111111",
      to: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13",
      value: 0n,
    },
  };
};
