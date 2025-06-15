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
      user: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      amount: overrides?.amount || 1000000n,
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
      user: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      amount: overrides?.amount || 500000n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpStakeWithdrawalEvent = (overrides?: {
  user?: string;
  amount?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpStakeWithdrawal",
    args: {
      user: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      amount: overrides?.amount || 50000n,
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
      user: overrides?.user || "0xcccccccccccccccccccccccccccccccccccccccc",
      newRiskPercentage: overrides?.newRiskPercentage || 75n,
    },
    blockTimestamp: overrides?.blockTimestamp,
    transactionHash: overrides?.transactionHash,
    logIndex: overrides?.logIndex,
  });
};

export const createLpRebalanceEvent = (overrides?: {
  totalRebalanced?: bigint;
  blockTimestamp?: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
}) => {
  return createMockEvent({
    name: "BaseJackpot:LpRebalance",
    args: {
      totalRebalanced: overrides?.totalRebalanced || 100000n,
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
