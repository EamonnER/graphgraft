# GraphGraft

Draw pixel art (or repeating patterns) on your GitHub contribution graph while taking your **real** commits into
account. GraphGraft reads the contributions already on your graph, works out how many extra commits each day needs
so the shading comes out right, and writes them as empty, back-dated commits into a dedicated "art" repo.

- Real commits can only add to a day, never subtract, so GraphGraft adds just the difference.
- GitHub shades each day relative to your busiest day, so adding art can change how your real days look. The solver
  accounts for this.
- It never pushes anything. You review the plan, write the commits locally, and push yourself.

> **Heads-up:** art commits are permanent unless you delete the art repo (see [Removing the art](#3-remove-the-art)).
> Always run the dry run first, and read the report before you add `--yes`.

## Contents

- [Setup](#setup)
- [Examples](#examples)
- [Pattern format](#pattern-format)
- [Commands](#commands)
- [Regenerating the art](#regenerating-the-art)
- [Known limitations](#known-limitations)
- [Development](#development)

## Setup

Do this once. Each step says what you need and links to GitHub's own instructions where it's something you do on
GitHub or on your computer rather than in GraphGraft.

### 1. Install the tools

| You need | Where to get it |
|---|---|
| Node.js 20 or newer | [nodejs.org/en/download](https://nodejs.org/en/download). Check with `node -v`. |
| Git | [git-scm.com/downloads](https://git-scm.com/downloads). Check with `git --version`. |
| A GitHub account | [github.com/signup](https://github.com/signup) |

### 2. Get GraphGraft ready

Open a terminal in this project's folder, then:

```powershell
npm install
npm run build
```

You run it as `node dist/cli.js <command> ...`. Re-run `npm run build` whenever the code changes.

**Which terminal?** The commands in this README are written for **PowerShell on Windows**. On macOS or Linux the
only differences are:

| Windows PowerShell | macOS / Linux (bash, zsh) |
|---|---|
| a backtick `` ` `` at the end of a line continues the command | a backslash `\` at the end of a line |
| `$env:GITHUB_TOKEN = "abc"` | `export GITHUB_TOKEN="abc"` |
| `Remove-Item Env:GITHUB_TOKEN` | `unset GITHUB_TOKEN` |
| `cd ..\commit-art` | `cd ../commit-art` |

### 3. Find your GitHub details

You'll need these in the commands below.

- **Your username**: shown on your profile page, e.g. `octocat` in `github.com/octocat`.
- **Your "noreply" commit email**: open [github.com/settings/emails](https://github.com/settings/emails). Under
  "Keep my email addresses private" GitHub shows an address that looks like
  `12345678+octocat@users.noreply.github.com`. Copy it exactly. Commits made with this address always count towards
  your graph. More background:
  [Setting your commit email address](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-email-preferences/setting-your-commit-email-address).
- **Your name**: any name you like for the commits' author, e.g. `Octo Cat`.

### 4. Turn on private contributions

The art repo is best kept **private** (so it doesn't clutter your profile), but private repos only show on your graph
if you allow it. On your profile page, open **Contribution settings** above the calendar and make sure **Private
contributions** is selected. Instructions:
[Showing your private contributions on your profile](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/showing-your-private-contributions-and-achievements-on-your-profile).

### 5. Create the art repo and clone it

Create a **dedicated** repo for the art. Nothing else should live in it.

1. Go to [github.com/new](https://github.com/new) and
   follow [Creating a new repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).
2. Name it `commit-art` (the examples below use this name), choose **Private**, and leave **everything else
   unticked**: no README, no .gitignore, no licence. It must start empty.
3. Clone it into the folder **next to** the GraphGraft project, so that it is at `../commit-art`
   ([how cloning works](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)):

   ```powershell
   git clone https://github.com/YOUR_USERNAME/commit-art.git ../commit-art
   ```

   Git will warn that you "appear to have cloned an empty repository". That is expected.

Commits only count towards your graph if they are on the repo's **default branch**, in a repo that isn't a fork, and
use an email address linked to your account. The noreply address from step 3 always works. See GitHub's
[Why are my contributions not showing up?](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/why-are-my-contributions-not-showing-up-on-my-profile).

### Personal Access Token (Classic)

GraphGraft needs a GitHub token to read your contribution calendar (and, for `clean`, to delete the art repo).
It reads the token from the `GITHUB_TOKEN` environment variable. It is never accepted as an argument, so it doesn't
end up in your shell history. Set it for the current terminal session only:

```powershell
$env:GITHUB_TOKEN = "paste-your-token-here"
# ... when you are done:
Remove-Item Env:GITHUB_TOKEN
```

**Creating a token:** open [github.com/settings/tokens](https://github.com/settings/tokens), choose
**Generate new token** then **Generate new token (classic)**, give it a name, set a **short expiry** (a day or a week),
tick only the scope listed below, and click **Generate token**. GitHub shows the token **once**, so copy it right
away. Step-by-step guide:
[Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

Treat a token like a password: don't paste it into chat, issues, or files. When you're done, remove it from your
terminal (as above) and delete it on the tokens page.

The same variable, `GITHUB_TOKEN`, is used by every command, both for reading your contribution data (`plan`,
`apply`) and for deleting the repo (`clean`). So set it to the right token before each command: the read-only token for
`plan`/`apply`, the repo-deleting token for `clean`, and remove it again afterwards.

| Command | Token needed |
|---|---|
| `plan`, `apply` | A classic token with the `read:user` scope (it only reads your contribution calendar). Use a short expiry. |
| `clean` | A classic token with the `delete_repo` scope and admin rights on the repo. Use a **separate, short-lived** token for this, so your everyday token can't delete repos. |

A fine-grained token limited to the art repo (permission "Administration: read and write") may also work for `clean`.
That is untested, so the classic token is the documented route.

## Examples

Three full walkthroughs, each starting from the setup above. They are meant to be copied and pasted, so look
carefully at the values you have to replace.

### Assumptions

- You've finished [Setup](#setup): Node.js and Git are installed, `npm run build` has been run, private contributions
  are on, and an **empty private repo** called `commit-art` is cloned at `../commit-art` (next to this project).
- You're using **PowerShell**, in this project's folder. (See the table in Setup for other terminals.)
- Your art repo's default branch is `main`.
- The dates are in the **past** (or today). Commits dated in the future don't show on your graph until that date.
- The date range is **at most one year**, and `--start` is a **Sunday**.
- The numbers in "what you should see" assume you have **no real commits** in those weeks. If you do, GraphGraft works
  around them, so your totals will differ.

### Values you must replace

Everything in `ALL_CAPS` is **yours to fill in**. Everything else you can copy as it is.

| Placeholder | What to put there | Where to find it |
|---|---|---|
| `YOUR_USERNAME` | Your GitHub username | Your profile page |
| `YOUR_NAME` | The author name for the commits, in quotes | Anything you like |
| `YOUR_NOREPLY_EMAIL` | Your noreply email, in quotes | [github.com/settings/emails](https://github.com/settings/emails) |
| `paste-your-token-here` | Your token | [Personal Access Token](#personal-access-token-classic) |

---

### 1. Draw a pattern once

This draws the diamond from `examples/diamond.txt` over seven weeks, starting on Sunday 5 April 2026.

**1. Create (or choose) a pattern.** You can use the ready-made `examples/diamond.txt`. To make your own, save a plain
text file with 7 lines (one per weekday, Sunday to Saturday), for example as `examples/my-pattern.txt`. See
[Pattern format](#pattern-format) for what each character means.

```
...4...
..343..
.23432.
1234321
.23432.
..343..
...4...
```

**2. Set your read token** (for `plan` and `apply`):

```powershell
$env:GITHUB_TOKEN = "paste-your-token-here"
```

**3. Dry run.** This only reads from GitHub and writes nothing:

```powershell
node dist/cli.js plan --login YOUR_USERNAME --from 2026-04-05 --to 2026-05-30 `
  --pattern examples/diamond.txt --start 2026-04-05 --art-repo ../commit-art
```

What you should see: `Commits to add: 72 over 25 days`, `Conflicts: none`, an empty **Current graph**, and the
diamond in the **Predicted graph**:

```
...4....
..343...
.23432..
1234321.
.23432..
..343...
...4....
```

**4. Write the commits locally.** The same command with `apply`, your commit identity, and `--yes`:

```powershell
node dist/cli.js apply --login YOUR_USERNAME --from 2026-04-05 --to 2026-05-30 `
  --pattern examples/diamond.txt --start 2026-04-05 --art-repo ../commit-art `
  --name "YOUR_NAME" --email "YOUR_NOREPLY_EMAIL" --yes
```

Without `--yes`, `apply` only shows the report. Nothing is on GitHub yet. To check, count the new commits:

```powershell
git -C ../commit-art log --oneline | Measure-Object -Line
```

You should see 72.

**5. Push it yourself.** GraphGraft never pushes. The first push into an empty repo:

```powershell
git -C ../commit-art push -u origin main
```

Git may ask you to sign in to GitHub the first time.

**6. Check your profile.** Reload your GitHub profile. The diamond should appear within a minute or so, starting at
the week of 5 April 2026. If you see nothing, check that private contributions are on and that the email you used is
linked to your account.

**7. Check that a re-run is safe** (optional). Run the `apply` command from step 4 again, without `--yes`. It should
say **"Nothing to add"**, because the art is already there.

**8. Remove the token** from your terminal:

```powershell
Remove-Item Env:GITHUB_TOKEN
```

---

### 2. Repeat a pattern across a longer range

`--repeat` tiles the pattern across the whole date range, starting at `--start`. This repeats the 4-week zigzag in
`examples/stripes.txt` for 12 weeks (three repeats).

With your read token set (see walkthrough 1, step 2), run the dry run:

```powershell
node dist/cli.js plan --login YOUR_USERNAME --from 2026-04-05 --to 2026-06-27 `
  --pattern examples/stripes.txt --start 2026-04-05 --art-repo ../commit-art --repeat
```

What you should see: `repeating every 4 weeks` in the Pattern line, and about 57 commits over 21 days if you have no
real commits there. Add `--gap 2` (two blank weeks between tiles) to space the repeats out:

```powershell
node dist/cli.js plan --login YOUR_USERNAME --from 2026-04-05 --to 2026-06-27 `
  --pattern examples/stripes.txt --start 2026-04-05 --art-repo ../commit-art --repeat --gap 2
```

When you're happy, add `--name "YOUR_NAME" --email "YOUR_NOREPLY_EMAIL" --yes` and use `apply` instead of `plan`, then
push as in walkthrough 1.

> Tiling over a full year can need thousands of commits. Read the total in the dry run first, and see
> [Known limitations](#known-limitations).

---

### 3. Remove the art

Force-pushing the commits away does **not** remove them from your graph. The reliable way is to delete the art repo
(see [Why a deleted repo and not a force-push?](#why-a-deleted-repo-and-not-a-force-push)). This is **permanent**.

**1. Create a delete token.** Make a **separate**, short-lived classic token with only the `delete_repo` scope (see
[Personal Access Token](#personal-access-token-classic)) and set it:

```powershell
$env:GITHUB_TOKEN = "paste-your-delete-token-here"
```

**2. Check first.** Without `--yes`, nothing is deleted. It only checks that this is really your art repo:

```powershell
node dist/cli.js clean --repo YOUR_USERNAME/commit-art --art-repo ../commit-art
```

What you should see: `Dry run: nothing was deleted`, and a line saying the repo's commit count matches your art
commits.

**3. Delete it.** `--confirm` must be the same `owner/name` as `--repo`, which stops typos:

```powershell
node dist/cli.js clean --repo YOUR_USERNAME/commit-art --art-repo ../commit-art --yes --confirm YOUR_USERNAME/commit-art
```

This deletes the repo on GitHub ([what deleting a repository means](https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository)).
Your local `../commit-art` folder is **not** touched.

**4. Remove the token** from your terminal, and delete it on the [tokens page](https://github.com/settings/tokens):

```powershell
Remove-Item Env:GITHUB_TOKEN
```

**5. Refresh your graph.** GitHub caches the graph, so the art can linger. On your profile, open **Contribution
settings** and turn **Private contributions** off, save, then turn it on again
([how](https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/showing-your-private-contributions-and-achievements-on-your-profile)).
The art should disappear. GitHub's docs say refreshes can take up to about a day.

**6. Draw something new** (optional). Create a new empty `commit-art` repo and clone it again (Setup, step 5) after
deleting or renaming the old local folder, then start from walkthrough 1. See also
[Regenerating the art](#regenerating-the-art).

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

Any plain-text editor works (Notepad, VS Code, ...). A byte-order mark at the start of the file, which some Windows
editors add, is ignored.

## Commands

In the commands below, `<user>` and similar angle-bracket values are placeholders for your own details. The
[Examples](#examples) use `ALL_CAPS` placeholders you can paste in.

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
2. On GitHub, turn **Private contributions** off, save, then on again (see
   [Setup, step 4](#4-turn-on-private-contributions)). This forces the graph to refresh, and it can't be automated.
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

## Known limitations

- **Very large plans may not fully show on the graph.** In one test, a single push of about 4,950 commits into a new
  repo was counted in full. A second push of about 4,500 older-dated commits, made on top of it about ten minutes
  later, reached GitHub (they show in the repo's history), but the graph counted only the newest 1,000 of them. The
  cause isn't known (a limit on pushes to an existing branch, or GitHub still processing). If you need thousands of
  commits, prefer one push into a freshly created repo, and keep date ranges and `--max-per-day` modest.
- **The graph is cached.** Removals in particular can take up to about a day to show.
- **The shading model is an approximation.** GitHub doesn't publish its algorithm; GraphGraft assumes four equal
  quarters of your busiest day's count. Check the "Predicted graph" against your real graph after your first push.

## Development

```powershell
npm test          # run the tests
npm run typecheck # type-check without building
```

Layout: `src/model` (shading model, baseline, simulation), `src/solver` (works out the commits per day),
`src/art` (pattern parsing and graph rendering), `src/github` (calendar and repo API calls), `src/git` (reading and
writing art commits), `src/commands` (`plan`, `apply`, `clean`), `src/cli` (argument parsing).
