const API = "https://api.github.com";

const COMMIT_COUNT_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history {
            totalCount
          }
        }
      }
    }
  }
}`;

export interface RepoRef {
  owner: string;
  name: string;
  /** GitHub token. Only ever sent in the Authorization header. */
  token: string;
  /** Override for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

interface CommitCountResponse {
  data?: {
    repository: {
      defaultBranchRef: { target: { history?: { totalCount: number } } | null } | null;
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * Total number of commits on a repo's default branch. An empty repo (no default branch yet) has 0.
 */
export async function getRepoCommitCount(ref: RepoRef): Promise<number> {
  validateRepo(ref);
  const response = await (ref.fetch ?? fetch)(`${API}/graphql`, {
    method: "POST",
    headers: headers(ref.token),
    body: JSON.stringify({ query: COMMIT_COUNT_QUERY, variables: { owner: ref.owner, name: ref.name } }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as CommitCountResponse;
  if (body.errors?.length) {
    throw new Error(`GitHub API error: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  const repository = body.data?.repository;
  if (!repository) {
    throw new Error(`GitHub repository not found: ${ref.owner}/${ref.name}`);
  }
  return repository.defaultBranchRef?.target?.history?.totalCount ?? 0;
}

/**
 * Permanently delete a repo. The token needs the `delete_repo` scope and admin rights on the repo.
 */
export async function deleteRepo(ref: RepoRef): Promise<void> {
  validateRepo(ref);
  const response = await (ref.fetch ?? fetch)(`${API}/repos/${ref.owner}/${ref.name}`, {
    method: "DELETE",
    headers: headers(ref.token),
  });
  if (response.status === 204) return;

  const where = `${ref.owner}/${ref.name}`;
  if (response.status === 403) {
    throw new Error(`not allowed to delete ${where}: the token needs the delete_repo scope and admin rights`);
  }
  if (response.status === 404) {
    throw new Error(`repository not found, or the token cannot see it: ${where}`);
  }
  throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "graphgraft",
  };
}

// Owner and repo names go into a URL path, so only allow what GitHub allows.
function validateRepo({ owner, name }: RepoRef): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) {
    throw new RangeError(`invalid repository owner: ${JSON.stringify(owner)}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    throw new RangeError(`invalid repository name: ${JSON.stringify(name)}`);
  }
}
