const {c, exposureBar} = require('./ui');

function displayWidth(str) {
   if (!str) return 0;
   const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
   let width = 0;
   for (const char of Array.from(clean)) {
      const code = char.codePointAt(0);
      if (code >= 0xFE00 && code <= 0xFE0F) continue; // variation selector
      if (code >= 0x2500 && code <= 0x259F) {
         width += 1; // box drawing & block elements
      } else if (
         (code >= 0x1F300 && code <= 0x1FAFF) ||
         (code >= 0x2600 && code <= 0x27BF) ||
         (code >= 0x2B50 && code <= 0x2B55)
      ) {
         width += 2; // emojis
      } else {
         width += 1;
      }
   }
   return width;
}

function truncateDisplay(str, maxWidth) {
   if (!str || maxWidth <= 0) return '';
   if (displayWidth(str) <= maxWidth) return str;
   let result = '';
   let cur = 0;
   for (const char of Array.from(str)) {
      const w = displayWidth(char);
      if (cur + w > maxWidth - 1) break;
      result += char;
      cur += w;
   }
   return result + '…';
}

function setTerminalTitle(title) {
   if (process.stdout.isTTY) {
      process.stdout.write(`\x1b]0;${title}\x07`);
   }
}

class TUI {
   constructor(options = {}) {
      this.engine = options.engine || 'Gurushot API';
      this.schedule = options.schedule || 'every 30m';
      this.mode = options.mode || 'Live';
      this.isActive = false;
      this.runningCycle = false;
      this.profile = null;
      this.bankroll = null;
      this.challenges = [];
      this.suggestedCount = 0;
      this.logs = [];
      this.status = 'Initializing...';
      this.statusDetail = '';
      this.nextRunAt = null;
      this.cycleCount = 0;
      this.timerInterval = null;
      this.onTriggerCycle = null;
      this.onStop = null;
      this._onResize = () => this.render();
      this._onKey = (key) => this.handleKey(key);
   }

   updateTitle() {
      if (!this.isActive) return;
      let title = 'GuruShots Auto Voter';
      if (this.runningCycle) {
         title += ` • ⚡ ${this.status || 'Running...'}`;
      } else if (this.nextRunAt) {
         const diffMs = this.nextRunAt - Date.now();
         if (diffMs > 0) {
            const min = Math.floor(diffMs / 60000);
            const sec = Math.floor((diffMs % 60000) / 1000);
            title += ` • ⏳ ${min}m ${String(sec).padStart(2, '0')}s`;
         } else {
            title += ` • Due now`;
         }
      }
      setTerminalTitle(title);
   }

   start({onTriggerCycle, onStop} = {}) {
      if (this.isActive) return;
      this.onTriggerCycle = onTriggerCycle;
      this.onStop = onStop;
      this.isActive = true;

      try { process.title = 'gurushots-autovoter'; } catch {}
      this.updateTitle();

      // Enter alternate screen buffer & hide cursor
      process.stdout.write('\x1b[?1049h\x1b[?25l');

      if (process.stdin.isTTY) {
         try {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', this._onKey);
         } catch {}
      }

      process.stdout.on('resize', this._onResize);

      this.timerInterval = setInterval(() => {
         this.render();
      }, 1000);

      this.render();
   }

   stop() {
      if (!this.isActive) return;
      this.isActive = false;
      if (this.timerInterval) {
         clearInterval(this.timerInterval);
         this.timerInterval = null;
      }
      process.stdout.removeListener('resize', this._onResize);
      if (process.stdin.isTTY) {
         try {
            process.stdin.removeListener('data', this._onKey);
            process.stdin.setRawMode(false);
            process.stdin.pause();
         } catch {}
      }
      setTerminalTitle('');
      // Restore cursor & alternate screen buffer
      process.stdout.write('\x1b[?1049l\x1b[?25h');
   }

   handleKey(key) {
      if (key === '\u0003' || key === 'q' || key === 'Q') { // Ctrl+C or Q
         this.stop();
         if (typeof this.onStop === 'function') this.onStop();
         process.exit(0);
      }
      if (key === 'r' || key === 'R') {
         if (!this.runningCycle && typeof this.onTriggerCycle === 'function') {
            this.onTriggerCycle();
         }
      }
   }

   setStatus(status, detail = '') {
      this.status = status;
      this.statusDetail = detail;
      this.render();
   }

   setNextRun(dateOrTimestamp) {
      if (dateOrTimestamp instanceof Date) {
         this.nextRunAt = dateOrTimestamp.getTime();
      } else if (typeof dateOrTimestamp === 'number') {
         this.nextRunAt = dateOrTimestamp;
      } else {
         this.nextRunAt = null;
      }
      this.render();
   }

   updateAccount({profile, bankroll}) {
      if (profile) this.profile = profile;
      if (bankroll) this.bankroll = bankroll;
      this.render();
   }

   updateChallenges(challenges = [], suggestedCount = 0) {
      this.challenges = challenges;
      this.suggestedCount = suggestedCount;
      this.render();
   }

   log(message) {
      if (!message || typeof message !== 'string') return;
      const clean = message.trim();
      if (!clean) return;
      const now = new Date().toLocaleTimeString('en-US', {hour12: false});
      // Store log with timestamp
      this.logs.push(`[${now}] ${clean}`);
      if (this.logs.length > 100) this.logs.shift();
      this.render();
   }

   formatCountdown() {
      if (!this.nextRunAt) return this.runningCycle ? `${c.yellow}Running...${c.reset}` : `${c.gray}Standby${c.reset}`;
      const diffMs = this.nextRunAt - Date.now();
      if (diffMs <= 0) return `${c.yellow}Due now${c.reset}`;
      const totalSec = Math.floor(diffMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return `${c.yellow}${min}m ${String(sec).padStart(2, '0')}s${c.reset}`;
   }

   makeBoxLine(left = '', right = '', width = 80) {
      const wl = displayWidth(left);
      const wr = displayWidth(right);
      const spaces = Math.max(0, width - 2 - wl - wr);
      return `${c.cyan}│${c.reset}${left}${' '.repeat(spaces)}${right}${c.cyan}│${c.reset}`;
   }

   makeDivider(title = '', width = 80) {
      if (!title) return `${c.cyan}├${'─'.repeat(Math.max(0, width - 2))}┤${c.reset}`;
      const tag = `─ ${title} `;
      const dashes = Math.max(0, width - 2 - displayWidth(tag));
      return `${c.cyan}├${tag}${'─'.repeat(dashes)}┤${c.reset}`;
   }

   render() {
      if (!this.isActive) return;
      this.updateTitle();

      const W = Math.max(64, process.stdout.columns || 80);
      const H = Math.max(18, process.stdout.rows || 24);

      const lines = [];

      // 1. Top Header Box (3 lines)
      const topTag = `─ Gurushot Auto Voter `;
      const topDashes = Math.max(0, W - 2 - displayWidth(topTag));
      lines.push(`${c.cyan}┌${topTag}${'─'.repeat(topDashes)}┐${c.reset}`);

      const statusColor = this.status.toLowerCase().includes('run') ? c.yellow : this.status.toLowerCase().includes('error') ? c.red : c.green;
      const headerLeft = ` Engine: ${c.bold}${this.engine}${c.reset}`;
      const headerRight = `Status: ${statusColor}${this.status}${c.reset}  Next: ${this.formatCountdown()} `;
      lines.push(this.makeBoxLine(headerLeft, headerRight, W));

      const chCount = this.challenges.length;
      lines.push(this.makeDivider(`Active Challenges (${chCount})${this.suggestedCount ? ` • Suggested: ${this.suggestedCount}` : ''}`, W));

      // Bottom Section takes 5 fixed lines:
      // Line H-4: Divider
      // Line H-3: Account row 1
      // Line H-2: Account row 2
      // Line H-1: Controls row
      // Line H: Bottom border
      const bottomLinesCount = 5;
      const topLinesCount = 3;
      const middleAvailable = Math.max(2, H - topLinesCount - bottomLinesCount);

      // We split middleAvailable between Challenges and Activity Log
      // Challenges get at most chCount lines, or at most half of middleAvailable
      let challengeSlots = Math.min(chCount, Math.max(1, Math.floor(middleAvailable * 0.45)));
      if (chCount <= 6 && middleAvailable >= 12) {
         challengeSlots = chCount;
      }
      const logDividerSlots = 1;
      const logSlots = Math.max(1, middleAvailable - challengeSlots - logDividerSlots);

      // Render Challenges
      if (this.challenges.length === 0) {
         lines.push(this.makeBoxLine(` ${c.dim}No active challenges found yet.${c.reset}`, '', W));
         for (let i = 1; i < challengeSlots; i++) {
            lines.push(this.makeBoxLine('', '', W));
         }
      } else {
         for (let i = 0; i < challengeSlots; i++) {
            const item = this.challenges[i];
            const exposure = item.member?.ranking?.exposure?.exposure_factor ?? item.member?.ranking?.total?.exposure ?? null;
            const bar = exposure !== null ? exposureBar(exposure, 16) : `${c.gray}[${' '.repeat(16)}]  --%${c.reset}`;
            const statusLabel = exposure >= 80 ? `${c.green}Optimal${c.reset}` : exposure !== null ? `${c.yellow}Voting${c.reset}` : `${c.gray}Unknown${c.reset}`;

            const titleMax = Math.max(12, W - 40);
            const truncatedTitle = truncateDisplay(item.title, titleMax);
            const l = ` • ${c.bold}${truncatedTitle}${c.reset}`;
            const r = `${bar}  ${statusLabel} `;
            lines.push(this.makeBoxLine(l, r, W));
         }
         if (this.challenges.length > challengeSlots) {
            // Overwrite last challenge slot with overflow indicator if needed
            const lastIdx = lines.length - 1;
            lines[lastIdx] = this.makeBoxLine(` ${c.dim}... and ${this.challenges.length - challengeSlots + 1} more challenges${c.reset}`, '', W);
         }
      }

      // Activity Log Section
      lines.push(this.makeDivider('Live Activity Log', W));
      const recentLogs = this.logs.slice(-logSlots);
      for (let i = 0; i < logSlots; i++) {
         const logLine = recentLogs[i] || '';
         const truncatedLog = truncateDisplay(logLine, W - 4);
         lines.push(this.makeBoxLine(` ${truncatedLog}`, '', W));
      }

      // Account Dashboard & Bottom Section
      lines.push(this.makeDivider('Account Dashboard', W));

      const name = this.profile?.name || this.profile?.user_name || 'Photographer';
      const email = this.profile?.email ? ` (${this.profile.email})` : '';
      const rank = (this.profile?.member_status_name || this.profile?.member_status || 'Member').toUpperCase();
      const points = typeof this.profile?.points === 'number' ? ` (${Number(this.profile.points).toLocaleString()} pts)` : '';

      const accLine1Left = ` 👤 ${c.bold}${name}${c.reset}${c.gray}${email}${c.reset}`;
      const accLine1Right = `🏆 ${c.bold}Rank:${c.reset} ${c.yellow}${rank}${c.reset}${c.dim}${points}${c.reset} `;
      lines.push(this.makeBoxLine(accLine1Left, accLine1Right, W));

      const coins = this.bankroll?.coins != null ? `${c.yellow}${this.bankroll.coins}${c.reset}` : `${c.gray}-${c.reset}`;
      const keys = this.bankroll?.keys != null ? `${c.white}${this.bankroll.keys}${c.reset}` : `${c.gray}-${c.reset}`;
      const swaps = this.bankroll?.swaps != null ? `${c.white}${this.bankroll.swaps}${c.reset}` : `${c.gray}-${c.reset}`;
      const fills = this.bankroll?.fills != null ? `${c.white}${this.bankroll.fills}${c.reset}` : `${c.gray}-${c.reset}`;
      const power = this.profile?.voting_power ? `x${this.profile.voting_power}` : 'x1';

      const accLine2Left = ` 🪙 ${c.bold}Coins:${c.reset} ${coins}   🔑 ${c.bold}Keys:${c.reset} ${keys}   🔄 ${c.bold}Swaps:${c.reset} ${swaps}   ⚡ ${c.bold}Fills:${c.reset} ${fills}`;
      const accLine2Right = `🔋 ${c.bold}Power:${c.reset} ${c.cyan}${power}${c.reset} `;
      lines.push(this.makeBoxLine(accLine2Left, accLine2Right, W));

      // Controls row
      const ctrlLeft = ` ${c.bold}[R]${c.reset} Run Cycle Now    ${c.bold}[Q]${c.reset} Quit`;
      const ctrlRight = `${c.dim}Schedule: ${this.schedule}${c.reset} `;
      lines.push(this.makeBoxLine(ctrlLeft, ctrlRight, W));

      // Bottom border
      lines.push(`${c.cyan}└${'─'.repeat(Math.max(0, W - 2))}┘${c.reset}`);

      // Ensure exact line count matches H to avoid terminal scroll jitter
      const output = lines.slice(0, H).join('\n');
      process.stdout.write(`\x1b[H${output}`);
   }
}

module.exports = {TUI, displayWidth, truncateDisplay};
