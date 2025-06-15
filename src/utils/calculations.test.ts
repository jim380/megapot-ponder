import { describe, it, expect } from "vitest";
import {
  generateEventId,
  calculateProtocolFee,
  calculateReferralFee,
  calculateLpFee,
  calculateUserPoolShare,
} from "./calculations";
import {
  PROTOCOL_FEE_BPS,
  REFERRAL_FEE_BPS,
  LP_FEE_BPS,
  USER_POOL_BPS,
} from "./constants";

describe("generateEventId", () => {
  it("should generate a unique event ID from transaction hash and log index", () => {
    const txHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const logIndex = 5;
    const eventId = generateEventId(txHash, logIndex);
    expect(eventId).toBe(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef-5"
    );
  });

  it("should handle log index 0", () => {
    const txHash =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const logIndex = 0;
    const eventId = generateEventId(txHash, logIndex);
    expect(eventId).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-0"
    );
  });

  it("should handle large log index", () => {
    const txHash =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const logIndex = 999999;
    const eventId = generateEventId(txHash, logIndex);
    expect(eventId).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000-999999"
    );
  });
});

describe("calculateProtocolFee", () => {
  it("should calculate correct protocol fee for standard amount", () => {
    const amount = 1000000n;
    const expectedFee = (amount * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
    expect(calculateProtocolFee(amount)).toBe(expectedFee);
  });

  it("should return 0 for zero amount", () => {
    expect(calculateProtocolFee(0n)).toBe(0n);
  });

  it("should handle large amounts", () => {
    const amount = 1000000000000n;
    const expectedFee = (amount * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
    expect(calculateProtocolFee(amount)).toBe(expectedFee);
  });

  it("should handle amounts that result in fractional fees (rounding down)", () => {
    const amount = 1n;
    const expectedFee = (amount * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
    expect(calculateProtocolFee(amount)).toBe(expectedFee);
  });
});

describe("calculateReferralFee", () => {
  it("should calculate correct referral fee for standard amount", () => {
    const amount = 1000000n;
    const expectedFee = (amount * BigInt(REFERRAL_FEE_BPS)) / 10000n;
    expect(calculateReferralFee(amount)).toBe(expectedFee);
  });

  it("should return 0 for zero amount", () => {
    expect(calculateReferralFee(0n)).toBe(0n);
  });

  it("should handle large amounts", () => {
    const amount = 50000000000n;
    const expectedFee = (amount * BigInt(REFERRAL_FEE_BPS)) / 10000n;
    expect(calculateReferralFee(amount)).toBe(expectedFee);
  });
});

describe("calculateLpFee", () => {
  it("should calculate correct LP fee for standard amount", () => {
    const amount = 1000000n;
    const expectedFee = (amount * BigInt(LP_FEE_BPS)) / 10000n;
    expect(calculateLpFee(amount)).toBe(expectedFee);
  });

  it("should return 0 for zero amount", () => {
    expect(calculateLpFee(0n)).toBe(0n);
  });

  it("should be the largest fee component", () => {
    const amount = 1000000n;
    const lpFee = calculateLpFee(amount);
    const protocolFee = calculateProtocolFee(amount);
    const referralFee = calculateReferralFee(amount);

    expect(lpFee).toBeGreaterThan(protocolFee);
    expect(lpFee).toBeGreaterThan(referralFee);
  });
});

describe("calculateUserPoolShare", () => {
  it("should calculate correct user pool share for standard amount", () => {
    const amount = 1000000n;
    const expectedShare = (amount * BigInt(USER_POOL_BPS)) / 10000n;
    expect(calculateUserPoolShare(amount)).toBe(expectedShare);
  });

  it("should return 0 for zero amount", () => {
    expect(calculateUserPoolShare(0n)).toBe(0n);
  });

  it("should equal total minus all fees", () => {
    const amount = 1000000n;
    const userShare = calculateUserPoolShare(amount);
    const protocolFee = calculateProtocolFee(amount);
    const referralFee = calculateReferralFee(amount);
    const lpFee = calculateLpFee(amount);

    const totalFees = protocolFee + referralFee + lpFee;
    const expectedUserShare = amount - totalFees;

    expect(userShare).toBe(expectedUserShare);
  });

  it("should verify all fees add up to 100%", () => {
    const totalBps =
      PROTOCOL_FEE_BPS + REFERRAL_FEE_BPS + LP_FEE_BPS + USER_POOL_BPS;
    expect(totalBps).toBe(10000n);
  });
});
