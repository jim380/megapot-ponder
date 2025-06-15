import { vi } from "vitest";
import { mockTables } from "./mocks/db-v11";

export const handlers: Record<string, Function> = {};

export function setupMocks() {
  Object.keys(handlers).forEach((key) => delete handlers[key]);

  vi.doMock("ponder:registry", () => ({
    ponder: {
      on: (eventName: string, handler: Function) => {
        handlers[eventName] = handler;
      },
    },
  }));

  vi.doMock("ponder:schema", () => ({
    ...mockTables,
    default: mockTables,
    ponder: {},
  }));
}

setupMocks();
