import { describe, expect, it } from "vitest";
import { createLogCursor, parseLogCursor } from "../../src/application/log-cursor.js";

describe("signed log cursor", () => {
  const secret = "cursor-test-secret";
  const value = { occurredAt: "2026-08-13T09:00:00.000Z", eventId: "891" };

  it("round trips a valid cursor", () => {
    const encoded = createLogCursor(value, secret);
    expect(parseLogCursor(encoded, secret)).toEqual(value);
  });

  it("rejects a cursor signed by another secret", () => {
    const encoded = createLogCursor(value, secret);
    expect(parseLogCursor(encoded, "different-secret")).toBeNull();
  });

  it("rejects a modified payload", () => {
    const encoded = createLogCursor(value, secret);
    const [payload, digest] = encoded.split(".");
    expect(parseLogCursor(`${payload}x.${digest}`, secret)).toBeNull();
  });
});
