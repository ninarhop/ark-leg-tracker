# Arkansas Legislative Tracker

Static frontend for tracking Arkansas bills, amendments, bill text links, votes, alerts, video timecodes, and content drafts.

The public site is deployed from the `frontend` folder by GitHub Pages after changes are pushed to `main`.

Expected public URL:

```text
https://ninarhop.github.io/ark-leg-tracker/
```

See `DEPLOY.md` for the one-time GitHub Pages setup steps.
See `AUTO_UPDATE.md` for the LegiScan polling and notification setup.

The site reads `frontend/tracker-data.json`, with `frontend/bills.json` and `frontend/legislators.json` as lighter fallback data. Review notes, manual buckets, clips, and content drafts are saved in the browser and can be exported from the app.
