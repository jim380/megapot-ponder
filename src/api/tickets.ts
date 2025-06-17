import { db } from "ponder:api";
import { ticketRanges } from "ponder:schema";

export async function getUserTickets(userAddress: string, roundId?: string) {
  try {
    const allRanges = roundId
      ? await db.query.ticketRanges.findMany({
          where: (ranges, { eq }) => eq(ranges.roundId, roundId),
        })
      : await db.query.ticketRanges.findMany();

    const results = allRanges.filter(
      (range) => range.userAddress.toLowerCase() === userAddress.toLowerCase()
    );

    results.sort((a, b) => {
      if (roundId) {
        return Number(a.startTicketNumber - b.startTicketNumber);
      }

      if (a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      return Number(a.startTicketNumber - b.startTicketNumber);
    });

    const formattedRanges = results.map((range) => {
      const bpsAmount = BigInt(range.ticketCount);
      const ticketCount = Number(bpsAmount) / 10000;

      return {
        roundId: range.roundId,
        bpsAmount: bpsAmount.toString(),
        ticketCount: ticketCount.toFixed(4),
        purchaseTime: range.timestamp,
        transactionHash: range.transactionHash,
        blockNumber: range.blockNumber.toString(),
      };
    });

    const totalBps = formattedRanges.reduce(
      (sum, range) => sum + BigInt(range.bpsAmount),
      0n
    );
    const totalTickets = Number(totalBps) / 10000;

    return {
      success: true,
      userAddress: userAddress.toLowerCase(),
      roundId,
      totalBps: totalBps.toString(),
      totalTickets: totalTickets.toFixed(4),
      ticketCount: formattedRanges.length,
      ranges: formattedRanges,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch tickets: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export async function getTicketOwner(roundId: string, ticketNumber: bigint) {
  try {
    const ranges = await db.query.ticketRanges.findMany({
      where: (ranges, { eq }) => eq(ranges.roundId, roundId),
    });

    ranges.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.blockNumber !== b.blockNumber)
        return Number(a.blockNumber - b.blockNumber);
      return a.logIndex - b.logIndex;
    });

    let cumulativeBps = 0n;

    for (const range of ranges) {
      const purchaseBps = BigInt(range.ticketCount);
      const startBps = cumulativeBps;
      const endBps = cumulativeBps + purchaseBps;

      const startTicket = startBps / 10000n + 1n;
      const endTicket = (endBps - 1n) / 10000n + 1n;

      if (ticketNumber >= startTicket && ticketNumber <= endTicket) {
        const ticketCount = Number(purchaseBps) / 10000;

        return {
          success: true,
          ticketNumber: ticketNumber.toString(),
          roundId,
          owner: range.userAddress,
          purchaseTime: range.timestamp,
          transactionHash: range.transactionHash,
          rangeInfo: {
            startTicket: startTicket.toString(),
            endTicket: endTicket.toString(),
            totalTicketsInRange: ticketCount.toFixed(4),
            bpsInRange: purchaseBps.toString(),
          },
        };
      }

      cumulativeBps = endBps;
    }

    return {
      success: false,
      error: `No owner found for ticket ${ticketNumber} in round ${roundId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to find ticket owner: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

export async function getRoundTicketHolders(roundId: string) {
  try {
    const ranges = await db.query.ticketRanges.findMany({
      where: (ranges, { eq }) => eq(ranges.roundId, roundId),
    });

    ranges.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.blockNumber !== b.blockNumber)
        return Number(a.blockNumber - b.blockNumber);
      return a.logIndex - b.logIndex;
    });

    let cumulativeBps = 0n;
    const userHoldings = new Map<
      string,
      {
        userAddress: string;
        totalBps: bigint;
        ranges: Array<{
          startBps: bigint;
          endBps: bigint;
          startTicket: bigint;
          endTicket: bigint;
          bpsAmount: bigint;
        }>;
      }
    >();

    for (const range of ranges) {
      const purchaseBps = BigInt(range.ticketCount);
      const startBps = cumulativeBps;
      const endBps = cumulativeBps + purchaseBps;

      const startTicket = startBps / 10000n + 1n;
      const endTicket = (endBps - 1n) / 10000n + 1n;

      const userAddress = range.userAddress.toLowerCase();

      if (!userHoldings.has(userAddress)) {
        userHoldings.set(userAddress, {
          userAddress,
          totalBps: 0n,
          ranges: [],
        });
      }

      const userHolding = userHoldings.get(userAddress)!;
      userHolding.totalBps += purchaseBps;
      userHolding.ranges.push({
        startBps,
        endBps,
        startTicket,
        endTicket,
        bpsAmount: purchaseBps,
      });

      cumulativeBps = endBps;
    }

    const holders = Array.from(userHoldings.values()).map((holding) => {
      const allRanges = holding.ranges;
      const minStartTicket = allRanges.reduce(
        (min, r) => (r.startTicket < min ? r.startTicket : min),
        allRanges[0]?.startTicket || 1n
      );
      const maxEndTicket = allRanges.reduce(
        (max, r) => (r.endTicket > max ? r.endTicket : max),
        allRanges[0]?.endTicket || 1n
      );

      const ticketCount = Number(holding.totalBps) / 10000;

      return {
        userAddress: holding.userAddress,
        ticketCount: ticketCount.toFixed(4),
        startTicket: minStartTicket.toString(),
        endTicket: maxEndTicket.toString(),
        percentage: "0",
        bpsAmount: holding.totalBps.toString(),
      };
    });

    holders.sort(
      (a, b) => parseFloat(b.ticketCount) - parseFloat(a.ticketCount)
    );

    const totalBps = Array.from(userHoldings.values()).reduce(
      (sum, holding) => sum + holding.totalBps,
      0n
    );

    const totalTickets = Number(totalBps) / 10000;

    if (totalBps > 0n) {
      holders.forEach((holder) => {
        const percentage = (BigInt(holder.bpsAmount) * 10000n) / totalBps;
        holder.percentage = (Number(percentage) / 100).toFixed(2);
      });
    }

    return {
      success: true,
      roundId,
      totalTickets: totalTickets.toFixed(4),
      totalBps: totalBps.toString(),
      uniqueHolders: holders.length,
      holders,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch round holders: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
