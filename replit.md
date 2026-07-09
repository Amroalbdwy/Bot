# TrackDown

A Node.js/Express web app with a Telegram bot that generates tracking links to collect device info (location, browser fingerprint, camera, etc.) from visitors.

## Stack

- **Runtime**: Node.js 20
- **Framework**: Express + EJS templates
- **Bot**: node-telegram-bot-api (Telegram)
- **Push**: web-push (VAPID)
- **Storage**: Local JSON files at the repo root (`users.json`, `stats.json`, etc.)

## How to run

```
node index.js
```

The app listens on port 5000 by default.

## Environment variables / secrets

| Key | Required | Description |
|-----|----------|-------------|
| `bot` | ✅ Yes | Telegram bot token (from @BotFather) |
| `HOST_URL` | ✅ Yes | Public URL of the app (set to Replit dev domain) |
| `VAPID_PUBLIC` | Optional | VAPID public key for web push (has a default) |
| `VAPID_PRIVATE` | Optional | VAPID private key for web push |
| `GH_TOKEN` | Optional | GitHub token for backing up JSON data files |

## User preferences

- Keep existing project structure and stack.
