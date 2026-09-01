# Balance the Bench — Team Roster Builder

A tool for splitting a full **recreational** season's hockey registration
list into balanced teams — built for house-league/rec play, not for seeding
a competitive tryout draft. Upload a players spreadsheet and a coaches
spreadsheet, set how many teams you're forming, and it assigns every player
to a team — honoring the requests that matter most (coach pairings,
siblings, avoid requests), then balancing everything else (skater strength,
position counts, birth year, rating spread, goalie counts, and female
pairing) as evenly as possible around them.

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
| `Rating` | Yes | `1`-`5`, decimals are fine (e.g. `3.5`). Drives strength balancing and the 4+/under-2 spread. |
| `Gender` | Yes | `Male` or `Female`. Used for the female-pairing rule. |
| `Position` | Yes | `Goalie`, `Forward`, or `Defense`. Common variants are also recognized (case-insensitive): `Defence`, `Def`, `D`, `Fwd`, `F`, `Goaltender`, `Goalkeeper`, `G`. Anything else is flagged as an error rather than silently ignored — an unrecognized position previously meant that player was invisible to position balancing and the roster cap, which was a real bug fixed in this version. |
| `Teammate Request 1` / `2` / `3` | No | Up to 3 requests, each naming another player exactly matching their `Name` field. |
| `Teammate Reason 1` / `2` / `3` | No | One of `Sibling`, `Avoid`, `Transportation`, `Friend` — required for whichever request number it pairs with (e.g. `Teammate Reason 2` goes with `Teammate Request 2`). |

### Coaches CSV

One row per coach — every head coach, assistant coach, **and** manager goes
in this same file.

| Column | Required | Notes |
|---|---|---|
| `Coach` | Yes | The coach's name. |
| `Role` | Yes | `Head`, `Assistant`, or `Manager`. The number of `Head` rows must equal the number of teams you set — each team is anchored to one head coach. Managers are tracked separately and don't count toward the 5-coach cap below. |
| `Coach Request 1` / `2` / `3` | No | Up to 3 other coaches (any role, by name) this person wants to coach with. Not a final assignment — the app resolves these into groups (see [Priority order](#priority-order) below). |
| `Childs Names` | No | Semicolon-separated if more than one (`Jane Doe; John Doe`). Leave blank if this coach has no kids on the roster. Matched players are automatically locked to wherever *this coach* ends up — an assistant's child follows the assistant's resolved team, not the team they happened to be listed near in the CSV. |

The number of `Head`-role rows must equal the number of teams you set in
the app. **Each team is capped at 5 coaches counting Head + Assistant only**
— Managers are unlimited and don't count against that cap, so a team can
have its 5 Head/Assistants plus one or more Managers. If a coaching-together
request would push a team's Head+Assistant count over 5, it's still honored
(coach-pairing is the top priority) and flagged as an error so you know to
review it.

### Starting from scratch (blank templates)

If you don't have a spreadsheet ready yet, the app has a "New here? Start
with a blank template" box above the upload step with **Download blank
players template** / **Download blank coaches template** buttons. Each
template has the correct headers plus a few rows marked `EXAMPLE` showing
the format in use, including how a teammate/coaching request references
another row by exact name. Delete the example rows, add your own people,
and save as CSV before uploading. No spreadsheet experience required — a
free Google Sheet works fine:

- Google Sheets: **File → Download → Comma Separated Values (.csv)**
- Excel: **File → Save As**, then choose **CSV** as the file type

The most common mistake is a typo in a request name — it has to match the
`Name` (or `Coach`) column exactly (spelling, spacing, and any middle names
or initials all count). Capitalization doesn't matter — matching is
case-insensitive — but anything else that differs will keep the app from
finding who it's referring to.

### Sample data

The app can generate a mock roster of any size, up to 200 players, entirely
in the browser — useful for trying the app before touching your real data,
or as a formatting reference. In the "Upload rosters" step, click **"Don't
have CSVs yet? Try sample data"** to expand the sample data box, then:

1. Enter how many players you want (20–200).
2. Click **"Generate sample data"** — this creates a full players CSV and a
   matching coaches CSV (head, assistant, and some manager rows, a mix of
   coaching-together requests, and some players with 2-3 teammate
   requests), with a realistic mix of positions, ratings, genders, and
   Sibling/Avoid/Transportation/Friend requests scaled to the roster size.
3. Click **"Load into app"** to use it immediately, or download either CSV.

The team count is chosen automatically based on how many players you
enter — it always picks a number of teams that fits within the app's own
roster caps (max 18 skaters and 1–2 goalies per team), so a generated
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
satisfied at once, the app resolves it as best it can and reports the
conflict as an error rather than failing silently. The last two are
**best effort** — honored whenever possible, sacrificed first when they'd
force a team badly out of balance.

1. **Coaches who want to coach together** — any coach (Head, Assistant, or
   Manager) can list up to 3 others they want to work with. These are
   requests, not final assignments: the app groups them onto the same team
   wherever that's structurally possible, anchored to whichever head coach
   is in the group.
   - Each team is capped at **5 coaches counting Head + Assistant only** —
     Managers don't count against that cap.
   - If honoring a request would push a team's Head+Assistant count over
     5, it's still honored (this is the top priority) and flagged as an
     error so you can review it.
   - A request that would require merging two different head coaches'
     teams into one can't be honored at all — that's also flagged as an
     error rather than silently dropped or arbitrarily picked.
   - Coaches with no request, or whose request didn't resolve, are spread
     evenly across teams so no team gets stuck with zero help.
2. **Sibling requests** — always kept together. A coach's own listed
   children are treated identically — automatically locked to wherever
   that coach's own coaching-request resolution placed them, whether or
   not the child also has a `Sibling` request on file.
3. **Avoid requests** — always kept apart.
4. **Transportation requests** — kept together when it doesn't come at too
   much cost to balance.
5. **Friend requests** — same as Transportation, lowest priority.

Each player can list up to 3 teammate requests (`Teammate Request 1`/`2`/`3`
paired with `Teammate Reason 1`/`2`/`3`), each independently honored
according to the priority order above.

### Balancing logic

Once hard requirements are placed, remaining players are assigned to
minimize imbalance across several dimensions at once, in this order of
weight:

1. **Total roster size per team** - every team ends up the same total size
   (goalies + skaters), within 1 player if the roster doesn't divide evenly
   across your team count (e.g. 148 players / 8 teams -> four teams of 19,
   four of 18).
2. **Forward and defense counts per team** - kept as close to even as
   roster caps and hard requirements allow.
3. **Top-rated (4+) and bottom-rated (under 2) skater counts per team** -
   spread out instead of clustering on one team.
4. **Overall / forward / defense average rating per team** - kept close to
   the roster-wide average.
5. **Birth-year split per team** - works with whatever birth years are
   actually in your data (a 2014/2015 division, a 2016/2017 division, or
   any other set), not a fixed pair.
6. **Goalies** - every team gets 1-2, assigned before skaters so no team
   is left with zero.
7. **Female pairing rule** - no team ends up with exactly one female
   player; every team has either zero or at least two.

Placement runs in two passes: an initial greedy assignment (biggest,
most-constrained groups first), followed by an iterative swap search that
keeps trying pairwise swaps between teams and keeps any swap that reduces
overall imbalance - without ever breaking a hard requirement - until no
further improving swap is found.

Because siblings, coach's kids, and avoid pairs are hard constraints, a
particularly large sibling group or an unlucky combination of requests can
still leave one team slightly less balanced than the others - including,
in rare cases, a team size more than 1 player off from the rest. The app
always shows you the resulting stats per team, and flags an explicit error
if team sizes end up unevenly split, so any trade-off is visible, not
hidden.

### Roster caps

- **Goalies:** 1-2 per team.
- **Skaters (forward + defense):** maximum 18 per team.

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

**Balance looks completely ignored, not just imperfect.** Check the "Needs
attention" errors for a Position warning first. A `Position` value the app
doesn't recognize (a typo, or a spelling like "Defence" that an older
version of the app didn't accept) makes that player invisible to position
balancing *and* to the 17-skater roster cap - they still get placed, just
with none of the position logic applied, which can produce teams far over
or under the cap. This version accepts common variants (see the CSV format
table above); any value it still can't recognize is now reported as an
error rather than failing silently.
