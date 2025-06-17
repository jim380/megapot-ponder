import { onchainTable, index } from "ponder";

export type RoundStatus = "ACTIVE" | "DRAWING" | "RESOLVED" | "NEEDS_RECONCILIATION";
export type LpActionType = "DEPOSIT" | "WITHDRAWAL" | "RISK_ADJUSTMENT";
export type FeeType = "LP_FEE" | "REFERRAL_FEE" | "PROTOCOL_FEE";

export const users = onchainTable(
  "users",
  (t) => ({
    id: t.text().primaryKey(),
    ticketsPurchasedTotalBps: t.bigint().notNull().default(0n),
    winningsClaimable: t.bigint().notNull().default(0n),
    referralFeesClaimable: t.bigint().notNull().default(0n),
    totalTicketsPurchased: t.bigint().notNull().default(0n),
    totalWinnings: t.bigint().notNull().default(0n),
    totalReferralFees: t.bigint().notNull().default(0n),
    totalSpent: t.bigint().notNull().default(0n),
    isActive: t.boolean().notNull().default(false),
    isLP: t.boolean().notNull().default(false),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    activeIdx: index().on(table.isActive),
    lpIdx: index().on(table.isLP),
  })
);

export const liquidityProviders = onchainTable(
  "liquidityProviders",
  (t) => ({
    id: t.text().primaryKey(),
    principal: t.bigint().notNull().default(0n),
    stake: t.bigint().notNull().default(0n),
    riskPercentage: t.integer().notNull(),
    effectiveStake: t.bigint().notNull().default(0n),
    isActive: t.boolean().notNull().default(false),
    totalDeposited: t.bigint().notNull().default(0n),
    totalWithdrawn: t.bigint().notNull().default(0n),
    totalFeesEarned: t.bigint().notNull().default(0n),
    lastActionAt: t.integer().notNull(),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    activeIdx: index().on(table.isActive),
    stakeIdx: index().on(table.stake),
  })
);

export const jackpotRounds = onchainTable(
  "jackpotRounds",
  (t) => ({
    id: t.text().primaryKey(),
    status: t.text().$type<RoundStatus>().notNull().default("ACTIVE"),
    startTime: t.integer().notNull(),
    endTime: t.integer(),
    totalTicketsValue: t.bigint().notNull().default(0n),
    totalLpSupplied: t.bigint().notNull().default(0n),
    jackpotAmount: t.bigint().notNull().default(0n),
    ticketCountTotalBps: t.bigint().notNull().default(0n),
    nextTicketNumber: t.bigint().notNull().default(1n),
    version: t.bigint().notNull().default(0n),
    randomNumber: t.text(),
    winnerAddress: t.text(),
    winningTicketNumber: t.bigint(),
    lpFeesGenerated: t.bigint().notNull().default(0n),
    referralFeesGenerated: t.bigint().notNull().default(0n),
    protocolFeesGenerated: t.bigint().notNull().default(0n),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
    startTimeIdx: index().on(table.startTime),
    endTimeIdx: index().on(table.endTime),
    activeRoundsIdx: index().on(table.status, table.startTime),
    versionIdx: index().on(table.version),
  })
);

export const tickets = onchainTable(
  "tickets",
  (t) => ({
    id: t.text().primaryKey(),
    roundId: t.text().notNull(),
    buyerAddress: t.text().notNull(),
    recipientAddress: t.text().notNull(),
    referrerAddress: t.text(),
    ticketsPurchasedBps: t.bigint().notNull(),
    purchasePrice: t.bigint().notNull(),
    transactionHash: t.text().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({
    roundIdx: index().on(table.roundId),
    buyerIdx: index().on(table.buyerAddress),
    recipientIdx: index().on(table.recipientAddress),
    referrerIdx: index().on(table.referrerAddress),
    blockIdx: index().on(table.blockNumber),
  })
);

export const lpActions = onchainTable(
  "lpActions",
  (t) => ({
    id: t.text().primaryKey(),
    lpAddress: t.text().notNull(),
    actionType: t.text().$type<LpActionType>().notNull(),
    amount: t.bigint(),
    riskPercentage: t.integer(),
    effectiveRoundId: t.text(),
    transactionHash: t.text().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({
    lpIdx: index().on(table.lpAddress),
    typeIdx: index().on(table.actionType),
    roundIdx: index().on(table.effectiveRoundId),
    blockIdx: index().on(table.blockNumber),
  })
);

export const lpRoundSnapshots = onchainTable(
  "lpRoundSnapshots",
  (t) => ({
    id: t.text().primaryKey(),
    lpAddress: t.text().notNull(),
    roundId: t.text().notNull(),
    beginningPrincipal: t.bigint().notNull(),
    beginningStake: t.bigint().notNull(),
    endingPrincipal: t.bigint().notNull(),
    endingStake: t.bigint().notNull(),
    activeRiskPercentage: t.integer().notNull(),
    feesEarned: t.bigint().notNull().default(0n),
    profitLoss: t.bigint().notNull().default(0n),
    createdAt: t.integer().notNull(),
  }),
  (table) => ({
    lpIdx: index().on(table.lpAddress),
    roundIdx: index().on(table.roundId),
    lpRoundIdx: index().on(table.lpAddress, table.roundId),
  })
);

export const feeDistributions = onchainTable(
  "feeDistributions",
  (t) => ({
    id: t.text().primaryKey(),
    roundId: t.text().notNull(),
    recipientAddress: t.text().notNull(),
    amount: t.bigint().notNull(),
    feeType: t.text().$type<FeeType>().notNull(),
    transactionHash: t.text(),
    blockNumber: t.bigint(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({
    roundIdx: index().on(table.roundId),
    recipientIdx: index().on(table.recipientAddress),
    typeIdx: index().on(table.feeType),
    blockIdx: index().on(table.blockNumber),
  })
);

export const referrals = onchainTable(
  "referrals",
  (t) => ({
    id: t.text().primaryKey(),
    referrerAddress: t.text().notNull(),
    referredAddress: t.text().notNull(),
    totalTicketsPurchased: t.bigint().notNull().default(0n),
    totalFeesGenerated: t.bigint().notNull().default(0n),
    firstPurchaseAt: t.integer().notNull(),
    lastPurchaseAt: t.integer().notNull(),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    referrerIdx: index().on(table.referrerAddress),
    referredIdx: index().on(table.referredAddress),
  })
);

export const withdrawals = onchainTable(
  "withdrawals",
  (t) => ({
    id: t.text().primaryKey(),
    userAddress: t.text().notNull(),
    amount: t.bigint().notNull(),
    withdrawalType: t.text().notNull(),
    transactionHash: t.text().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (table) => ({
    userIdx: index().on(table.userAddress),
    typeIdx: index().on(table.withdrawalType),
    blockIdx: index().on(table.blockNumber),
  })
);

export const hourlyStats = onchainTable(
  "hourlyStats",
  (t) => ({
    id: t.text().primaryKey(),
    hourTimestamp: t.integer().notNull(),
    totalTicketsSold: t.bigint().notNull().default(0n),
    totalTicketsValue: t.bigint().notNull().default(0n),
    uniquePlayers: t.integer().notNull().default(0),
    totalLpDeposits: t.bigint().notNull().default(0n),
    totalLpWithdrawals: t.bigint().notNull().default(0n),
    totalLpFeesGenerated: t.bigint().notNull().default(0n),
    totalReferralFeesGenerated: t.bigint().notNull().default(0n),
    totalProtocolFeesGenerated: t.bigint().notNull().default(0n),
    roundsCompleted: t.integer().notNull().default(0),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
  }),
  (table) => ({
    hourIdx: index().on(table.hourTimestamp),
  })
);

export const ticketRanges = onchainTable(
  "ticketRanges",
  (t) => ({
    id: t.text().primaryKey(),
    roundId: t.text().notNull(),
    userAddress: t.text().notNull(),
    startTicketNumber: t.bigint().notNull(),
    endTicketNumber: t.bigint().notNull(),
    ticketCount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    transactionHash: t.text().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({
    roundIdx: index().on(table.roundId),
    userIdx: index().on(table.userAddress),
    winnerLookupIdx: index().on(
      table.roundId,
      table.startTicketNumber,
      table.endTicketNumber
    ),
    userRoundIdx: index().on(table.userAddress, table.roundId),
  })
);

export const ticketIntegrityChecks = onchainTable(
  "ticketIntegrityChecks",
  (t) => ({
    id: t.text().primaryKey(),
    roundId: t.text().notNull(),
    checkTime: t.integer().notNull(),
    hasGaps: t.boolean().notNull(),
    expectedCount: t.bigint().notNull(),
    actualCount: t.bigint().notNull(),
    isValid: t.boolean().notNull(),
    errorDetails: t.text(),
    severity: t.text().notNull().default("INFO"),
  }),
  (table) => ({
    roundIdx: index().on(table.roundId),
    severityIdx: index().on(table.severity),
    checkTimeIdx: index().on(table.checkTime),
  })
);

export const ticketFailures = onchainTable(
  "ticketFailures",
  (t) => ({
    id: t.text().primaryKey(),
    roundId: t.text().notNull(),
    userAddress: t.text().notNull(),
    ticketsPurchasedTotalBps: t.bigint().notNull(),
    eventId: t.text().notNull(),
    errorMessage: t.text().notNull(),
    retryCount: t.integer().notNull().default(0),
    maxRetries: t.integer().notNull().default(3),
    status: t
      .text()
      .$type<"pending" | "processing" | "failed" | "recovered">()
      .notNull()
      .default("pending"),
    createdAt: t.integer().notNull(),
    updatedAt: t.integer().notNull(),
    recoveredAt: t.integer(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
    createdAtIdx: index().on(table.createdAt),
    roundUserIdx: index().on(table.roundId, table.userAddress),
  })
);
