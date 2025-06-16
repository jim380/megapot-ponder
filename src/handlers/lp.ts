import { ponder } from "ponder:registry";
import {
  users,
  liquidityProviders,
  lpActions,
  lpRoundSnapshots,
  jackpotRounds,
} from "ponder:schema";
import { generateEventId } from "../utils/calculations";
import { calculateEffectiveLpStake } from "../types/schema";

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
      totalSpent: 0n,
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
      effectiveStake: calculateEffectiveLpStake(amount, Number(riskPercentage)),
      isActive: true,
      totalDeposited: amount,
      totalWithdrawn: 0n,
      totalFeesEarned: 0n,
      lastActionAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate((current) => {
      const newPrincipal = current.principal + amount;
      const newEffectiveStake = calculateEffectiveLpStake(
        newPrincipal,
        Number(riskPercentage)
      );
      return {
        principal: newPrincipal,
        totalDeposited: current.totalDeposited + amount,
        riskPercentage: Number(riskPercentage),
        effectiveStake: newEffectiveStake,
        isActive: true,
        lastActionAt: timestamp,
        updatedAt: timestamp,
      };
    });

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

  if (currentRound) {
    await context.db
      .update(jackpotRounds, { id: currentRound.id })
      .set((current) => ({
        totalLpSupplied: current.totalLpSupplied + amount,
        updatedAt: timestamp,
      }));
  }
});

ponder.on("BaseJackpot:LpPrincipalWithdrawal", async ({ event, context }) => {
  const { lpAddress, principalAmount } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  await context.db.update(liquidityProviders, { id: lpId }).set((current) => {
    const newPrincipal =
      current.principal > principalAmount
        ? current.principal - principalAmount
        : 0n;
    const newEffectiveStake = calculateEffectiveLpStake(
      newPrincipal,
      current.riskPercentage
    );

    return {
      principal: newPrincipal,
      effectiveStake: newEffectiveStake,
      totalWithdrawn: current.totalWithdrawn + principalAmount,
      isActive: newPrincipal > 0n,
      lastActionAt: timestamp,
      updatedAt: timestamp,
    };
  });

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

  if (currentRound) {
    await context.db
      .update(jackpotRounds, { id: currentRound.id })
      .set((current) => ({
        totalLpSupplied:
          current.totalLpSupplied > principalAmount
            ? current.totalLpSupplied - principalAmount
            : 0n,
        updatedAt: timestamp,
      }));
  }
});

ponder.on("BaseJackpot:LpStakeWithdrawal", async ({ event, context }) => {
  const { lpAddress } = event.args;
  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);
  const lpId = lpAddress.toLowerCase();

  let withdrawnStake = 0n;

  await context.db.update(liquidityProviders, { id: lpId }).set((current) => {
    withdrawnStake = current.stake;
    return {
      stake: 0n,
      totalFeesEarned: current.totalFeesEarned + current.stake,
      totalWithdrawn: current.totalWithdrawn + current.stake,
      lastActionAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const currentRound = await getCurrentRound(context, timestamp);

  await context.db.insert(lpActions).values({
    id: eventId,
    lpAddress: lpId,
    actionType: "WITHDRAWAL",
    amount: withdrawnStake,
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

    await context.db.update(liquidityProviders, { id: lpId }).set((current) => {
      const newEffectiveStake = calculateEffectiveLpStake(
        current.principal,
        Number(riskPercentage)
      );
      return {
        riskPercentage: Number(riskPercentage),
        effectiveStake: newEffectiveStake,
        lastActionAt: timestamp,
        updatedAt: timestamp,
      };
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

  let feeEarned = 0n;

  await context.db.update(liquidityProviders, { id: lpId }).set((current) => {
    feeEarned = stake > current.stake ? stake - current.stake : 0n;
    const newEffectiveStake = calculateEffectiveLpStake(
      principal,
      current.riskPercentage
    );

    return {
      principal,
      stake,
      effectiveStake: newEffectiveStake,
      totalFeesEarned: current.totalFeesEarned + feeEarned,
      lastActionAt: timestamp,
      updatedAt: timestamp,
    };
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
        beginningPrincipal: principal,
        beginningStake: stake - feeEarned,
        endingPrincipal: principal,
        endingStake: stake,
        activeRiskPercentage: 100,
        feesEarned: feeEarned,
        profitLoss: feeEarned,
        createdAt: timestamp,
      })
      .onConflictDoUpdate((current) => ({
        endingPrincipal: principal,
        endingStake: stake,
        feesEarned: current.feesEarned + feeEarned,
        profitLoss: current.profitLoss + feeEarned,
      }));
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
