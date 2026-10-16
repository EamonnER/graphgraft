import { describe, expect, test, vi } from "vitest";
import { deleteRepo, getRepoCommitCount } from "./repos.js";

function mockFetch(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const ref = { owner: "octocat", name: "commit-art", token: "secret-token" };

const withCount = (totalCount: number) => ({
  data: { repository: { defaultBranchRef: { target: { history: { totalCount } } } } },
});

describe("getRepoCommitCount", () => {
  test("returns the default branch's total commit count", async () => {
    expect(await getRepoCommitCount({ ...ref, fetch: mockFetch(withCount(73)) })).toBe(73);
  });

  test("an empty repo (no default branch) has 0 commits", async () => {
    const body = { data: { repository: { defaultBranchRef: null } } };
    expect(await getRepoCommitCount({ ...ref, fetch: mockFetch(body) })).toBe(0);
  });

  test("sends the owner, name and bearer token, and keeps the token out of the URL and body", async () => {
    const fetchMock = mockFetch(withCount(1));
    await getRepoCommitCount({ ...ref, fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body as string).variables).toEqual({ owner: "octocat", name: "commit-art" });
    expect(url).not.toContain("secret-token");
    expect(init.body).not.toContain("secret-token");
  });

  test("throws when the repository does not exist", async () => {
    const fetchMock = mockFetch({ data: { repository: null } });
    await expect(getRepoCommitCount({ ...ref, fetch: fetchMock })).rejects.toThrow("not found: octocat/commit-art");
  });

  test("throws GitHub's GraphQL errors and HTTP failures", async () => {
    await expect(
      getRepoCommitCount({ ...ref, fetch: mockFetch({ errors: [{ message: "Bad credentials" }] }) }),
    ).rejects.toThrow("Bad credentials");
    const failed = mockFetch({}, { ok: false, status: 401, statusText: "Unauthorized" });
    const error = await getRepoCommitCount({ ...ref, fetch: failed }).catch((e: Error) => e);
    expect((error as Error).message).toContain("401");
    expect((error as Error).message).not.toContain("secret-token");
  });
});

describe("deleteRepo", () => {
  test("sends DELETE to the repo URL with the token and succeeds on 204", async () => {
    const fetchMock = mockFetch(undefined, { status: 204, statusText: "No Content" });
    await expect(deleteRepo({ ...ref, fetch: fetchMock })).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/octocat/commit-art");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(url).not.toContain("secret-token");
  });

  test("explains a 403 as a missing scope or rights", async () => {
    const fetchMock = mockFetch({}, { ok: false, status: 403, statusText: "Forbidden" });
    await expect(deleteRepo({ ...ref, fetch: fetchMock })).rejects.toThrow("delete_repo scope");
  });

  test("explains a 404 as not found or not visible", async () => {
    const fetchMock = mockFetch({}, { ok: false, status: 404, statusText: "Not Found" });
    await expect(deleteRepo({ ...ref, fetch: fetchMock })).rejects.toThrow("not found, or the token cannot see it");
  });

  test("treats any other status as a failure, and does not treat 200 as deleted", async () => {
    await expect(deleteRepo({ ...ref, fetch: mockFetch({}, { status: 500, statusText: "Server Error" }) })).rejects.toThrow("500");
    await expect(deleteRepo({ ...ref, fetch: mockFetch({}, { status: 200 }) })).rejects.toThrow("200");
  });

  test("never leaks the token in an error", async () => {
    const fetchMock = mockFetch({}, { ok: false, status: 403, statusText: "Forbidden" });
    const error = await deleteRepo({ ...ref, fetch: fetchMock }).catch((e: Error) => e);
    expect((error as Error).message).not.toContain("secret-token");
  });
});

describe("repository name validation", () => {
  test("rejects names that could change the request path, before any request", async () => {
    const fetchMock = mockFetch(withCount(1));
    for (const bad of [
      { owner: "octo/cat", name: "x" },
      { owner: "octocat", name: "x/../../user" },
      { owner: "octocat", name: ".." },
      { owner: "", name: "x" },
      { owner: "octocat", name: "" },
      { owner: "-octocat", name: "x" },
    ]) {
      await expect(deleteRepo({ ...ref, ...bad, fetch: fetchMock })).rejects.toThrow(RangeError);
      await expect(getRepoCommitCount({ ...ref, ...bad, fetch: fetchMock })).rejects.toThrow(RangeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
