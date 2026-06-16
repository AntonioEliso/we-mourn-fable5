# We Mourn Fable 5

A digital memorial / cyberpunk protest page for Fable 5: live OFFLINE/ONLINE status,
a count-up timer ("time without Fable 5"), a petition, candles, symbolic tokens, a
Wailing Wall of messages, and Reddit sharing.

Plain Node.js (no dependencies) serving static files in `public/` plus a tiny JSON API.
Shared state (signatures, candles, tokens, comments) is stored in `data.json`.

## Run locally

```bash
node server.js          # OFFLINE (default) on http://localhost:3000
STATUS=ONLINE node server.js   # flip to ONLINE when Fable 5 returns
```

## Environment variables

| Variable    | Default        | Purpose                                                        |
|-------------|----------------|----------------------------------------------------------------|
| `PORT`      | `3000`         | Port to listen on (hosting platforms set this automatically).  |
| `STATUS`    | `OFFLINE`      | Manual status, used **only when `ANTHROPIC_API_KEY` is not set**. `ONLINE` turns the badge green. |
| `DATA_DIR`  | project folder | Where `data.json` / `stats.json` are written — point at a persistent disk in production. |
| `ANTHROPIC_API_KEY` | _(unset)_ | If set, the server pings the model on a schedule to decide ONLINE/OFFLINE automatically (see below). |
| `FABLE_MODEL` | `claude-fable-5` | The model ID the live check pings.                          |
| `CHECK_INTERVAL_HOURS` | `6`   | How often to run the live check.                               |
| `STATS_TOKEN` | _(unset)_    | Password for `/stats`. If unset, the dashboard is public.      |

## Live status check

If `ANTHROPIC_API_KEY` is set, the server calls the Messages API for `FABLE_MODEL`
every `CHECK_INTERVAL_HOURS`. Any successful response (even a refusal) means the
model is reachable → **ONLINE**; a `404 not_found` means it's gone → **OFFLINE**.
Auth / rate-limit / network errors leave the last known status unchanged. Without
a key, the badge simply reflects the manual `STATUS` env var. The front-end
re-fetches status every 5 minutes, so OFFLINE flips to ONLINE on its own.

## Deploy to Render with a persistent disk (recommended)

So the candles / signatures / comments never reset.

1. **Put the code on GitHub.**
   ```bash
   git init
   git add .
   git commit -m "We Mourn Fable 5"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/<you>/we-mourn-fable5.git
   git branch -M main
   git push -u origin main
   ```
2. On [render.com](https://render.com): **New → Web Service** and connect the repo.
3. Configure:
   - **Build Command:** *(leave empty — there are no dependencies)*
   - **Start Command:** `npm start`
   - **Instance Type:** `Starter` (the free plan can't mount a disk).
4. **Environment → Add Environment Variable:** `DATA_DIR` = `/data`
   *(add `STATUS` = `OFFLINE` too if you want to flip it later without code changes)*
5. **Disks → Add Disk:** Mount Path `/data`, Size `1 GB`.
6. **Create Web Service.** After the build you get a public URL like
   `https://we-mourn-fable5.onrender.com`.

To bring it ONLINE later: change the `STATUS` env var to `ONLINE` and redeploy.

## Alternative: Railway

New Project → Deploy from GitHub repo → add a **Volume** mounted at `/data` →
set `DATA_DIR=/data`. Railway auto-runs `npm start` and provides `PORT`.

## Notes

- `data.json` is gitignored on purpose: on a fresh server the app seeds itself
  (12,482 candles + the starting Wailing Wall messages — see `SEED_*` in `server.js`).
- Candles and tokens are feel-good counters with no anti-spam; signatures are one
  per browser (localStorage).
