import { ponder, type PonderEvent, type PonderContext } from "@/generated";
import { generateEventId } from "../utils/calculations";

ponder.on(
  "BaseJackpot:LpDeposit",
  async ({
    event,
    context,
  }: {
    event: PonderEvent;
    context: PonderContext;
  }) => {
    const { amount, user } = event.args;
    const timestamp = Number(event.block.timestamp);
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const userAddress = user.toLowerCase();

    await context.db.User.upsert({
      id: userAddress,
      create: {
        address: userAddress,
        isLiquidityProvider: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      update: {
        isLiquidityProvider: true,
        updatedAt: timestamp,
      },
    });

    const existingLp = await context.db.LiquidityProvider.findUnique({
      id: userAddress,
    });

    if (existingLp) {
      await context.db.LiquidityProvider.update({
        id: userAddress,
        data: {
          principalBalance: existingLp.principalBalance + amount,
          totalDeposited: existingLp.totalDeposited + amount,
          lastActivityAt: timestamp,
          updatedAt: timestamp,
        },
      });
    } else {
      await context.db.LiquidityProvider.create({
        id: userAddress,
        data: {
          userId: userAddress,
          principalBalance: amount,
          stakeBalance: 0n,
          totalDeposited: amount,
          totalWithdrawn: 0n,
          totalStakeWithdrawn: 0n,
          riskPercentage: 100,
          isActive: true,
          lastActivityAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }

    await context.db.LpAction.create({
      id: eventId,
      data: {
        lpId: userAddress,
        actionType: "deposit",
        amount: amount,
        riskPercentage: existingLp?.riskPercentage || 100,
        timestamp: timestamp,
        transactionHash: event.transaction.hash,
        createdAt: timestamp,
      },
    });
  }
);

ponder.on(
  "BaseJackpot:LpPrincipalWithdrawal",
  async ({
    event,
    context,
  }: {
    event: PonderEvent;
    context: PonderContext;
  }) => {
    const { amount, user } = event.args;
    const timestamp = Number(event.block.timestamp);
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const userAddress = user.toLowerCase();

    const lp = await context.db.LiquidityProvider.findUnique({
      id: userAddress,
    });

    if (!lp) {
      console.error(`LP not found for principal withdrawal: ${userAddress}`);
      return;
    }

    await context.db.LiquidityProvider.update({
      id: userAddress,
      data: {
        principalBalance: lp.principalBalance - amount,
        totalWithdrawn: lp.totalWithdrawn + amount,
        isActive: lp.principalBalance - amount > 0n,
        lastActivityAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await context.db.LpAction.create({
      id: eventId,
      data: {
        lpId: userAddress,
        actionType: "principal_withdrawal",
        amount: amount,
        riskPercentage: lp.riskPercentage,
        timestamp: timestamp,
        transactionHash: event.transaction.hash,
        createdAt: timestamp,
      },
    });
  }
);

ponder.on(
  "BaseJackpot:LpStakeWithdrawal",
  async ({
    event,
    context,
  }: {
    event: PonderEvent;
    context: PonderContext;
  }) => {
    const { amount, user } = event.args;
    const timestamp = Number(event.block.timestamp);
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const userAddress = user.toLowerCase();

    const lp = await context.db.LiquidityProvider.findUnique({
      id: userAddress,
    });

    if (!lp) {
      console.error(`LP not found for stake withdrawal: ${userAddress}`);
      return;
    }

    await context.db.LiquidityProvider.update({
      id: userAddress,
      data: {
        stakeBalance: lp.stakeBalance - amount,
        totalStakeWithdrawn: lp.totalStakeWithdrawn + amount,
        lastActivityAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await context.db.LpAction.create({
      id: eventId,
      data: {
        lpId: userAddress,
        actionType: "stake_withdrawal",
        amount: amount,
        riskPercentage: lp.riskPercentage,
        timestamp: timestamp,
        transactionHash: event.transaction.hash,
        createdAt: timestamp,
      },
    });
  }
);

ponder.on(
  "BaseJackpot:LpRiskPercentageAdjustment",
  async ({
    event,
    context,
  }: {
    event: PonderEvent;
    context: PonderContext;
  }) => {
    const { newRiskPercentage, user } = event.args;
    const timestamp = Number(event.block.timestamp);
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
    const userAddress = user.toLowerCase();

    const lp = await context.db.LiquidityProvider.findUnique({
      id: userAddress,
    });

    if (!lp) {
      console.error(`LP not found for risk adjustment: ${userAddress}`);
      return;
    }

    const oldRiskPercentage = lp.riskPercentage;

    await context.db.LiquidityProvider.update({
      id: userAddress,
      data: {
        riskPercentage: Number(newRiskPercentage),
        lastActivityAt: timestamp,
        updatedAt: timestamp,
      },
    });

    await context.db.LpAction.create({
      id: eventId,
      data: {
        lpId: userAddress,
        actionType: "risk_adjustment",
        amount: BigInt(oldRiskPercentage),
        riskPercentage: Number(newRiskPercentage),
        timestamp: timestamp,
        transactionHash: event.transaction.hash,
        createdAt: timestamp,
      },
    });
  }
);

ponder.on(
  "BaseJackpot:LpRebalance",
  async ({
    event,
    context,
  }: {
    event: PonderEvent;
    context: PonderContext;
  }) => {
    const { totalRebalanced } = event.args;
    const timestamp = Number(event.block.timestamp);
    const eventId = generateEventId(event.transaction.hash, event.log.logIndex);

    const activeLps = await context.db.LiquidityProvider.findMany({
      where: {
        isActive: true,
        principalBalance: { gt: 0n },
      },
    });

    if (activeLps.length === 0) {
      console.error("No active LPs found during rebalance");
      return;
    }

    let totalPrincipalAtRisk = 0n;
    for (const lp of activeLps) {
      const principalAtRisk =
        (lp.principalBalance * BigInt(lp.riskPercentage)) / 100n;
      totalPrincipalAtRisk += principalAtRisk;
    }

    for (const lp of activeLps) {
      const principalAtRisk =
        (lp.principalBalance * BigInt(lp.riskPercentage)) / 100n;

      const lpShare =
        totalPrincipalAtRisk > 0n
          ? (totalRebalanced * principalAtRisk) / totalPrincipalAtRisk
          : 0n;

      if (lpShare > 0n) {
        await context.db.LiquidityProvider.update({
          id: lp.id,
          data: {
            stakeBalance: lp.stakeBalance + lpShare,
            lastActivityAt: timestamp,
            updatedAt: timestamp,
          },
        });

        await context.db.LpAction.create({
          id: `${eventId}-${lp.id}`,
          data: {
            lpId: lp.id,
            actionType: "rebalance",
            amount: lpShare,
            riskPercentage: lp.riskPercentage,
            timestamp: timestamp,
            transactionHash: event.transaction.hash,
            createdAt: timestamp,
          },
        });
      }
    }

    await context.db.LpAction.create({
      id: eventId,
      data: {
        lpId: "system",
        actionType: "rebalance",
        amount: totalRebalanced,
        riskPercentage: 0,
        timestamp: timestamp,
        transactionHash: event.transaction.hash,
        createdAt: timestamp,
      },
    });
  }
);
