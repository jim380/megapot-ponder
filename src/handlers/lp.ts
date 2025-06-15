import { ponder } from "ponder:registry";
import {
  users,
  liquidityProviders,
  lpActions,
  lpRoundSnapshots,
  jackpotRounds,
} from "ponder:schema";
import { generateEventId } from "../utils/calculations";

ponder.on("BaseJackpot:LpDeposit", async ({ event, context }) => {
  const { lpAddress, amount, riskPercentage } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  await context.db
    .insert(users)
    .values({
      id: lpId,
      ticketsPurchasedTotalBps: 0n,
      winningsClaimable: 0n,
      referralFeesClaimable: 0n,
      totalTicketsPurchased: 0n,
      totalWinnings: 0n,
      totalReferralFees: 0n,
      isActive: true,
      isLP: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      isLP: true,
      isActive: true,
      updatedAt: timestamp,
    });

  await context.db
    .insert(liquidityProviders)
    .values({
      id: lpId,
      principal: amount,
      stake: 0n,
      riskPercentage: Number(riskPercentage),
      isActive: true,
      totalDeposited: amount,
      totalWithdrawn: 0n,
      totalFeesEarned: 0n,
      lastActionAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate((current) => ({
      principal: current.principal + amount,
      totalDeposited: current.totalDeposited + amount,
      riskPercentage: Number(riskPercentage),
      isActive: true,
      lastActionAt: timestamp,
      updatedAt: timestamp,
    }));

  const currentRound = await getCurrentRound(context, timestamp);

  await context.db.insert(lpActions).values({
    id: eventId,
    lpAddress: lpId,
    actionType: "DEPOSIT",
    amount,
    riskPercentage: Number(riskPercentage),
    effectiveRoundId: currentRound ? String(currentRound.id) : null,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });
});

ponder.on("BaseJackpot:LpPrincipalWithdrawal", async ({ event, context }) => {
  const { lpAddress, principalAmount } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  await context.db.update(liquidityProviders, { id: lpId }).set((current) => ({
    principal:
      current.principal > principalAmount
        ? current.principal - principalAmount
        : 0n,
    totalWithdrawn: current.totalWithdrawn + principalAmount,
    isActive: current.principal - principalAmount > 0n,
    lastActionAt: timestamp,
    updatedAt: timestamp,
  }));

  const currentRound = await getCurrentRound(context, timestamp);

  await context.db.insert(lpActions).values({
    id: eventId,
    lpAddress: lpId,
    actionType: "WITHDRAWAL",
    amount: principalAmount,
    riskPercentage: null,
    effectiveRoundId: currentRound ? String(currentRound.id) : null,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });
});

ponder.on("BaseJackpot:LpStakeWithdrawal", async ({ event, context }) => {
  const { lpAddress } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  const stakeAmount = 0n;

  await context.db.update(liquidityProviders, { id: lpId }).set((current) => ({
    stake: 0n,
    totalFeesEarned: current.totalFeesEarned + current.stake,
    lastActionAt: timestamp,
    updatedAt: timestamp,
  }));

  const currentRound = await getCurrentRound(context, timestamp);

  await context.db.insert(lpActions).values({
    id: eventId,
    lpAddress: lpId,
    actionType: "WITHDRAWAL",
    amount: stakeAmount,
    riskPercentage: null,
    effectiveRoundId: currentRound ? String(currentRound.id) : null,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp,
  });
});

ponder.on(
  "BaseJackpot:LpRiskPercentageAdjustment",
  async ({ event, context }) => {
    const { lpAddress, riskPercentage } = event.args;
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const timestamp = Number(event.block.timestamp);
    const lpId = lpAddress.toLowerCase();

    await context.db.update(liquidityProviders, { id: lpId }).set({
      riskPercentage: Number(riskPercentage),
      lastActionAt: timestamp,
      updatedAt: timestamp,
    });

    const currentRound = await getCurrentRound(context, timestamp);

    await context.db.insert(lpActions).values({
      id: eventId,
      lpAddress: lpId,
      actionType: "RISK_ADJUSTMENT",
      amount: null,
      riskPercentage: Number(riskPercentage),
      effectiveRoundId: currentRound ? String(currentRound.id) : null,
      transactionHash: event.transaction.hash,
      blockNumber: BigInt(event.block.number),
      timestamp,
    });
  }
);

ponder.on("BaseJackpot:LpRebalance", async ({ event, context }) => {
  const { lpAddress, principal, stake } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  await context.db.update(liquidityProviders, { id: lpId }).set({
    principal,
    stake,
    lastActionAt: timestamp,
    updatedAt: timestamp,
  });

  const currentRound = await getCurrentRound(context, timestamp);

  if (currentRound) {
    const snapshotId = `${lpId}-${currentRound.id}`;
    await context.db
      .insert(lpRoundSnapshots)
      .values({
        id: snapshotId,
        lpAddress: lpId,
        roundId: String(currentRound.id),
        beginningPrincipal: 0n,
        beginningStake: 0n,
        endingPrincipal: principal,
        endingStake: stake,
        activeRiskPercentage: 100,
        feesEarned: 0n,
        profitLoss: 0n,
        createdAt: timestamp,
      })
      .onConflictDoUpdate({
        endingPrincipal: principal,
        endingStake: stake,
      });
  }

  await context.db.insert(lpActions).values({
    id: eventId,
    lpAddress: lpId,
    actionType: "RISK_ADJUSTMENT",
    amount: stake,
    riskPercentage: null,
    effectiveRoundId: currentRound ? String(currentRound.id) : null,
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
        id: String(roundId),
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
