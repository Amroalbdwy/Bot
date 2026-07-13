# TrackDown

A Node.js/Express web app with a Telegram bot integration for IP/device tracking via links.

Based on [Psi](https://github.com/Amroalbdwy/Bot) with extra features.

## Stack

- **Runtime:** Node.js
- **Framework:** Express + EJS templates
- **Bot:** node-telegram-bot-api (Telegram)
- **Storage:** Flat JSON files in the project root
- **Push notifications:** web-push (VAPID)

## Running

```
npm start
```

Starts the Express server on port 5000.

## Required Secrets

| Key | Description |
|-----|-------------|
| `bot` | Telegram bot token from [@BotFather](https://t.me/BotFather) |

## Optional Secrets

| Key | Description |
|-----|-------------|
| `VAPID_PRIVATE` | VAPID private key for web push notifications |
| `GH_TOKEN` | GitHub personal access token — enables automatic data backup to the GitHub repo |

## رفع التغييرات لـ GitHub

يمكن رفع أي تعديلات على الكود مباشرة إلى GitHub بأمر واحد:

```bash
bash autopush.sh "وصف التغييرات"
```

أو بدون وصف (يستخدم التاريخ تلقائياً):

```bash
bash autopush.sh
```

## Data Files

JSON data is stored in the project root:
- `users.json` — registered users
- `stats.json` — visit statistics
- `profiles.json` — user profiles
- `premium.json` — premium users
- `userstats.json` — per-user stats

## User Preferences

_No preferences recorded yet._
