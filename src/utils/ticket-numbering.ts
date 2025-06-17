import {
  jackpotRounds,
  ticketIntegrityChecks,
  ticketRanges,
} from "ponder:schema";
import { getCurrentRoundId } from "../types/schema";

interface IndexingContext {
  db: {
    insert: (table: any) => {
      values: (values: any) => {
        onConflictDoNothing: () => Promise<void | null | (void | null)[]>;
      };
    };
  };
}

export async function ensureRoundExists(
  context: IndexingContext,
  roundId: string,
  timestamp: number
) {
  const startTime = Math.floor(Number(roundId) * 86400);

  await context.db
    .insert(jackpotRounds)
    .values({
      id: roundId,
      startTime,
      endTime: null,
      status: "ACTIVE",
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

  return {
    id: roundId,
    startTime,
    endTime: null,
    status: "ACTIVE" as const,
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
  };
}

export async function logCriticalError(
  context: IndexingContext,
  errorId: string,
  errorMessage: string,
  timestamp: number
) {
  await context.db.insert(ticketIntegrityChecks).values({
    id: `error-${errorId}`,
    roundId: "0",
    checkTime: timestamp,
    hasGaps: true,
    expectedCount: 0n,
    actualCount: 0n,
    isValid: false,
    errorDetails: errorMessage,
    severity: "CRITICAL",
  });
  console.error(`CRITICAL: ${errorMessage}`);
}

export async function validateRoundIntegrity(
  context: IndexingContext,
  roundId: string,
  timestamp: number
) {
  return false;
}

interface DrizzleDb {
  query: {
    jackpotRounds: {
      findFirst: (options: any) => Promise<any>;
    };
    ticketRanges: {
      findMany: (options: any) => Promise<any[]>;
    };
  };
  insert: (table: any) => {
    values: (values: any) => Promise<void>;
  };
}

export async function validateRoundIntegrityFromAPI(
  db: DrizzleDb,
  roundId: string,
  timestamp: number
) {
  try {
    const round = await db.query.jackpotRounds.findFirst({
      where: (rounds: any, { eq }: { eq: any }) => eq(rounds.id, roundId),
    });

    if (!round) {
      console.error(`Round ${roundId} not found for integrity check`);
      return;
    }

    const allTicketRanges = await db.query.ticketRanges.findMany({
      where: (ranges: any, { eq }: { eq: any }) => eq(ranges.roundId, roundId),
    });

    const sortedTicketRanges = allTicketRanges.sort((a: any, b: any) => {
      const aStart = BigInt(a.startTicketNumber);
      const bStart = BigInt(b.startTicketNumber);
      return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
    });

    let hasGaps = false;
    let gapDetails: string | null = null;
    let actualTicketCount = 0n;

    if (sortedTicketRanges.length > 0) {
      if (BigInt(sortedTicketRanges[0].startTicketNumber) !== 1n) {
        hasGaps = true;
        gapDetails = `First ticket doesn't start at 1, starts at ${sortedTicketRanges[0].startTicketNumber}`;
      }

      for (let i = 0; i < sortedTicketRanges.length; i++) {
        const range = sortedTicketRanges[i];
        actualTicketCount += BigInt(range.ticketCount);

        if (i > 0) {
          const prevRange = sortedTicketRanges[i - 1];
          const expectedStart = BigInt(prevRange.endTicketNumber) + 1n;

          if (BigInt(range.startTicketNumber) !== expectedStart) {
            hasGaps = true;
            gapDetails = `Gap found: expected ticket ${expectedStart}, but found ${range.startTicketNumber} (gap after ticket ${prevRange.endTicketNumber})`;
            break;
          }
        }

        const startTicket = BigInt(range.startTicketNumber);
        const endTicket = BigInt(range.endTicketNumber);
        const calculatedCount = endTicket - startTicket + 1n;
        if (calculatedCount !== BigInt(range.ticketCount)) {
          hasGaps = true;
          gapDetails = `Invalid range: ${range.startTicketNumber}-${range.endTicketNumber} should have ${calculatedCount} tickets but has ${range.ticketCount}`;
          break;
        }
      }

      const lastRange = sortedTicketRanges[sortedTicketRanges.length - 1];
      const expectedLastTicket = BigInt(round.nextTicketNumber) - 1n;

      if (
        BigInt(lastRange.endTicketNumber) !== expectedLastTicket &&
        BigInt(round.nextTicketNumber) > 1n
      ) {
        hasGaps = true;
        gapDetails = `Last ticket mismatch: last assigned is ${lastRange.endTicketNumber}, but round expects ${expectedLastTicket}`;
      }
    }

    const expectedTicketCount = BigInt(round.ticketCountTotalBps) / 10000n;
    const isValid = !hasGaps && actualTicketCount === expectedTicketCount;

    await db.insert(ticketIntegrityChecks).values({
      id: `integrity-check-${roundId}-${timestamp}`,
      roundId,
      checkTime: timestamp,
      hasGaps,
      expectedCount: expectedTicketCount,
      actualCount: actualTicketCount,
      isValid,
      errorDetails: gapDetails,
      severity: isValid ? "INFO" : hasGaps ? "ERROR" : "WARNING",
    });

    if (!isValid) {
      console.error(
        `Integrity check failed for round ${roundId}: ` +
          `Expected ${expectedTicketCount} tickets, found ${actualTicketCount}. ` +
          `Gaps: ${hasGaps}. Details: ${gapDetails || "Count mismatch"}`
      );
    } else {
      console.log(
        `Integrity check passed for round ${roundId}: ${actualTicketCount} tickets verified`
      );
    }

    return isValid;
  } catch (error) {
    console.error(`Error during integrity check for round ${roundId}:`, error);

    await db.insert(ticketIntegrityChecks).values({
      id: `integrity-check-error-${roundId}-${timestamp}`,
      roundId,
      checkTime: timestamp,
      hasGaps: true,
      expectedCount: 0n,
      actualCount: 0n,
      isValid: false,
      errorDetails: `Integrity check error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      severity: "CRITICAL",
    });

    return false;
  }
}
