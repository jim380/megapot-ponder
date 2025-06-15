import { vi } from "vitest";

const handlers: Record<string, Function> = {};

export const ponder = {
  on: vi.fn((eventName: string, handler: Function) => {
    handlers[eventName] = handler;
  }),
};

export const getHandlers = () => handlers;

export const users = undefined;
export const rounds = undefined;
export const ticketPurchases = undefined;
export const liquidityProviders = undefined;
export const lpActions = undefined;
export const winWithdrawals = undefined;
export const referralFeeWithdrawals = undefined;
export const protocolFeeWithdrawals = undefined;
export const lpSnapshots = undefined;
export const hourlyAggregations = undefined;

export const tickets = undefined;
export const jackpotRounds = undefined;
export const withdrawals = undefined;
export const feeDistributions = undefined;
export const referrals = undefined;
export const lpRoundSnapshots = undefined;
export const hourlyStats = undefined;
