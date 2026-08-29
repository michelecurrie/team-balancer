# Balance the Bench — Team Roster Builder

A tool for splitting a season's hockey registration list into balanced teams.
Upload a players spreadsheet and a coaches spreadsheet, set how many teams
you're forming, and it assigns every player to a team — honoring the
requests that matter most (coach pairings, siblings, avoid requests), then
balancing everything else (skater strength, position counts, birth year,
rating spread, goalie counts, and female pairing) as evenly as possible
around them.

Runs entirely in the browser. No backend, no database — CSVs go in, a
roster comes out.

---

## Table of contents

- [Running it locally](#running-it-locally)
- [Deploying to GitHub Pages](#deploying-to-github-pages-free)
- [CSV file formats](#csv-file-formats)
- [How team formation works](#how-team-formation-works)
  - [Priority order](#priority-order)
  - [Balancing logic](#balancing-logic)
  - [Roster caps](#roster-caps)
- [Reading the results](#reading-the-results)
- [Files in this repo](#files-in-this-repo)
- [Troubleshooting](#troubleshooting)

---

## Running it locally

Requires [Node.js](https://nodejs.org/) (v18+).

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Upload your CSVs there, or click **"Load
sample data"** to try it with a pre-built mock roster (106 players, 6
teams) before using your own.

To build a static production version (the same thing GitHub Actions builds
for deployment):

```bash
npm run build
```

Output lands in `dist/` — open `dist/index.html` in a browser, or serve
the folder with any static file host.

## Deploying to GitHub Pages (free)

1. **Create a repo on GitHub** (public repos get free Pages hosting) and
   push this project to it.

2. **Edit `vite.config.js`** — set `base` to match your repo name exactly:
   ```js
   base: '/your-repo-name/',
   ```
   Exception: if the repo is named `yourusername.github.io`, use
   `base: '/'` instead.

3. **Settings → Pages** — under "Build and deployment / Source," choose
   **GitHub Actions** (not "Deploy from a branch").

4. **Push to `main`.** The included workflow
   (`.github/workflows/deploy.yml`) builds and publishes automatically on
   every push. Check the **Actions** tab for progress — once it's green,
   the app is live at:
   ```
   https://yourusername.github.io/your-repo-name/
   ```

From then on, every `git push` to `main` rebuilds and redeploys
automatically.

---

## CSV file formats

### Players CSV

| Column | Required | Notes |
|---|---|---|
| `Name` | Yes | Must be unique — teammate requests and coaches' children are matched by exact name. |
| `Year of Birth` | Yes | e.g. `2014`, `2015`. Works with any birth years present in your data — used to balance the birth-year split across teams. |
| `Rating` | Yes | Integer `1`-`5`. Drives strength balancing and the 4+/under-2 spread. |
| `Gender` | Yes | `Male` or `Female`. Used for the female-pairing rule. |
| `Position` | Yes | `Goalie`, `Forward`, or `Defense`. |
| `Teammate Request` | No | Name of another player, exactly matching their `Name` field. |
| `Teammate Reason` | No | One of `Sibling`, `Avoid`, `Transportation`, `Friend`. Required if `Teammate Request` is set. |

### Coaches CSV

| Column | Required | Notes |
|---|---|---|
| `Coach` | Yes | Head coach name. One row = one team. |
| `Coach Assistant 1` / `2` / `3` | No | Assistant coaches already decided — not requests, these are final. Leave blank if a coach has no assistants yet. |
| `Childs Names` | No | Semicolon-separated if more than one (`Jane Doe; John Doe`). Leave blank for coaches with no kids on the roster. Matched players are automatically locked to that coach's team, the same as a sibling request. |

The number of rows in this file must equal the number of teams you set in
the app.

### Sample data

The app can generate a mock roster of any size, up to 200 players, entirely
in the browser — useful for trying the app before touching your real data,
or as a formatting reference. In the "Sample data" box:

1. Enter how many players you want (20–200).
2. Click **"Generate sample data"** — this creates a full players CSV and a
   matching coaches CSV, with a realistic mix of positions, ratings,
   genders, and Sibling/Avoid/Transportation/Friend requests scaled to the
   roster size.
3. Click **"Load into app"** to use it immediately, or download either CSV.

The team count is chosen automatically based on how many players you
enter — it always picks a number of teams that fits within the app's own
roster caps (max 17 skaters and 1–2 goalies per team), so a generated
roster will never be too large to place. Birth years in generated data are
illustrative (the two most recent youth-hockey birth years) — swap in
whatever years your division actually uses; the app balances on whatever
it finds in the `Year of Birth` column, not a fixed pair (see
[How team formation works](#how-team-formation-works)).

---

## How team formation works

### Priority order

Requests are honored in this order. The first three are **hard
requirements** — never broken to improve balance. If they can't all be
satisfied at once (for example, a sibling pair that would need to span two
different coaches' locked teams), the app resolves it as best it can and
reports the conflict as an error rather than failing silently. The last
two are **best effort** — honored whenever possible, sacrificed first when
they'd force a team badly out of balance.

1. **Coach / assistant coach pairings** - exactly as listed in the coaches
   CSV. Each assistant is assumed to belong to one team only; if the same
   assistant name appears under two different coaches, that's flagged as a
   data-entry error rather than resolved automatically.
2. **Sibling requests** (`Teammate Reason = Sibling`) - always kept
   together. A coach's own listed children are treated identically -
   automatically locked to that coach's team, whether or not they also
   have a `Sibling` request on file.
3. **Avoid requests** (`Teammate Reason = Avoid`) - always kept apart.
4. **Transportation requests** (`Teammate Reason = Transportation`) - kept
   together when it doesn't come at too much cost to balance.
5. **Friend requests** (`Teammate Reason = Friend`) - same as
   Transportation, lowest priority.

### Balancing logic

Once hard requirements are placed, remaining players are assigned to
minimize imbalance across several dimensions at once, in this order of
weight:

1. **Forward and defense counts per team** - kept as close to even as
   roster caps and hard requirements allow.
2. **Top-rated (4+) and bottom-rated (under 2) skater counts per team** -
   spread out instead of clustering on one team.
3. **Overall / forward / defense average rating per team** - kept close to
   the roster-wide average.
4. **Birth-year split per team** - works with whatever birth years are
   actually in your data (a 2014/2015 division, a 2016/2017 division, or
   any other set), not a fixed pair.
5. **Goalies** - every team gets 1-2, assigned before skaters so no team
   is left with zero.
6. **Female pairing rule** - no team ends up with exactly one female
   player; every team has either zero or at least two.

Placement runs in two passes: an initial greedy assignment (biggest,
most-constrained groups first), followed by an iterative swap search that
keeps trying pairwise swaps between teams and keeps any swap that reduces
overall imbalance - without ever breaking a hard requirement - until no
further improving swap is found.

Because siblings, coach's kids, and avoid pairs are hard constraints, a
particularly large sibling group or an unlucky combination of requests can
still leave one team slightly less balanced than the others. The app
always shows you the resulting stats per team so any trade-off is visible,
not hidden.

### Roster caps

- **Goalies:** 1-2 per team.
- **Skaters (forward + defense):** maximum 17 per team.

If your total goalie or skater count can't fit those caps for the number
of teams you've set, the app flags it as an error before placing anyone.

---

## Reading the results

After clicking **"Generate teams,"** you'll see:

- **Needs attention (red)** - hard requirements that couldn't be
  satisfied, roster cap violations, or data problems (e.g. a name in a
  request that doesn't match anyone in the players list).
- **Warnings (yellow)** - non-blocking issues, like a coach's listed child
  not being found in the players list.
- **Teammate requests (blue)** - a summary of every Sibling / Avoid /
  Transportation / Friend request and whether it was honored. Sibling and
  Avoid failures also show up as red errors (since they're hard
  requirements); Transportation and Friend are best-effort, so this is the
  only place you'll see which of those didn't work out and why.
- **Team cards** - one per team, showing the coach, assistants, goalie/
  forward/defense counts, average ratings, female count, birth-year split,
  4+/under-2 rated counts, and the full roster.
- **Export rosters as CSV** - downloads the final team assignments, including
  each player's team, coach, assistants, and position/rating/gender/birth
  year — plus two columns not shown elsewhere: **Coach's Child** (Yes if
  that player was one of the coach's own listed children) and **Teammate
  Request Fulfilled** (Yes/No if the player made a teammate request, blank
  if they didn't make one).

---

## Files in this repo

- `src/App.jsx` - the entire application (CSV parsing, the team-building
  algorithm, and the UI).
- `src/main.jsx` - React entry point.
- `.github/workflows/deploy.yml` - GitHub Actions workflow that builds and
  publishes to Pages on every push to `main`.
- `vite.config.js` - build config. **The `base` path here must match your
  repo name**, or the deployed site will load with broken asset paths
  (blank page).

---

## Troubleshooting

**Blank page after deploying.** Almost always one of:
- `vite.config.js`'s `base` doesn't match your repo name.
- Settings → Pages → Source isn't set to **GitHub Actions**.
- More than one workflow is deploying to Pages (e.g. a default Jekyll
  workflow got added alongside this one) and a non-Vite build is
  overwriting the real one. Check the **Actions** tab - only "Deploy Vite
  app to GitHub Pages" should be running. Delete any extra workflow files
  under `.github/workflows/` if you see others.

**Actions failing with `npm ci` / lock file errors.** `npm ci` requires an
exact `package-lock.json` in the repo. Either generate one locally
(`npm install` then commit `package-lock.json`), or change the workflow's
install step to `npm install` instead.

**A team ended up unbalanced in one specific way.** Check the "Needs
attention" and "Teammate requests" sections first - an unusual result is
often the visible trade-off of a hard requirement (a large sibling group,
several avoid pairs, or a coach's kids) rather than a bug.
