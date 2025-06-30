export function bigIntToHex(value: bigint): string {
  if (value === 0n) {
    return "0x0";
  }
  return `0x${value.toString(16)}`;
}

export function hexToBigInt(hex: string): bigint {
  if (typeof hex !== "string") {
    throw new Error("Input must be a string");
  }

  if (hex === "") {
    throw new Error("Empty string is not a valid hex value");
  }

  const cleanHex = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error(`Invalid hex string: ${hex}`);
  }

  if (cleanHex === "" || cleanHex === "0") {
    return 0n;
  }

  return BigInt(`0x${cleanHex}`);
}

export function serializeBigInt<T>(obj: T): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return bigIntToHex(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => serializeBigInt(item));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }

  return obj;
}

export function deserializeBigInt<T>(obj: T, fields?: string[]): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string" && isHexString(obj)) {
    try {
      return hexToBigInt(obj);
    } catch {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => deserializeBigInt(item, fields));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (fields !== undefined && fields.includes(key) && typeof value === "string") {
        try {
          result[key] = hexToBigInt(value);
        } catch {
          result[key] = value;
        }
      } else {
        result[key] = deserializeBigInt(value, fields);
      }
    }
    return result;
  }

  return obj;
}

function isHexString(str: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(str);
}

export function decimalToBigInt(decimal: string): bigint {
  if (typeof decimal !== "string") {
    throw new Error("Input must be a string");
  }

  if (!/^\d+$/.test(decimal)) {
    throw new Error(`Invalid decimal string: ${decimal}`);
  }

  return BigInt(decimal);
}

export function stringifyWithBigInt(obj: unknown, space?: number): string {
  return JSON.stringify(serializeBigInt(obj), null, space);
}

export function parseWithBigInt(json: string, bigIntFields?: string[]): unknown {
  const parsed: unknown = JSON.parse(json);
  return deserializeBigInt(parsed, bigIntFields);
}

export const BIGINT_FIELDS = [
  "ticketsPurchasedTotalBps",
  "winningsClaimable",
  "referralFeesClaimable",
  "totalTicketsPurchased",
  "totalWinnings",
  "totalReferralFees",
  "principal",
  "stake",
  "totalDeposited",
  "totalWithdrawn",
  "totalFeesEarned",
  "totalTicketsValue",
  "totalLpSupplied",
  "jackpotAmount",
  "ticketCountTotalBps",
  "winningTicketNumber",
  "lpFeesGenerated",
  "referralFeesGenerated",
  "protocolFeesGenerated",
  "ticketsPurchasedBps",
  "purchasePrice",
  "blockNumber",
  "amount",
  "beginningPrincipal",
  "beginningStake",
  "endingPrincipal",
  "endingStake",
  "feesEarned",
  "profitLoss",
  "totalTicketsSold",
  "totalJackpotsPaid",
  "totalLpDeposited",
  "totalLpFeesGenerated",
  "totalReferralFeesGenerated",
  "totalProtocolFeesGenerated",
  "currentPrincipal",
  "currentStake",
  "totalSpent",
  "totalWon",
  "totalReferralEarnings",
];

export function createBigIntReplacer(): (key: string, value: unknown) => unknown {
  return (_key: string, value: unknown): unknown => {
    if (typeof value === "bigint") {
      return bigIntToHex(value);
    }
    return value;
  };
}

export function createBigIntReviver(
  bigIntFields: string[] = BIGINT_FIELDS
): (key: string, value: unknown) => unknown {
  return (key: string, value: unknown): unknown => {
    if (bigIntFields.includes(key) && typeof value === "string" && isHexString(value)) {
      try {
        return hexToBigInt(value);
      } catch {
        return value;
      }
    }
    return value;
  };
}
