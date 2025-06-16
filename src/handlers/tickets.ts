import { ponder } from "ponder:registry";
import {
  users,
  tickets,
  jackpotRounds,
  withdrawals,
  feeDistributions,
} from "ponder:schema";
import { ZERO_ADDRESS, BPS_DIVISOR, TICKET_PRICE } from "../utils/constants";
import { calculateReferralFee, generateEventId } from "../utils/calculations";

ponder.on("BaseJackpot:UserTicketPurchase", async ({ event, context }) => {
  const { recipient, ticketsPurchasedTotalBps, referrer, buyer } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  const purchasePrice = (ticketsPurchasedTotalBps * TICKET_PRICE) / BPS_DIVISOR;

  const currentRound = await getCurrentRound(context, timestamp);
  if (!currentRound) {
    console.error("No active round found for ticket purchase at", timestamp);
    return;
  }

  await context.db
    .insert(users)
    .values({
      id: recipient.toLowerCase(),
      ticketsPurchasedTotalBps,
      winningsClaimable: 0n,
      referralFeesClaimable: 0n,
      totalTicketsPurchased: 1n,
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
      totalTicketsPurchased: current.totalTicketsPurchased + 1n,
      totalSpent: current.totalSpent + purchasePrice,
      isActive: true,
      updatedAt: timestamp,
    }));

  await context.db.insert(tickets).values({
    id: eventId,
    roundId: String(currentRound.id),
    buyerAddress: buyer.toLowerCase(),
    recipientAddress: recipient.toLowerCase(),
    ticketsPurchasedBps: ticketsPurchasedTotalBps,
    referrerAddress: referrer.toLowerCase(),
    purchasePrice,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });

  if (referrer !== ZERO_ADDRESS) {
    await context.db
      .insert(users)
      .values({
        id: referrer.toLowerCase(),
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

  await context.db
    .update(jackpotRounds, { id: currentRound.id })
    .set((current) => ({
      ticketCountTotalBps:
        current.ticketCountTotalBps + ticketsPurchasedTotalBps,
      updatedAt: timestamp,
    }));
});

ponder.on("BaseJackpot:UserWinWithdrawal", async ({ event, context }) => {
  const { user, amount } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  await context.db.update(users, { id: user.toLowerCase() }).set((current) => ({
    winningsClaimable:
      current.winningsClaimable > amount
        ? current.winningsClaimable - amount
        : 0n,
    totalWinnings: current.totalWinnings + amount,
    updatedAt: timestamp,
  }));

  await context.db.insert(withdrawals).values({
    id: eventId,
    userAddress: user.toLowerCase(),
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
      .update(users, { id: user.toLowerCase() })
      .set((current) => ({
        referralFeesClaimable:
          current.referralFeesClaimable > amount
            ? current.referralFeesClaimable - amount
            : 0n,
        totalReferralFees: current.totalReferralFees + amount,
        updatedAt: timestamp,
      }));

    await context.db.insert(withdrawals).values({
      id: eventId,
      userAddress: user.toLowerCase(),
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

async function getCurrentRound(context: any, timestamp: number): Promise<any> {
  const roundId = 1;

  try {
    await context.db
      .insert(jackpotRounds)
      .values({
        id: roundId,
        startTime: timestamp,
        endTime: 0,
        status: "ACTIVE",
        totalTicketsValue: 0n,
        totalLpSupplied: 0n,
        jackpotAmount: 0n,
        ticketCountTotalBps: 0n,
        randomNumber: null,
        winnerAddress: null,
        winningTicketNumber: null,
        lpFeesGenerated: 0n,
        referralFeesGenerated: 0n,
        protocolFeesGenerated: 0n,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing();
  } catch (e) {}

  return { id: roundId };
}
