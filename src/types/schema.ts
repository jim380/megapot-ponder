export enum RoundStatus {
  ACTIVE = "ACTIVE",
  DRAWING = "DRAWING",
  RESOLVED = "RESOLVED",
}

export enum LpActionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  RISK_ADJUSTMENT = "RISK_ADJUSTMENT",
}

export enum FeeType {
  LP_FEE = "LP_FEE",
  REFERRAL_FEE = "REFERRAL_FEE",
  PROTOCOL_FEE = "PROTOCOL_FEE",
}

export enum WithdrawalType {
  WINNINGS = "WINNINGS",
  REFERRAL_FEES = "REFERRAL_FEES",
  LP_PRINCIPAL = "LP_PRINCIPAL",
  LP_STAKE = "LP_STAKE",
  PROTOCOL_FEE = "PROTOCOL_FEE",
}

export const MEGAPOT_CONSTANTS = {
  TOTAL_FEE_BPS: 3000n,
  LP_FEE_BPS: 2000n,
  REFERRAL_FEE_BPS: 1000n,
  PROTOCOL_FEE_BPS: 0n,

  PROTOCOL_FEE_THRESHOLD: 33000n * 10n ** 6n,
  PROTOCOL_FEE_PERCENTAGE: 1000n,

  TICKET_PRICE: 1000000n,
  ROUND_DURATION: 86400,
  BPS_DIVISOR: 10000n,

  USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  NULL_ADDRESS: "0x0000000000000000000000000000000000000000",
} as const;

export interface CalculatedFees {
  lpFee: bigint;
  referralFee: bigint;
  protocolFee: bigint;
  prizeContribution: bigint;
}

export interface RoundOutcome {
  winner: string;
  winningTicketNumber: bigint;
  jackpotAmount: bigint;
  isPlayerWin: boolean;
  lpProfit: bigint;
}

export interface LpPosition {
  principal: bigint;
  stake: bigint;
  riskPercentage: number;
  effectiveStake: bigint;
}

export interface UserTicketRange {
  startNumber: bigint;
  endNumber: bigint;
  owner: string;
}

export function calculateFees(ticketValue: bigint): CalculatedFees {
  const lpFee =
    (ticketValue * MEGAPOT_CONSTANTS.LP_FEE_BPS) /
    MEGAPOT_CONSTANTS.BPS_DIVISOR;
  const referralFee =
    (ticketValue * MEGAPOT_CONSTANTS.REFERRAL_FEE_BPS) /
    MEGAPOT_CONSTANTS.BPS_DIVISOR;
  const protocolFee = 0n;
  const prizeContribution = ticketValue - lpFee - referralFee - protocolFee;

  return {
    lpFee,
    referralFee,
    protocolFee,
    prizeContribution,
  };
}

export function calculateEffectiveLpStake(
  principal: bigint,
  riskPercentage: number
): bigint {
  return (principal * BigInt(riskPercentage)) / 100n;
}

export function getCurrentRoundId(currentTimestamp: number): string {
  const roundDuration = MEGAPOT_CONSTANTS.ROUND_DURATION;
  const roundNumber = Math.floor(currentTimestamp / roundDuration);
  return roundNumber.toString();
}

export function getHourTimestamp(timestamp: number): number {
  return Math.floor(timestamp / 3600) * 3600;
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
