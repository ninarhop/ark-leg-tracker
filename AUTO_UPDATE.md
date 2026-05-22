# Automatic Legislature Updates

This repository can poll LegiScan from GitHub Actions and publish updated static JSON to GitHub Pages.

## What it does

- Runs every 5 minutes in GitHub Actions.
- Pulls Arkansas bill changes from LegiScan.
- Updates `frontend/tracker-data.json`, `frontend/vote-details.json`, and `frontend/legislators.json`.
- Commits changed data back to `main`, which triggers the Pages deploy workflow.
- Opens a GitHub issue when bills are newly filed or changed.
- Optionally posts the same alert to Slack or Discord with repository secrets.

GitHub schedule timing is not truly instant. The closest no-server setup is a 5-minute poll, and GitHub can occasionally delay scheduled jobs. For sub-minute alerts, use a hosted worker or alert service.

## Required secret

In GitHub:

1. Open `Settings`.
2. Open `Secrets and variables`.
3. Open `Actions`.
4. Click `New repository secret`.
5. Name it `LEGISCAN_API_KEY`.
6. Paste the LegiScan key as the value.
7. Save it.

Do not commit the API key to the repo.

## Required Actions setting

In GitHub:

1. Open `Settings`.
2. Open `Actions`.
3. Open `General`.
4. Under `Workflow permissions`, choose `Read and write permissions`.
5. Save.

## Optional notification secrets

Add any of these repository secrets if you want alerts outside GitHub issues:

- `SLACK_WEBHOOK_URL`
- `DISCORD_WEBHOOK_URL`
- `NOTIFY_WEBHOOK_URL`

If none are set, the workflow still opens GitHub issues for notifications.

To receive GitHub email notifications, open the repository, click `Watch`, choose `Custom`, and turn on `Issues`.

## Test notifications

Open `Actions`, choose `Poll Arkansas Legislature`, click `Run workflow`, and check `Send a test notification without polling LegiScan`.

That test creates a GitHub issue and posts to any configured webhook secrets without using LegiScan credits.

## Manual test

After adding the secret, open the repo's `Actions` tab and run:

`Poll Arkansas Legislature`

If the run succeeds, the site will update automatically whenever LegiScan reports new bills, amendments, votes, or movement.
