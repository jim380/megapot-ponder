import { ponder } from "ponder:registry";
import {
  users,
  tickets,
  jackpotRounds,
  withdrawals,
  feeDistributions,
  ticketRanges,
} from "ponder:schema";
import { ZERO_ADDRESS, BPS_DIVISOR, TICKET_PRICE } from "../utils/constants";
import { calculateReferralFee, generateEventId } from "../utils/calculations";
import { getCurrentRoundId } from "../types/schema";
import { ensureRoundExists, logCriticalError } from "../utils/ticket-numbering";
import { isFeatureEnabledForRound } from "../config/featureFlags";

ponder.on("BaseJackpot:UserTicketPurchase", async ({ event, context }) => {
  const { recipient, ticketsPurchasedTotalBps, referrer, buyer } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  const purchasePrice = (ticketsPurchasedTotalBps * TICKET_PRICE) / BPS_DIVISOR;

  if (ticketsPurchasedTotalBps === 0n) {
    await logCriticalError(
      context,
      eventId,
      `Invalid ticket purchase: 0 bps`,
      timestamp
    );
    return;
  }

  const roundId = getCurrentRoundId(timestamp);

  const isTicketNumberingEnabled = isFeatureEnabledForRound(
    roundId,
    "TICKET_NUMBERS_WRITE_ENABLED"
  );

  if (isTicketNumberingEnabled) {
    await ensureRoundExists(context, roundId, timestamp);

    await context.db
      .update(jackpotRounds, {
        id: roundId,
      })
      .set((current) => ({
        ticketCountTotalBps:
          current.ticketCountTotalBps + ticketsPurchasedTotalBps,
        updatedAt: timestamp,
      }));

    const startTicketBps = ticketsPurchasedTotalBps;
    const endTicketBps = ticketsPurchasedTotalBps;

    await context.db.insert(ticketRanges).values({
      id: eventId,
      roundId,
      userAddress: recipient,
      startTicketNumber: startTicketBps,
      endTicketNumber: endTicketBps,
      ticketCount: ticketsPurchasedTotalBps,
      blockNumber: BigInt(event.block.number),
      timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    });
  } else {
    console.log(
      `[FEATURE_FLAG] Ticket numbering DISABLED for round ${roundId} - skipping assignment`
    );
  }

  await context.db
    .insert(users)
    .values({
      id: recipient,
      ticketsPurchasedTotalBps,
      winningsClaimable: 0n,
      referralFeesClaimable: 0n,
      totalTicketsPurchased: ticketsPurchasedTotalBps / 10000n,
      totalWinnings: 0n,
      totalReferralFees: 0n,
      totalSpent: purchasePrice,
      isActive: true,
      isLP: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate((current) => ({
      ticketsPurchasedTotalBps:
        current.ticketsPurchasedTotalBps + ticketsPurchasedTotalBps,
      totalTicketsPurchased:
        current.totalTicketsPurchased + ticketsPurchasedTotalBps / 10000n,
      totalSpent: current.totalSpent + purchasePrice,
      isActive: true,
      updatedAt: timestamp,
    }));

  await context.db.insert(tickets).values({
    id: eventId,
    roundId: String(roundId),
    buyerAddress: buyer,
    recipientAddress: recipient,
    ticketsPurchasedBps: ticketsPurchasedTotalBps,
    referrerAddress: referrer,
    purchasePrice,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });

  if (referrer !== ZERO_ADDRESS) {
    await context.db
      .insert(users)
      .values({
        id: referrer,
        ticketsPurchasedTotalBps: 0n,
        winningsClaimable: 0n,
        referralFeesClaimable: 0n,
        totalTicketsPurchased: 0n,
        totalWinnings: 0n,
        totalReferralFees: 0n,
        totalSpent: 0n,
        isActive: true,
        isLP: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        isActive: true,
        updatedAt: timestamp,
      });
  }
});

ponder.on("BaseJackpot:UserWinWithdrawal", async ({ event, context }) => {
  const { user, amount } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  await context.db
    .insert(users)
    .values({
      id: user,
      ticketsPurchasedTotalBps: 0n,
      winningsClaimable: 0n,
      totalTicketsPurchased: 0n,
      totalWinnings: 0n,
      totalReferralFees: 0n,
      referralFeesClaimable: 0n,
      totalSpent: 0n,
      isActive: true,
      isLP: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate((current) => ({
      winningsClaimable:
        current.winningsClaimable > amount
          ? current.winningsClaimable - amount
          : 0n,
      totalWinnings: current.totalWinnings + amount,
      updatedAt: timestamp,
    }));

  await context.db.insert(withdrawals).values({
    id: eventId,
    userAddress: user,
    amount,
    withdrawalType: "WINNINGS",
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });
});

ponder.on(
  "BaseJackpot:UserReferralFeeWithdrawal",
  async ({ event, context }) => {
    const { user, amount } = event.args;
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const timestamp = Number(event.block.timestamp);

    await context.db
      .insert(users)
      .values({
        id: user,
        ticketsPurchasedTotalBps: 0n,
        winningsClaimable: 0n,
        referralFeesClaimable: 0n,
        totalTicketsPurchased: 0n,
        totalWinnings: 0n,
        totalReferralFees: 0n,
        totalSpent: 0n,
        isActive: true,
        isLP: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate((current) => ({
        referralFeesClaimable:
          current.referralFeesClaimable > amount
            ? current.referralFeesClaimable - amount
            : 0n,
        totalReferralFees: current.totalReferralFees + amount,
        updatedAt: timestamp,
      }));

    await context.db.insert(withdrawals).values({
      id: eventId,
      userAddress: user,
      amount,
      withdrawalType: "REFERRAL_FEES",
      transactionHash: event.transaction.hash,
      blockNumber: BigInt(event.block.number),
      timestamp,
    });
  }
);

ponder.on("BaseJackpot:ProtocolFeeWithdrawal", async ({ event, context }) => {
  const { amount } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  await context.db.insert(withdrawals).values({
    id: eventId,
    userAddress: ZERO_ADDRESS,
    amount,
    withdrawalType: "PROTOCOL_FEE",
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });

  await context.db.insert(feeDistributions).values({
    id: eventId,
    roundId: "0",
    recipientAddress: ZERO_ADDRESS,
    amount,
    feeType: "PROTOCOL_FEE",
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });
});
