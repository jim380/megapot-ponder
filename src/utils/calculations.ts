import {
  BPS_DIVISOR,
  LP_FEE_BPS,
  REFERRAL_FEE_BPS,
  PROTOCOL_FEE_BPS,
} from "./constants";

export function calculateTicketAmount(
  ticketsPurchasedTotalBps: bigint,
  totalPoolSize: bigint
): bigint {
  if (totalPoolSize === 0n) return 0n;
  return (ticketsPurchasedTotalBps * totalPoolSize) / BPS_DIVISOR;
}

export function calculateLpFee(amount: bigint): bigint {
  return (amount * LP_FEE_BPS) / BPS_DIVISOR;
}

export function calculateReferralFee(amount: bigint): bigint {
  return (amount * REFERRAL_FEE_BPS) / BPS_DIVISOR;
}

export function calculateProtocolFee(amount: bigint): bigint {
  return (amount * PROTOCOL_FEE_BPS) / BPS_DIVISOR;
}

export function calculateFees(amount: bigint): {
  lpFee: bigint;
  referralFee: bigint;
  protocolFee: bigint;
  netAmount: bigint;
} {
  const lpFee = calculateLpFee(amount);
  const referralFee = calculateReferralFee(amount);
  const protocolFee = calculateProtocolFee(amount);
  const totalFees = lpFee + referralFee + protocolFee;
  const netAmount = amount - totalFees;

  return {
    lpFee,
    referralFee,
    protocolFee,
    netAmount,
  };
}

export function generateEventId(txHash: string, logIndex: number): string {
  return `${txHash}-${logIndex}`;
}
