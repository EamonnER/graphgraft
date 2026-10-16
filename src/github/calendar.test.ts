import { describe, expect, test, vi } from "vitest";
import { fetchCalendar } from "./calendar.js";

const okBody = {
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: [
            {
              contributionDays: [
                { date: "2026-01-01", contributionCount: 3 },
                { date: "2026-01-02", contributionCount: 0 },
              ],
            },
            { contributionDays: [{ date: "2026-01-03", contributionCount: 7 }] },
          ],
        },
      },
    },
  },
};

function mockFetch(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const base = { login: "octocat", token: "secret-token", from: "2026-01-01", to: "2026-01-03" };

describe("fetchCalendar", () => {
  test("flattens weeks into per-day counts", async () => {
    const counts = await fetchCalendar({ ...base, fetch: mockFetch(okBody) });
    expect(counts).toEqual({ "2026-01-01": 3, "2026-01-02": 0, "2026-01-03": 7 });
  });

  test("sends the login, date range and bearer token", async () => {
    const fetchMock = mockFetch(okBody);
    await fetchCalendar({ ...base, fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    const sent = JSON.parse(init.body as string);
    expect(sent.variables).toEqual({
      login: "octocat",
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-03T23:59:59Z",
    });
    // the token must not leak into the URL or the body
    expect(url).not.toContain("secret-token");
    expect(init.body).not.toContain("secret-token");
  });

  test("throws on a non-2xx response without leaking the token", async () => {
    const fetchMock = mockFetch({}, { ok: false, status: 401, statusText: "Unauthorized" });
    const error = await fetchCalendar({ ...base, fetch: fetchMock }).catch((e: Error) => e);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("secret-token");
  });

  test("throws GitHub's GraphQL error messages", async () => {
    const fetchMock = mockFetch({ errors: [{ message: "Bad credentials" }, { message: "Other" }] });
    await expect(fetchCalendar({ ...base, fetch: fetchMock })).rejects.toThrow("Bad credentials; Other");
  });

  test("throws when the user does not exist", async () => {
    const fetchMock = mockFetch({ data: { user: null } });
    await expect(fetchCalendar({ ...base, fetch: fetchMock })).rejects.toThrow("user not found: octocat");
  });

  test("rejects bad dates before making a request", async () => {
    const fetchMock = mockFetch(okBody);
    await expect(fetchCalendar({ ...base, from: "2026-02-30", fetch: fetchMock })).rejects.toThrow(RangeError);
    await expect(fetchCalendar({ ...base, from: "01/01/2026", fetch: fetchMock })).rejects.toThrow(RangeError);
    await expect(fetchCalendar({ ...base, from: "2026-01-04", fetch: fetchMock })).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("rejects ranges longer than one year", async () => {
    const fetchMock = mockFetch(okBody);
    await expect(
      fetchCalendar({ ...base, from: "2025-01-01", to: "2026-01-02", fetch: fetchMock }),
    ).rejects.toThrow("one year");
    // exactly 366 days (a leap-year span) is allowed
    await expect(
      fetchCalendar({ ...base, from: "2024-01-01", to: "2024-12-31", fetch: fetchMock }),
    ).resolves.toBeDefined();
  });
});
