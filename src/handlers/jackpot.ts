import { ponder } from "ponder:registry";
import {
  jackpotRounds,
  users,
  feeDistributions,
  ticketRanges,
  ticketIntegrityChecks,
} from "ponder:schema";
import { generateEventId } from "../utils/calculations";
import { validateRoundIntegrity } from "../utils/ticket-numbering";
import {
  BPS_DIVISOR,
  LP_FEE_BPS,
  REFERRAL_FEE_BPS,
  PROTOCOL_FEE_BPS,
  USER_POOL_BPS,
  ZERO_ADDRESS,
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
      nextTicketNumber: 1n,
      version: 0n,
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
});

ponder.on("BaseJackpot:EntropyResult", async ({ event, context }) => {
  const { sequenceNumber, randomNumber } = event.args;
  const timestamp = Number(event.block.timestamp);

  const currentRoundId = getCurrentRoundId(timestamp);

  await context.db.update(jackpotRounds, { id: currentRoundId }).set({
    randomNumber: randomNumber,
    updatedAt: timestamp,
  });
});

ponder.on("BaseJackpot:JackpotRun", async ({ event, context }) => {
  const { time, winner, winningTicket, winAmount, ticketsPurchasedTotalBps } =
    event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  const roundStartTime = Number(time) - 86400;
  const roundId = getCurrentRoundId(roundStartTime);

  const totalTicketValue = (winAmount * BPS_DIVISOR) / USER_POOL_BPS;

  const lpFees = (totalTicketValue * LP_FEE_BPS) / BPS_DIVISOR;
  const referralFees = (totalTicketValue * REFERRAL_FEE_BPS) / BPS_DIVISOR;
  const protocolFees = (totalTicketValue * PROTOCOL_FEE_BPS) / BPS_DIVISOR;

  try {
    await context.db
      .update(jackpotRounds, {
        id: roundId,
      })
      .set({
        status: "RESOLVED",
        endTime: Number(time),
        winnerAddress: winner,
        winningTicketNumber: winningTicket,
        jackpotAmount: winAmount,
        ticketCountTotalBps: ticketsPurchasedTotalBps,
        totalTicketsValue: totalTicketValue,
        lpFeesGenerated: lpFees,
        referralFeesGenerated: referralFees,
        protocolFeesGenerated: protocolFees,
        updatedAt: timestamp,
      });
  } catch (e) {
    await context.db
      .insert(jackpotRounds)
      .values({
        id: roundId,
        status: "RESOLVED",
        startTime: roundStartTime,
        endTime: Number(time),
        totalTicketsValue: totalTicketValue,
        totalLpSupplied: 0n,
        jackpotAmount: winAmount,
        ticketCountTotalBps: ticketsPurchasedTotalBps,
        nextTicketNumber: 1n,
        version: 0n,
        randomNumber: null,
        winnerAddress: winner,
        winningTicketNumber: winningTicket,
        lpFeesGenerated: lpFees,
        referralFeesGenerated: referralFees,
        protocolFeesGenerated: protocolFees,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        status: "RESOLVED",
        endTime: Number(time),
        winnerAddress: winner,
        winningTicketNumber: winningTicket,
        jackpotAmount: winAmount,
        ticketCountTotalBps: ticketsPurchasedTotalBps,
        totalTicketsValue: totalTicketValue,
        lpFeesGenerated: lpFees,
        referralFeesGenerated: referralFees,
        protocolFeesGenerated: protocolFees,
        updatedAt: timestamp,
      });
  }

  if (winningTicket && winningTicket > 0n && winner !== ZERO_ADDRESS) {
    console.log(`Jackpot winner round ${roundId}: ${winner}`);

    await context.db.insert(ticketIntegrityChecks).values({
      id: `winner-validation-needed-${roundId}`,
      roundId,
      checkTime: timestamp,
      hasGaps: false,
      expectedCount: 0n,
      actualCount: 0n,
      isValid: false,
      errorDetails: `Winner validation needed for ${winner} with ticket ${winningTicket}`,
      severity: "INFO",
    });
  }

  if (winner !== ZERO_ADDRESS) {
    await context.db
      .insert(users)
      .values({
        id: winner,
        ticketsPurchasedTotalBps: 0n,
        winningsClaimable: winAmount,
        referralFeesClaimable: 0n,
        totalTicketsPurchased: 0n,
        totalWinnings: winAmount,
        totalReferralFees: 0n,
        totalSpent: 0n,
        isActive: true,
        isLP: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate((current) => ({
        winningsClaimable: current.winningsClaimable + winAmount,
        totalWinnings: current.totalWinnings + winAmount,
        updatedAt: timestamp,
      }));
  }

  if (lpFees > 0n) {
    await context.db.insert(feeDistributions).values({
      id: `${eventId}-lp`,
      feeType: "LP_FEE",
      amount: lpFees,
      roundId: roundId,
      recipientAddress: ZERO_ADDRESS,
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
      roundId: roundId,
      recipientAddress: ZERO_ADDRESS,
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
      roundId: roundId,
      recipientAddress: ZERO_ADDRESS,
      timestamp: timestamp,
      transactionHash: event.transaction.hash,
      blockNumber: event.block.number,
    });
  }

  await validateRoundIntegrity(context, roundId, timestamp);
});
