# GraphGraft

Draw pixel art (or repeating patterns) on your GitHub contribution graph while taking your **real** commits into
account. GraphGraft reads the contributions already on your graph, works out how many extra commits each day needs
so the shading comes out right, and writes them as empty, back-dated commits into a dedicated "art" repo.

- Real commits can only add to a day, never subtract, so GraphGraft adds just the difference.
- GitHub shades each day relative to your busiest day, so adding art can change how your real days look. The solver
  accounts for this.
- It never pushes anything. You review the plan, write the commits locally, and push yourself.

## Setup

Requires Node.js 20 or newer and Git.

```powershell
npm install
npm run build
```

Commands are run as `node dist/cli.js <command> ...`.

### Personal Access Token (Classic)

The GitHub token is read from the `GITHUB_TOKEN` environment variable. It is never accepted as an argument, so it
doesn't end up in your shell history. Set it for the current terminal session only:

```powershell
$env:GITHUB_TOKEN = "paste-your-token-here"
# ... when you are done:
Remove-Item Env:GITHUB_TOKEN
```

The same variable, `GITHUB_TOKEN`, is used by every command, both for reading your contribution data (`plan`,
`apply`) and for deleting the repo (`clean`). So set it to the right token before each command: the read-only token for
`plan`/`apply`, the repo-deleting token for `clean`, and remove it again afterwards.

| Command | Token needed |
|---|---|
| `plan`, `apply` | A classic token with the `read:user` scope (it only reads your contribution calendar). Use a short expiry. |
| `clean` | A classic token with the `delete_repo` scope and admin rights on the repo. Use a **separate, short-lived** token for this, so your everyday token can't delete repos. |

### The art repo

Create a **dedicated** repo for the art, and clone it locally. Nothing else should live in it. Private is fine as long
as "Include private contributions on my profile" is turned on in your GitHub profile settings. Commits only count if
they are on the repo's default branch and use an email address linked to your account (the
`<id>+<username>@users.noreply.github.com` address always works).

## Pattern format

A pattern is a plain text file of **7 rows** (Sunday to Saturday) and any number of columns (one per week). Each
character is one day:

| Character | Meaning |
|---|---|
| `1` - `4` | Target shade, from lightest to darkest |
| `0` | The day must stay empty |
| `.` | Don't care: leave the day alone |

Example, a small diamond (`examples/diamond.txt`):

```
...4...
..343..
.23432.
1234321
.23432.
..343..
...4...
```

The top-left cell lands on `--start`, which must be a **Sunday**. Cells outside `--from`/`--to` are skipped (the
report says how many).

Shades are relative to your busiest day, so a pattern with only light cells can't be drawn unless your real activity
already sets the scale. Include at least one `4` (the report lists cells that can't be matched as conflicts).

## Commands

### `plan`: dry run

Shows what it would take to draw the pattern. Writes nothing.

```powershell
node dist/cli.js plan --login <user> --from 2026-04-05 --to 2026-05-30 `
  --pattern examples/diamond.txt --start 2026-04-05 --art-repo ../commit-art
```

The report shows the commits to add, any conflicts, and the **current** and **predicted** graph side by side.

- `--art-repo` lets GraphGraft tell its own earlier art apart from your real commits. Without it, art already on your
  graph is treated as real activity, and the report warns you.
- `--max-per-day` (default 50) caps the busiest day's total. Raise it only if the report shows conflicts caused by a
  very busy real day.
- The date range can be at most one year (a GitHub API limit).

**Conflicts** are days that can't be made to match: real commits are already too bright for the target shade (or the
day should be empty but has commits). Those days are left alone. The report lists the first 20 conflicts and
summarises the rest ("... and N more"); the count at the top is always exact.

#### Repeating a pattern

`--repeat` tiles the pattern across the whole `--from`/`--to` range instead of placing it once. It works with both
`plan` and `apply`.

```powershell
node dist/cli.js plan --login <user> --from 2026-04-05 --to 2026-09-26 `
  --pattern examples/stripes.txt --start 2026-04-05 --art-repo ../commit-art --repeat
```

- The tile repeats every *width* weeks, **forward from `--start`**. Days before `--start` are left alone, and the last
  tile is clipped at `--to`. If `--start` is earlier than `--from`, the pattern still begins at `--start`, so you can
  choose where in the tile the range begins.
- `--gap <weeks>` (only with `--repeat`) adds blank weeks between tiles, so the tile repeats every *width + gap* weeks.
  Gap days are "don't care": they are left alone, not forced empty.
- Tiling over a long range creates many cells, so it needs more commits and is more likely to run into your real
  commits. Check the total and the conflicts in the dry run first, and prefer patterns with plenty of `.` cells.
- Small tiles are fine. `examples/stripes.txt` is a 4-week-wide zigzag:

  ```
  4...
  .3..
  ..2.
  ...1
  ..2.
  .3..
  4...
  ```

### `apply`: write the commits locally

Does everything `plan` does, then adds the missing art commits to the art repo.

```powershell
node dist/cli.js apply --login <user> --from 2026-04-05 --to 2026-05-30 `
  --pattern examples/diamond.txt --start 2026-04-05 --art-repo ../commit-art `
  --name "Your Name" --email "<id>+<username>@users.noreply.github.com" --yes
```

- **Without `--yes` it writes nothing.** It reports, exactly like `plan`.
- **It never pushes.** After writing it prints the push command; you run it.
- Only the difference from the art already in the repo is written, so running it twice adds nothing the second time.
- If the repo already has more art than the plan wants on some day, it refuses: commits can't be removed (see
  `clean`).
- Art commits are empty, dated 12:00 UTC, and carry the trailer `GraphGraft-Art: v1`. That trailer is how GraphGraft
  recognises its own commits later.
- If it complains that art commits aren't in the calendar yet, you haven't pushed (or GitHub hasn't refreshed yet).
  Push the art repo, wait a few seconds to minutes, and run again.

### `clean`: remove the art by deleting the repo

```powershell
node dist/cli.js clean --repo <user>/<art-repo> --art-repo ../commit-art
node dist/cli.js clean --repo <user>/<art-repo> --art-repo ../commit-art --yes --confirm <user>/<art-repo>
```

Permanently deletes the art repo on GitHub. The first form only checks. This is the only reliable way to remove art
from your graph (see below). Safeguards, all checked before anything is deleted:

- Without `--yes` nothing is deleted.
- `--confirm` must exactly match `--repo`.
- The local clone's `origin` must be that repo.
- The repo may have at most 2 commits more than the clone's art commits, so a repo with real history is refused.

Your local clone is never touched.

## Regenerating the art

You can't edit art in place. To change the pattern, or to rebuild after adding real commits in the past, delete the
repo and start again:

1. `clean ... --yes --confirm ...` deletes the GitHub repo.
2. On GitHub, go to Settings, Public profile. Untick "Include private contributions on my profile", save, then tick it
   again and save. This forces the graph to refresh, and it can't be automated.
3. Create a new, empty repo with the same name (no README or licence). Delete the local clone and clone the new repo
   (or reset the old clone to its first commit).
4. `plan` and check that "Current graph" no longer shows the old art. If it still does, the refresh hasn't happened.
5. `apply --yes`, review, and push.

Real commits you make later, even back-dated ones, are picked up automatically because `plan` and `apply` re-read your
calendar each time.

## Why a deleted repo and not a force-push?

Tested on a real account: back-dated commits showed up on the graph within about 15 seconds of a push. Force-pushing
the repo back to its first commit did **not** remove them, even after toggling the private-contributions setting.
Deleting the repo, then toggling the setting, did. GitHub's own docs say contribution displays can take up to about
24 hours to refresh after history changes.

If `plan` shows art you didn't expect, with "Commits to add: 0", it is usually this: GitHub is still showing art from
a repo you deleted or rewrote, and GraphGraft can't tell it apart from real commits.

## Development

```powershell
npm test          # run the tests
npm run typecheck # type-check without building
```

Layout: `src/model` (shading model, baseline, simulation), `src/solver` (works out the commits per day),
`src/art` (pattern parsing and graph rendering), `src/github` (calendar and repo API calls), `src/git` (reading and
writing art commits), `src/commands` (`plan`, `apply`, `clean`), `src/cli` (argument parsing).

The shading model assumes four equal quarters of your busiest day's count. GitHub doesn't publish its algorithm, so
this is an approximation; check the "Predicted graph" against your real graph after the first push.
