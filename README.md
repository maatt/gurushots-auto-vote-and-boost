# GuruShots Auto Voter

![GuruShots Auto Voter Preview](https://i.postimg.cc/kq3rj3xs/Untitled-1.png)

An automated GuruShots voting and boosting tool with an interactive terminal interface. Keeps your challenge exposures maxed out, automatically joins eligible free challenges, and applies free boosts on a customizable schedule.

---

## Features

- ⚡ **Auto-Voting**: Monitors all active challenges and votes to keep your exposure at 100%.
- 🚀 **Free Boosts**: Automatically detects and applies free boosts as soon as they become available.
- 🎯 **Auto-Join**: Enters eligible free challenges with suggested photos so you never miss a competition.
- 🖥️ **Interactive Terminal Dashboard**: Live full-screen TUI showing challenge exposure progress bars, bankroll balances (coins, keys, swaps, fills), activity log, and a countdown to the next run.
- 🔄 **Background Daemon (PM2)**: Built-in support to run 24/7 in the background with automatic restarts and logging.

---

## Quick Start

### 1. Requirements

- **Node.js 22** or newer.

### 2. Installation

```sh
git clone https://github.com/maatt/gurushots-auto-vote-and-boost.git
cd gurushots-auto-vote-and-boost
npm ci
```

### 3. Configuration

Create a `config.json` file in the project root (or copy from `config.example.json`):

```json
{
  "username": "your_email@example.com",
  "password": "your_password"
}
```

> **Note**: You can also provide credentials via environment variables `GURUSHOTS_USERNAME` and `GURUSHOTS_PASSWORD`.

---

## Usage

### Interactive Terminal (Default)

Launch the full-screen interactive dashboard:

```sh
npm start
```

#### Interactive Hotkeys

While running in the terminal, you can use these keys at any time:
- **`[R]`**: Run a cycle now (immediately votes and boosts without waiting for the timer).
- **`[Q]`** or **`Ctrl+C`**: Cleanly exit and restore the terminal.

---

### Running in the Background (PM2)

To keep the auto-voter running 24/7 as a background service:

```sh
# Start background daemon
npm run pm2

# View live streaming logs
npm run pm2:logs

# Stop background daemon
npm run pm2:stop
```

---

### Command Line Options

You can pass options to `npm start` by appending `--`:

| Option | Description |
| :--- | :--- |
| `npm start -- --dry-run` | Read-only simulation. Plans joins, votes, and boosts without submitting any actions. |
| `npm start -- --check` | Quick read-only status check of authentication, profile, and active challenges. |
| `npm start -- --once` | Executes exactly one live cycle and exits immediately without scheduling future runs. |
| `npm start -- --no-tui` | Disables the full-screen TUI and outputs standard scrolling log text. |

---

## Custom Settings

You can customize the voting and schedule behavior by adding a `voting` block to your `config.json`:

```json
{
  "username": "your_email@example.com",
  "password": "your_password",
  "voting": {
    "triggerExposure": 80,
    "targetExposure": 100,
    "freeBoosts": true,
    "autoJoin": true,
    "schedule": "*/30 * * * *"
  }
}
```

| Setting | Default | Description |
| :--- | :--- | :--- |
| **`triggerExposure`** | `80` | Minimum exposure % before voting is triggered. |
| **`targetExposure`** | `100` | Target exposure % to achieve with votes. |
| **`freeBoosts`** | `true` | Automatically apply free boosts when available. |
| **`autoJoin`** | `true` | Automatically enter eligible free challenges using suggested photos. |
| **`schedule`** | `"*/30 * * * *"` | Cron expression for recurring runs (default is every 30 minutes). |

---

## Running Tests

Run the built-in test suite:

```sh
npm test
```
