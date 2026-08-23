# Balance the Bench — Team Roster Builder

## Deploy to GitHub Pages (free)

1. **Create a new repo on GitHub** — e.g. `team-balancer` (public repos get free Pages hosting).

2. **Edit `vite.config.js`** — change the `base` value to match your repo name exactly:
   ```js
   base: '/team-balancer/',   // must match your repo name, with leading/trailing slashes
   ```
   Skip this step only if your repo is named `yourusername.github.io` — in that case use `base: '/'`.

3. **Push this folder to that repo:**
   ```bash
   cd team-balancer-app
   git init
   git add .
   git commit -m "Initial commitss"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/team-balancer.git
   git push -u origin main
   ```

4. **Turn on Pages via Actions** — on GitHub, go to your repo's
   **Settings → Pages**, and under "Build and deployment / Source" choose
   **GitHub Actions** (not "Deploy from a branch").

5. **Wait for the workflow to run** — check the **Actions** tab; the
   "Deploy to GitHub Pages" workflow runs automatically on every push to
   `main`. When it finishes (green check), your app is live at:
   ```
   https://YOUR_USERNAME.github.io/team-balancer/
   ```

From then on, any `git push` to `main` automatically rebuilds and redeploys.

## Running it locally first (optional but recommended)

```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`.

## Files

- `src/App.jsx` — the whole app (upload CSVs, set team count, generate/export rosters)
- `.github/workflows/deploy.yml` — the GitHub Actions workflow that builds and publishes automatically
- `vite.config.js` — **the `base` path here must match your repo name** or the deployed site will load with broken assets (blank page)
