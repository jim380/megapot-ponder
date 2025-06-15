import { vi } from "vitest";
import { mockTables } from "./db-v11";

const handlers: Record<string, Function> = {};

const mockPonder = {
  on: vi.fn((eventName: string, handler: Function) => {
    handlers[eventName] = handler;
  }),
  __handlers: handlers,
};

(global as any).ponder = mockPonder;

export const ponder = mockPonder;
export const getHandlers = () => handlers;

export const {
  users,
  liquidityProviders,
  jackpotRounds,
  tickets,
  lpActions,
  withdrawals,
  feeDistributions,
  referrals,
  lpRoundSnapshots,
  hourlyStats,
} = mockTables;
