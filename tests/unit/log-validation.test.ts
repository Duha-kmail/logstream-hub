import { describe, expect, it } from "vitest";
import { readBatchBody, validateLogBatch } from "../../src/application/validate-log-batch.js";

const fixedNow = new Date("2026-08-13T10:00:00.000Z");

describe("log batch validation", () => {
  it("normalizes a valid entry into the domain model", () => {
    const result = validateLogBatch(
      [
        {
          timestamp: "2026-08-13T09:55:00.000Z",
          level: "warn",
          service: " billing ",
          message: " retry scheduled ",
          attributes: { attempt: 2, cached: false },
        },
      ],
      fixedNow,
    );

    expect(result.rejected).toEqual([]);
    expect(result.accepted[0]).toMatchObject({
      severity: "warn",
      source: "billing",
      content: "retry scheduled",
      metadata: { attempt: 2, cached: false },
    });
  });

  it("keeps the original positions of rejected entries", () => {
    const result = validateLogBatch(
      [null, { timestamp: "invalid" }, { level: "fatal" }],
      fixedNow,
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((entry) => entry.position)).toEqual([0, 1, 2]);
  });

  it("rejects nested attribute values", () => {
    const result = validateLogBatch(
      [
        {
          timestamp: "2026-08-13T09:55:00.000Z",
          level: "info",
          service: "api",
          message: "request handled",
          attributes: { request: { id: "42" } },
        },
      ],
      fixedNow,
    );

    expect(result.rejected[0]?.message).toContain("string, finite number, or boolean");
  });

  it("requires a logs array at the request boundary", () => {
    expect(readBatchBody({ entries: [] })).toEqual({
      issue: "request body must contain a logs array",
    });
  });
});
