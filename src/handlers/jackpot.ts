import { ponder } from "ponder:registry";
import { jackpotRounds, users, feeDistributions } from "ponder:schema";
import { generateEventId } from "../utils/calculations";
import {
  BPS_DIVISOR,
  LP_FEE_BPS,
  REFERRAL_FEE_BPS,
  PROTOCOL_FEE_BPS,
  USER_POOL_BPS,
} from "../utils/constants";
import { getCurrentRoundId } from "../types/schema";

ponder.on("BaseJackpot:JackpotRunRequested", async ({ event, context }) => {
  const { user } = event.args;
  const timestamp = Number(event.block.timestamp);

  const currentRoundId = getCurrentRoundId(timestamp);

  await context.db
    .insert(jackpotRounds)
    .values({
      id: currentRoundId,
      status: "ACTIVE",
      startTime: timestamp,
      endTime: null,
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

  await context.db.update(jackpotRounds, { id: currentRoundId }).set({
    status: "DRAWING",
    updatedAt: timestamp,
  });

  console.log(
    `Jackpot run requested by ${user} for round ${currentRoundId} at block ${event.block.number}`
  );
});

ponder.on("BaseJackpot:EntropyResult", async ({ event, context }) => {
  const { sequenceNumber, randomNumber } = event.args;
  const timestamp = Number(event.block.timestamp);

  const currentRoundId = getCurrentRoundId(timestamp);

  await context.db.update(jackpotRounds, { id: currentRoundId }).set({
    randomNumber: randomNumber,
    updatedAt: timestamp,
  });

  console.log(
    `Entropy result received for round ${currentRoundId}: sequence ${sequenceNumber}, random ${randomNumber}`
  );
});

ponder.on("BaseJackpot:JackpotRun", async ({ event, context }) => {
  const { time, winner, winningTicket, winAmount, ticketsPurchasedTotalBps } =
    event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  const currentRoundId = getCurrentRoundId(timestamp);

  const totalTicketValue = (winAmount * BPS_DIVISOR) / USER_POOL_BPS;

  const lpFees = (totalTicketValue * LP_FEE_BPS) / BPS_DIVISOR;
  const referralFees = (totalTicketValue * REFERRAL_FEE_BPS) / BPS_DIVISOR;
  const protocolFees = (totalTicketValue * PROTOCOL_FEE_BPS) / BPS_DIVISOR;

  await context.db.update(jackpotRounds, { id: currentRoundId }).set({
    status: "RESOLVED",
    endTime: Number(time),
    winnerAddress: winner.toLowerCase(),
    winningTicketNumber: winningTicket,
    jackpotAmount: winAmount,
    ticketCountTotalBps: ticketsPurchasedTotalBps,
    totalTicketsValue: totalTicketValue,
    lpFeesGenerated: lpFees,
    referralFeesGenerated: referralFees,
    protocolFeesGenerated: protocolFees,
    updatedAt: timestamp,
  });

  if (winner !== "0x0000000000000000000000000000000000000000") {
    await context.db
      .update(users, { id: winner.toLowerCase() })
      .set((current) => ({
        winningsClaimable: current.winningsClaimable + winAmount,
        updatedAt: timestamp,
      }));
  }

  if (lpFees > 0n) {
    await context.db.insert(feeDistributions).values({
      id: `${eventId}-lp`,
      feeType: "LP_FEE",
      amount: lpFees,
      roundId: currentRoundId,
      recipientAddress: "0x0000000000000000000000000000000000000000",
      timestamp: timestamp,
      transactionHash: event.transaction.hash,
      blockNumber: event.block.number,
    });
  }

  if (referralFees > 0n) {
    await context.db.insert(feeDistributions).values({
      id: `${eventId}-referral`,
      feeType: "REFERRAL_FEE",
      amount: referralFees,
      roundId: currentRoundId,
      recipientAddress: "0x0000000000000000000000000000000000000000",
      timestamp: timestamp,
      transactionHash: event.transaction.hash,
      blockNumber: event.block.number,
    });
  }

  if (protocolFees > 0n) {
    await context.db.insert(feeDistributions).values({
      id: `${eventId}-protocol`,
      feeType: "PROTOCOL_FEE",
      amount: protocolFees,
      roundId: currentRoundId,
      recipientAddress: "0x0000000000000000000000000000000000000000",
      timestamp: timestamp,
      transactionHash: event.transaction.hash,
      blockNumber: event.block.number,
    });
  }

  console.log(
    `Jackpot run completed for round ${currentRoundId}: winner ${winner}, amount ${winAmount}, ticket ${winningTicket}`
  );
});
