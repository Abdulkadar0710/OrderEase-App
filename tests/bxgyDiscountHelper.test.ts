import { describe, it, expect } from "vitest";
import {
  round2,
  decodeTag,
  encodeTag,
  TAG_PREFIX,
  type DecodedTag,
} from "../app/utils/bxgyDiscountHelper.server";

describe("bxgyDiscountHelper utilities", () => {
  it("round2 rounds numbers correctly to two decimal places", () => {
    expect(round2(10.555)).toBe(10.56);
    expect(round2(10.554)).toBe(10.55);
    expect(round2(0)).toBe(0);
    expect(round2(99.999)).toBe(100);
  });

  it("decodeTag parses tags with embedded JSON metadata safely", () => {
    const rawTag = `${TAG_PREFIX}{"c":15.5,"p":10.0,"o":0,"bxgy":{"code":"BUY1GET1"}} SUMMER20`;
    const decoded = decodeTag(rawTag);

    expect(decoded).not.toBeNull();
    expect(decoded?.checkoutAmount).toBe(15.5);
    expect(decoded?.productAmount).toBe(10.0);
    expect(decoded?.label).toBe("SUMMER20");
    expect(decoded?.bxgy?.code).toBe("BUY1GET1");
  });

  it("decodeTag returns null for invalid tags", () => {
    expect(decodeTag(null)).toBeNull();
    expect(decodeTag("")).toBeNull();
    expect(decodeTag("regular description without prefix")).toBeNull();
    expect(decodeTag(`${TAG_PREFIX}not-json`)).toBeNull();
    expect(decodeTag(`${TAG_PREFIX}{unclosed json`)).toBeNull();
  });

  it("encodeTag limits length and handles fallback label", () => {
    const tagWithBxgy: DecodedTag = {
      checkoutAmount: 0,
      productAmount: 10,
      orderAmount: 0,
      label: "Fallback",
      bxgy: { code: "VERY_LONG_DISCOUNT_CODE_THAT_EXCEEDS_FORTY_CHARACTERS_IN_LENGTH" },
    };
    const encoded = encodeTag(tagWithBxgy);
    expect(encoded.length).toBeLessThanOrEqual(40);
    expect(encoded).toBe("VERY_LONG_DISCOUNT_CODE_THAT_EXCEEDS_FOR");
  });
});
