import { db } from "ponder:api";
import { ticketRanges, jackpotRounds } from "ponder:schema";

export async function calculateTicketNumbers(roundId: string) {
  try {
    const purchases = await db.query.ticketRanges.findMany({
      where: (ranges, { eq }) => eq(ranges.roundId, roundId),
    });

    purchases.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.blockNumber !== b.blockNumber)
        return Number(a.blockNumber - b.blockNumber);
      return a.logIndex - b.logIndex;
    });

    let cumulativeBps = 0n;
    const updatedRanges = [];

    for (const purchase of purchases) {
      const purchaseBps = BigInt(purchase.ticketCount);
      const startBps = cumulativeBps;
      const endBps = cumulativeBps + purchaseBps;

      const startTicket = startBps / 10000n + 1n;
      const endTicket = (endBps - 1n) / 10000n + 1n;

      updatedRanges.push({
        id: purchase.id,
        userAddress: purchase.userAddress,
        startBps: startBps.toString(),
        endBps: endBps.toString(),
        startTicket: startTicket.toString(),
        endTicket: endTicket.toString(),
        ticketsBps: purchaseBps.toString(),
        ticketsDecimal: (Number(purchaseBps) / 10000).toFixed(4),
        timestamp: purchase.timestamp,
        transactionHash: purchase.transactionHash,
      });

      cumulativeBps = endBps;
    }

    const round = await db.query.jackpotRounds.findFirst({
      where: (rounds, { eq }) => eq(rounds.id, roundId),
    });

    const totalBps = round?.ticketCountTotalBps || 0n;
    const totalTickets = Number(totalBps) / 10000;

    return {
      success: true,
      roundId,
      totalBps: totalBps.toString(),
      totalTickets: totalTickets.toFixed(4),
      uniqueHolders: purchases.length,
      ranges: updatedRanges,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to calculate ticket numbers: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export async function findWinnerByBps(roundId: string, winningBps: bigint) {
  try {
    const ranges = await calculateTicketNumbers(roundId);

    if (!ranges.success || !ranges.ranges) {
      return { success: false, error: "Failed to get ticket ranges" };
    }

    for (const range of ranges.ranges) {
      const startBps = BigInt(range.startBps);
      const endBps = BigInt(range.endBps);

      if (winningBps >= startBps && winningBps < endBps) {
        return {
          success: true,
          winner: range.userAddress,
          winningBps: winningBps.toString(),
          winningTicket: (winningBps / 10000n + 1n).toString(),
          rangeInfo: {
            startBps: range.startBps,
            endBps: range.endBps,
            startTicket: range.startTicket,
            endTicket: range.endTicket,
            ticketsBps: range.ticketsBps,
            ticketsDecimal: range.ticketsDecimal,
          },
          transactionHash: range.transactionHash,
        };
      }
    }

    return {
      success: false,
      error: `No winner found for BPS position ${winningBps} in round ${roundId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to find winner: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
