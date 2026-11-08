import { describe, expect, it } from "vitest";
import { effectivePrintMode } from "./printMode";

describe("effectivePrintMode", () => {
  it("Standard establishment: everything on the receipt", () => {
    expect(effectivePrintMode("STANDARD", "INDIVIDUAL")).toBe("STANDARD");
    expect(effectivePrintMode("STANDARD", "INHERIT_ESTABLISHMENT")).toBe("STANDARD");
  });

  it("Individual establishment: one ticket per entry", () => {
    expect(effectivePrintMode("INDIVIDUAL_TICKETS", "STANDARD")).toBe("INDIVIDUAL");
  });

  it("Per ticket type: the type decides, inherit falls back to individual", () => {
    expect(effectivePrintMode("CONFIGURABLE_PER_TICKET_TYPE", "STANDARD")).toBe("STANDARD");
    expect(effectivePrintMode("CONFIGURABLE_PER_TICKET_TYPE", "INDIVIDUAL")).toBe("INDIVIDUAL");
    expect(effectivePrintMode("CONFIGURABLE_PER_TICKET_TYPE", "INHERIT_ESTABLISHMENT")).toBe("INDIVIDUAL");
  });

  it("Bootstrap cached before receiptMode existed keeps the old behaviour", () => {
    expect(effectivePrintMode(undefined, "STANDARD")).toBe("INDIVIDUAL");
  });
});
