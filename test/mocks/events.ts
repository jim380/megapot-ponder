import { createMockEvent } from "./context";

export const createUserTicketPurchaseEvent = (overrides?: {
  recipient?: string;
  ticketsPurchasedTotalBps?: bigint;
  referrer?: string;
  buyer?: string;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:UserTicketPurchase",
    args: {
      recipient:
        overrides?.recipient || "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ticketsPurchasedTotalBps: overrides?.ticketsPurchasedTotalBps || 100n,
      referrer:
        overrides?.referrer || "0x0000000000000000000000000000000000000000",
      buyer: overrides?.buyer || "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpDepositEvent = (overrides?: {
  user?: string;
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpDeposit",
    args: {
      lpAddress: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      amount: overrides?.amount || 1000000n,
      riskPercentage: 100n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpPrincipalWithdrawalEvent = (overrides?: {
  user?: string;
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpPrincipalWithdrawal",
    args: {
      lpAddress: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      principalAmount: overrides?.amount || 500000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpStakeWithdrawalEvent = (overrides?: {
  user?: string;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpStakeWithdrawal",
    args: {
      lpAddress: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpRiskPercentageAdjustmentEvent = (overrides?: {
  user?: string;
  newRiskPercentage?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpRiskPercentageAdjustment",
    args: {
      lpAddress: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      riskPercentage: overrides?.newRiskPercentage || 75n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpRebalanceEvent = (overrides?: {
  user?: string;
  principal?: bigint;
  stake?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpRebalance",
    args: {
      lpAddress: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      principal: overrides?.principal || 1000000n,
      stake: overrides?.stake || 100000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createUserWinWithdrawalEvent = (overrides?: {
  user?: string;
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:UserWinWithdrawal",
    args: {
      user: overrides?.user || "0xdddddddddddddddddddddddddddddddddddddddd",
      amount: overrides?.amount || 10000000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createUserReferralFeeWithdrawalEvent = (overrides?: {
  user?: string;
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:UserReferralFeeWithdrawal",
    args: {
      user: overrides?.user || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      amount: overrides?.amount || 10000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createProtocolFeeWithdrawalEvent = (overrides?: {
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:ProtocolFeeWithdrawal",
    args: {
      amount: overrides?.amount || 50000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createJackpotRunRequestedEvent = (overrides?: {
  user?: string;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:JackpotRunRequested",
    args: {
      user: overrides?.user || "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createEntropyResultEvent = (overrides?: {
  sequenceNumber?: bigint;
  randomNumber?: `0x${string}`;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:EntropyResult",
    args: {
      sequenceNumber: overrides?.sequenceNumber || 12345n,
      randomNumber: overrides?.randomNumber || "0xdeadbeef",
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createJackpotRunEvent = (overrides?: {
  time?: bigint;
  winner?: string;
  winningTicket?: bigint;
  winAmount?: bigint;
  ticketsPurchasedTotalBps?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:JackpotRun",
    args: {
      time: overrides?.time || 1700000000n,
      winner: overrides?.winner || "0xffffffffffffffffffffffffffffffffffffffff",
      winningTicket: overrides?.winningTicket || 42n,
      winAmount: overrides?.winAmount || 1000000n,
      ticketsPurchasedTotalBps: overrides?.ticketsPurchasedTotalBps || 100000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};
