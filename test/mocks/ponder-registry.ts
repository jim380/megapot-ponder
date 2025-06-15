import { vi } from "vitest";

const handlers: Record<string, Function> = {};

export const ponder = {
  on: vi.fn((eventName: string, handler: Function) => {
    handlers[eventName] = handler;
  }),
};

export const getHandlers = () => handlers;

export const users = {};
export const rounds = {};
export const ticketPurchases = {};
export const liquidityProviders = {};
export const lpActions = {};
export const winWithdrawals = {};
export const referralFeeWithdrawals = {};
export const protocolFeeWithdrawals = {};
export const lpSnapshots = {};
export const hourlyAggregations = {};

export const tickets = {};
export const jackpotRounds = {};
export const withdrawals = {};
export const feeDistributions = {};
