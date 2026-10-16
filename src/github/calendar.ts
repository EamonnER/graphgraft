import type { DayCounts } from "../model/baseline.js";

const ENDPOINT = "https://api.github.com/graphql";
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}`;

export interface FetchCalendarOptions {
  login: string;
  /** GitHub token. Only ever sent in the Authorization header. */
  token: string;
  /** First day, `YYYY-MM-DD`. */
  from: string;
  /** Last day (inclusive), `YYYY-MM-DD`. At most one year after `from`. */
  to: string;
  /** Override for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

interface CalendarResponse {
  data?: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
        };
      };
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * Fetch a user's contribution counts per day from GitHub's GraphQL API.
 *
 * Private contributions are only included if the user has enabled that
 * option in their profile settings.
 */
export async function fetchCalendar(options: FetchCalendarOptions): Promise<DayCounts> {
  const { login, token, from, to } = options;
  validateRange(from, to);

  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "graphgraft",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { login, from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as CalendarResponse;
  if (body.errors?.length) {
    throw new Error(`GitHub API error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  const user = body.data?.user;
  if (!user) {
    throw new Error(`GitHub user not found: ${login}`);
  }

  const counts: DayCounts = {};
  for (const week of user.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      counts[day.date] = day.contributionCount;
    }
  }
  return counts;
}

function parseDate(value: string): number {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`invalid date, expected a real YYYY-MM-DD: ${value}`);
  }
  return time;
}

function validateRange(from: string, to: string): void {
  const start = parseDate(from);
  const end = parseDate(to);
  if (end < start) {
    throw new RangeError(`"to" (${to}) is before "from" (${from})`);
  }
  if ((end - start) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw new RangeError(`range exceeds GitHub's limit of one year per request`);
  }
}
