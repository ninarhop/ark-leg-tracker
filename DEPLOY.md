# Deploy The Website

This repo is set up to publish the `frontend` folder with GitHub Pages.

## One-time GitHub setup

1. Open `https://github.com/ninarhop/ark-leg-tracker`.
2. Go to `Settings`.
3. Go to `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Save if GitHub shows a save button.

## Every update

1. Open GitHub Desktop.
2. Review the changed files.
3. Commit to `main`.
4. Click `Push origin`.
5. Open the `Actions` tab on GitHub.
6. Wait for `Deploy Website to GitHub Pages` to finish with a green check.

Public site:

```text
https://ninarhop.github.io/ark-leg-tracker/
```

If the site shows a 404 right after pushing, wait a couple of minutes and refresh. If it still fails, check the `Actions` tab for the deployment error.
