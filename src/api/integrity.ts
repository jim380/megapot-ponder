import { db } from "ponder:api";
import {
  ticketRanges,
  jackpotRounds,
  ticketIntegrityChecks,
} from "ponder:schema";

export async function validateRoundIntegrity(roundId: string) {
  try {
    const round = await db.query.jackpotRounds.findFirst({
      where: (rounds, { eq }) => eq(rounds.id, roundId),
    });

    if (!round) {
      return {
        error: `Round ${roundId} not found`,
        isValid: false,
      };
    }

    const allTicketRanges = await db.query.ticketRanges.findMany({
      where: (ranges, { eq }) => eq(ranges.roundId, roundId),
    });

    const sortedTicketRanges = allTicketRanges.sort((a, b) =>
      Number(a.startTicketNumber - b.startTicketNumber)
    );

    let hasGaps = false;
    let gapDetails: string | null = null;
    let actualTicketCount = 0n;

    if (sortedTicketRanges.length > 0) {
      const firstRange = sortedTicketRanges[0];
      if (firstRange && firstRange.startTicketNumber !== 1n) {
        hasGaps = true;
        gapDetails = `First ticket doesn't start at 1, starts at ${firstRange.startTicketNumber}`;
      }

      for (let i = 0; i < sortedTicketRanges.length; i++) {
        const range = sortedTicketRanges[i];
        if (!range) continue;
        actualTicketCount += range.ticketCount;

        if (i > 0) {
          const prevRange = sortedTicketRanges[i - 1];
          if (!prevRange) continue;
          const expectedStart = prevRange.endTicketNumber + 1n;

          if (range.startTicketNumber !== expectedStart) {
            hasGaps = true;
            gapDetails = `Gap found: expected ticket ${expectedStart}, but found ${range.startTicketNumber}`;
            break;
          }
        }
      }
    }

    const expectedTicketCount = round.ticketCountTotalBps / 10000n;
    const isValid = !hasGaps && actualTicketCount === expectedTicketCount;

    const result = {
      id: `api-integrity-check-${roundId}-${Date.now()}`,
      roundId,
      checkTime: Math.floor(Date.now() / 1000),
      hasGaps,
      expectedCount: expectedTicketCount,
      actualCount: actualTicketCount,
      isValid,
      errorDetails: gapDetails,
      severity: isValid ? "INFO" : hasGaps ? "ERROR" : "WARNING",
    };

    console.log("Integrity check result:", result);

    return {
      roundId,
      isValid,
      hasGaps,
      expectedCount: expectedTicketCount.toString(),
      actualCount: actualTicketCount.toString(),
      details: gapDetails,
    };
  } catch (error) {
    console.error(`Error validating round ${roundId}:`, error);
    return {
      error: error instanceof Error ? error.message : String(error),
      isValid: false,
    };
  }
}

export async function validateWinner(
  roundId: string,
  winnerAddress: string,
  winningTicketNumber: bigint
) {
  try {
    const winnerRange = await db.query.ticketRanges.findFirst({
      where: (ranges, { and, eq, lte, gte }) =>
        and(
          eq(ranges.roundId, roundId),
          lte(ranges.startTicketNumber, winningTicketNumber),
          gte(ranges.endTicketNumber, winningTicketNumber)
        ),
    });

    if (!winnerRange) {
      return {
        isValid: false,
        error: `No ticket range found for winning ticket ${winningTicketNumber}`,
      };
    }

    const isValid = winnerRange.userAddress === winnerAddress.toLowerCase();

    if (!isValid) {
      console.error(
        `Winner mismatch for round ${roundId}! ` +
          `Expected ${
            winnerRange.userAddress
          }, got ${winnerAddress.toLowerCase()}`
      );
    }

    return {
      isValid,
      expectedWinner: winnerRange.userAddress,
      actualWinner: winnerAddress.toLowerCase(),
      ticketRange: {
        start: winnerRange.startTicketNumber.toString(),
        end: winnerRange.endTicketNumber.toString(),
      },
    };
  } catch (error) {
    console.error(`Error validating winner:`, error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function assignTicketNumbers(roundId: string) {
  try {
    const allTickets = await db.query.tickets.findMany({
      where: (tickets, { eq }) => eq(tickets.roundId, roundId),
      orderBy: (tickets, { asc }) => [
        asc(tickets.blockNumber),
        asc(tickets.timestamp),
      ],
    });

    let currentTicketNumber = 1n;
    const updates = [];

    for (const ticket of allTickets) {
      const ticketCount = ticket.ticketsPurchasedBps / 10000n;
      const startTicket = currentTicketNumber;
      const endTicket = currentTicketNumber + ticketCount - 1n;

      updates.push({
        eventId: ticket.id,
        userAddress: ticket.recipientAddress,
        startTicket: startTicket.toString(),
        endTicket: endTicket.toString(),
        ticketCount: ticketCount.toString(),
      });

      currentTicketNumber = endTicket + 1n;
    }

    return {
      roundId,
      totalTickets: (currentTicketNumber - 1n).toString(),
      assignments: updates.length,
      updates,
    };
  } catch (error) {
    console.error(`Error assigning ticket numbers:`, error);
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
