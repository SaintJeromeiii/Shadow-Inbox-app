# GitHub Pages setup

Host the marketing + legal site from this folder.

## Enable Pages

1. GitHub repo → **Settings** → **Pages**
2. **Build and deployment** → Source: **Deploy from a branch**
3. Branch: **main** · Folder: **/docs**
4. Save — site URL will be something like:
   `https://saintjeromeiii.github.io/Shadow-Inbox-app/`

## Pages included

| File | Purpose |
| --- | --- |
| `index.html` | Landing + waitlist |
| `about.html` | About the creator |
| `privacy.html` | Privacy policy |
| `terms.html` | Terms of use |
| `delete-account.html` | Account deletion instructions |

## Waitlist API on GitHub Pages

The waitlist form posts to `/api/waitlist/signup`. That works on **Railway**
(`https://shadow-inbox-production.up.railway.app/docs/`) but **not** on raw GitHub Pages
(no backend). For GitHub-only hosting, point the form at your Railway URL or use a serverless proxy.

Production site (with working waitlist):  
https://shadow-inbox-production.up.railway.app/docs/
