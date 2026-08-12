import { describe, expect, it } from "vitest";
import { readAggregateCriteria } from "../../src/application/read-aggregate-query.js";
import { QueryInputError, readLogSearchCriteria } from "../../src/application/read-log-query.js";

describe("query input parsing", () => {
  it("reads search filters and applies the default page size", () => {
    const criteria = readLogSearchCriteria(
      {
        service: "checkout",
        level: "error",
        since: "2026-08-13T00:00:00Z",
        "attr.region": "west",
      },
      "secret",
    );

    expect(criteria).toMatchObject({
      source: "checkout",
      severity: "error",
      metadata: { region: "west" },
      pageSize: 100,
    });
  });

  it("rejects duplicated scalar filters", () => {
    expect(() => readLogSearchCriteria({ level: ["info", "error"] }, "secret")).toThrow(
      QueryInputError,
    );
  });

  it("requires a valid aggregation range and bucket", () => {
    const criteria = readAggregateCriteria({
      since: "2026-08-13T00:00:00Z",
      until: "2026-08-14T00:00:00Z",
      bucket: "5m",
      group_by: "service",
    });

    expect(criteria.bucket).toBe("5m");
    expect(criteria.groupBy).toBe("service");
  });

  it("rejects reversed aggregation ranges", () => {
    expect(() =>
      readAggregateCriteria({
        since: "2026-08-14T00:00:00Z",
        until: "2026-08-13T00:00:00Z",
        bucket: "1h",
      }),
    ).toThrow("until must be after since");
  });
});
