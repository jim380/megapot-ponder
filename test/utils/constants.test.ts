import { describe, it, expect } from "vitest";
import {
  PROTOCOL_FEE_BPS,
  REFERRAL_FEE_BPS,
  LP_FEE_BPS,
  USER_POOL_BPS,
  ZERO_ADDRESS,
  PROTOCOL_ADDRESS,
  MEGAPOT_CONTRACT_ADDRESS,
} from "../../src/utils/constants";

describe("Fee Constants", () => {
  it("should have valid fee percentages", () => {
    expect(PROTOCOL_FEE_BPS).toBeGreaterThanOrEqual(0);
    expect(PROTOCOL_FEE_BPS).toBeLessThanOrEqual(10000);

    expect(REFERRAL_FEE_BPS).toBeGreaterThanOrEqual(0);
    expect(REFERRAL_FEE_BPS).toBeLessThanOrEqual(10000);

    expect(LP_FEE_BPS).toBeGreaterThanOrEqual(0);
    expect(LP_FEE_BPS).toBeLessThanOrEqual(10000);

    expect(USER_POOL_BPS).toBeGreaterThanOrEqual(0);
    expect(USER_POOL_BPS).toBeLessThanOrEqual(10000);
  });

  it("should have fees that total 100% (10000 BPS)", () => {
    const totalBps =
      PROTOCOL_FEE_BPS + REFERRAL_FEE_BPS + LP_FEE_BPS + USER_POOL_BPS;
    expect(totalBps).toBe(10000n);
  });

  it("should have specific expected fee values", () => {
    expect(PROTOCOL_FEE_BPS).toBe(500n);
    expect(REFERRAL_FEE_BPS).toBe(100n);
    expect(LP_FEE_BPS).toBe(1400n);
    expect(USER_POOL_BPS).toBe(8000n);
  });
});

describe("Address Constants", () => {
  it("should have valid zero address", () => {
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
    expect(ZERO_ADDRESS).toHaveLength(42);
    expect(ZERO_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("should have valid protocol address", () => {
    expect(PROTOCOL_ADDRESS).toBeDefined();
    expect(PROTOCOL_ADDRESS).toHaveLength(42);
    expect(PROTOCOL_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(PROTOCOL_ADDRESS.toLowerCase()).toBe(PROTOCOL_ADDRESS);
  });

  it("should have valid contract address", () => {
    expect(MEGAPOT_CONTRACT_ADDRESS).toBe(
      "0x26eb7396e72b8903746b0133f7692dd1fa86bc13"
    );
    expect(MEGAPOT_CONTRACT_ADDRESS).toHaveLength(42);
    expect(MEGAPOT_CONTRACT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(MEGAPOT_CONTRACT_ADDRESS.toLowerCase()).toBe(
      MEGAPOT_CONTRACT_ADDRESS
    );
  });

  it("should have different protocol and contract addresses", () => {
    expect(PROTOCOL_ADDRESS).not.toBe(MEGAPOT_CONTRACT_ADDRESS);
    expect(PROTOCOL_ADDRESS).not.toBe(ZERO_ADDRESS);
    expect(MEGAPOT_CONTRACT_ADDRESS).not.toBe(ZERO_ADDRESS);
  });
});
