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

export enum OrderDirection {
  ASC = "asc",
  DESC = "desc",
}

export interface User {
  id: string;
  ticketsPurchasedTotalBps: bigint;
  winningsClaimable: bigint;
  referralFeesClaimable: bigint;
  totalTicketsPurchased: bigint;
  totalWinnings: bigint;
  totalReferralFees: bigint;
  isActive: boolean;
  isLP: boolean;
  createdAt: number;
  updatedAt: number;

  tickets?: Ticket[];
  receivedTickets?: Ticket[];
  referredTickets?: Ticket[];
  referralsGiven?: Referral[];
  referralsReceived?: Referral[];
  withdrawals?: Withdrawal[];
  feeDistributions?: FeeDistribution[];
}

export interface LiquidityProvider {
  id: string;
  principal: bigint;
  stake: bigint;
  riskPercentage: number;
  isActive: boolean;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalFeesEarned: bigint;
  lastActionAt: number;
  createdAt: number;
  updatedAt: number;

  actions?: LpAction[];
  snapshots?: LpRoundSnapshot[];
}

export interface JackpotRound {
  id: string;
  status: RoundStatus;
  startTime: number;
  endTime?: number;
  totalTicketsValue: bigint;
  totalLpSupplied: bigint;
  jackpotAmount: bigint;
  ticketCountTotalBps: bigint;
  randomNumber?: string;
  winnerAddress?: string;
  winningTicketNumber?: bigint;
  lpFeesGenerated: bigint;
  referralFeesGenerated: bigint;
  protocolFeesGenerated: bigint;
  createdAt: number;
  updatedAt: number;

  tickets?: Ticket[];
  lpSnapshots?: LpRoundSnapshot[];
  feeDistributions?: FeeDistribution[];
}

export interface Ticket {
  id: string;
  roundId: string;
  buyerAddress: string;
  recipientAddress: string;
  referrerAddress?: string;
  ticketsPurchasedBps: bigint;
  purchasePrice: bigint;
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;

  round?: JackpotRound;
  buyer?: User;
  recipient?: User;
  referrer?: User;
}

export interface LpAction {
  id: string;
  lpAddress: string;
  actionType: LpActionType;
  amount?: bigint;
  riskPercentage?: number;
  effectiveRoundId?: string;
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;

  liquidityProvider?: LiquidityProvider;
  effectiveRound?: JackpotRound;
}

export interface LpRoundSnapshot {
  id: string;
  lpAddress: string;
  roundId: string;
  beginningPrincipal: bigint;
  beginningStake: bigint;
  endingPrincipal: bigint;
  endingStake: bigint;
  activeRiskPercentage: number;
  feesEarned: bigint;
  profitLoss: bigint;
  createdAt: number;

  liquidityProvider?: LiquidityProvider;
  round?: JackpotRound;
}

export interface FeeDistribution {
  id: string;
  roundId: string;
  recipientAddress: string;
  amount: bigint;
  feeType: FeeType;
  transactionHash?: string;
  blockNumber?: bigint;
  timestamp: number;

  round?: JackpotRound;
  recipient?: User;
}

export interface Referral {
  id: string;
  referrerAddress: string;
  referredAddress: string;
  totalTicketsPurchased: bigint;
  totalFeesGenerated: bigint;
  firstPurchaseAt: number;
  lastPurchaseAt: number;
  createdAt: number;
  updatedAt: number;

  referrer?: User;
  referred?: User;
}

export interface Withdrawal {
  id: string;
  userAddress: string;
  amount: bigint;
  withdrawalType: WithdrawalType;
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;

  user?: User;
}

export interface HourlyStat {
  id: string;
  hourTimestamp: number;
  totalTicketsSold: bigint;
  totalTicketsValue: bigint;
  uniquePlayers: number;
  totalLpDeposits: bigint;
  totalLpWithdrawals: bigint;
  totalLpFeesGenerated: bigint;
  totalReferralFeesGenerated: bigint;
  totalProtocolFeesGenerated: bigint;
  roundsCompleted: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProtocolStats {
  totalTicketsSold: bigint;
  totalJackpotsPaid: bigint;
  totalLpDeposited: bigint;
  totalLpFeesGenerated: bigint;
  totalReferralFeesGenerated: bigint;
  totalProtocolFeesGenerated: bigint;
  activeUsers: number;
  activeLps: number;
  totalRounds: number;
  currentRoundId: string;
}

export interface LpStats {
  address: string;
  currentPrincipal: bigint;
  currentStake: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalFeesEarned: bigint;
  averageAPY: number;
  roundsParticipated: number;
  winRate: number;
}

export interface UserStats {
  address: string;
  totalTicketsPurchased: bigint;
  totalSpent: bigint;
  totalWon: bigint;
  totalReferralEarnings: bigint;
  winRate: number;
  roundsPlayed: number;
  referralsCount: number;
}

export interface UserFilter {
  isActive?: boolean;
  isLP?: boolean;
  totalWinnings_gt?: bigint;
  totalTicketsPurchased_gt?: bigint;
}

export interface LiquidityProviderFilter {
  isActive?: boolean;
  stake_gt?: bigint;
  riskPercentage_gte?: number;
  riskPercentage_lte?: number;
}

export interface JackpotRoundFilter {
  status?: RoundStatus;
  startTime_gte?: number;
  startTime_lte?: number;
  jackpotAmount_gt?: bigint;
}

export interface TicketFilter {
  roundId?: string;
  buyerAddress?: string;
  recipientAddress?: string;
  referrerAddress?: string;
  timestamp_gte?: number;
  timestamp_lte?: number;
}

export type UserOrderBy =
  | "totalWinnings"
  | "totalTicketsPurchased"
  | "totalReferralFees"
  | "createdAt";
export type LiquidityProviderOrderBy =
  | "stake"
  | "totalFeesEarned"
  | "totalDeposited"
  | "riskPercentage"
  | "createdAt";
export type JackpotRoundOrderBy =
  | "startTime"
  | "jackpotAmount"
  | "totalTicketsValue"
  | "totalLpSupplied";
export type TicketOrderBy = "timestamp" | "blockNumber" | "ticketsPurchasedBps";

export interface QueryResult<T> {
  items: T[];
  totalCount?: number;
  hasMore?: boolean;
}

export interface SingleResult<T> {
  item: T | null;
}

export const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
export const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
export const BYTES32_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isValidAddress(address: string): boolean {
  return ADDRESS_REGEX.test(address);
}

export function isValidTransactionHash(hash: string): boolean {
  return TX_HASH_REGEX.test(hash);
}

export function isValidBytes32(bytes: string): boolean {
  return BYTES32_REGEX.test(bytes);
}

export function validatePagination(first?: number, skip?: number): void {
  if (first !== undefined) {
    if (!Number.isInteger(first) || first < 0 || first > 1000) {
      throw new Error("Invalid pagination: first must be between 0 and 1000");
    }
  }

  if (skip !== undefined) {
    if (!Number.isInteger(skip) || skip < 0) {
      throw new Error("Invalid pagination: skip must be non-negative");
    }
  }
}

export function validateOrderDirection(direction?: string): OrderDirection | undefined {
  if (!direction) return undefined;

  const normalized = direction.toLowerCase();
  if (normalized !== "asc" && normalized !== "desc") {
    throw new Error('Invalid order direction: must be "asc" or "desc"');
  }

  return normalized as OrderDirection;
}

export function isUser(obj: unknown): obj is User {
  return (
    typeof obj === "object" && obj !== null && "id" in obj && "ticketsPurchasedTotalBps" in obj
  );
}

export function isLiquidityProvider(obj: unknown): obj is LiquidityProvider {
  return (
    typeof obj === "object" && obj !== null && "id" in obj && "principal" in obj && "stake" in obj
  );
}

export function isJackpotRound(obj: unknown): obj is JackpotRound {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "status" in obj &&
    "jackpotAmount" in obj
  );
}

export function isTicket(obj: unknown): obj is Ticket {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "roundId" in obj &&
    "ticketsPurchasedBps" in obj
  );
}

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_ORDER_DIRECTION = OrderDirection.DESC;

export type SerializedUser = Omit<
  User,
  | "ticketsPurchasedTotalBps"
  | "winningsClaimable"
  | "referralFeesClaimable"
  | "totalTicketsPurchased"
  | "totalWinnings"
  | "totalReferralFees"
> & {
  ticketsPurchasedTotalBps: string;
  winningsClaimable: string;
  referralFeesClaimable: string;
  totalTicketsPurchased: string;
  totalWinnings: string;
  totalReferralFees: string;
};

export type SerializedLiquidityProvider = Omit<
  LiquidityProvider,
  "principal" | "stake" | "totalDeposited" | "totalWithdrawn" | "totalFeesEarned"
> & {
  principal: string;
  stake: string;
  totalDeposited: string;
  totalWithdrawn: string;
  totalFeesEarned: string;
};

export type SerializedJackpotRound = Omit<
  JackpotRound,
  | "totalTicketsValue"
  | "totalLpSupplied"
  | "jackpotAmount"
  | "ticketCountTotalBps"
  | "winningTicketNumber"
  | "lpFeesGenerated"
  | "referralFeesGenerated"
  | "protocolFeesGenerated"
> & {
  totalTicketsValue: string;
  totalLpSupplied: string;
  jackpotAmount: string;
  ticketCountTotalBps: string;
  winningTicketNumber?: string;
  lpFeesGenerated: string;
  referralFeesGenerated: string;
  protocolFeesGenerated: string;
};

export type SerializedTicket = Omit<
  Ticket,
  "ticketsPurchasedBps" | "purchasePrice" | "blockNumber"
> & {
  ticketsPurchasedBps: string;
  purchasePrice: string;
  blockNumber: string;
};
