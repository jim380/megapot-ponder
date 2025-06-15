import { vi } from "vitest";
import { createMockDbV11 } from "./db-v11";

export type MockPonderContext = {
  db: ReturnType<typeof createMockDbV11>;
};

export const createMockContext = (): MockPonderContext => ({
  db: createMockDbV11(),
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
    transactionHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
    logIndex = 0,
  } = options;

  return {
    name,
    args,
    log: {
      blockNumber,
      blockHash:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
      address: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13" as `0x${string}`,
      data: "0x" as `0x${string}`,
      topics: [],
      transactionHash,
      logIndex,
    },
    block: {
      number: blockNumber,
      timestamp: blockTimestamp,
      hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`,
    },
    transaction: {
      hash: transactionHash,
      from: "0x1111111111111111111111111111111111111111" as `0x${string}`,
      to: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13" as `0x${string}`,
      value: 0n,
    },
  };
};