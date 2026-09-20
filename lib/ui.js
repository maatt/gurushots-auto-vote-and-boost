// Terminal UI and styling for GuruShots Auto Voter

const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

const c = {
   reset: isColorSupported ? '\x1b[0m' : '',
   bold: isColorSupported ? '\x1b[1m' : '',
   dim: isColorSupported ? '\x1b[2m' : '',
   cyan: isColorSupported ? '\x1b[36m' : '',
   green: isColorSupported ? '\x1b[32m' : '',
   yellow: isColorSupported ? '\x1b[33m' : '',
   red: isColorSupported ? '\x1b[31m' : '',
   magenta: isColorSupported ? '\x1b[35m' : '',
   blue: isColorSupported ? '\x1b[34m' : '',
   gray: isColorSupported ? '\x1b[90m' : '',
   white: isColorSupported ? '\x1b[37m' : '',
   bgCyan: isColorSupported ? '\x1b[46;30m' : '',
   bgGreen: isColorSupported ? '\x1b[42;30m' : '',
   bgYellow: isColorSupported ? '\x1b[43;30m' : '',
   bgMagenta: isColorSupported ? '\x1b[45;30m' : '',
};

function exposureBar(pct, width = 20) {
   if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      return `${c.gray}[${' '.repeat(width)}]  --%${c.reset}`;
   }
   const clamped = Math.max(0, Math.min(100, pct));
   const filled = Math.round((clamped / 100) * width);
   const barColor = clamped >= 80 ? c.green : clamped >= 50 ? c.yellow : c.red;
   const barFilled = '█'.repeat(filled);
   const barEmpty = '░'.repeat(Math.max(0, width - filled));
   const num = String(Math.round(clamped)).padStart(3);
   return `${barColor}[${barFilled}${c.gray}${barEmpty}${barColor}] ${num}%${c.reset}`;
}

function renderTopHeader(width = 74) {
   const title = 'Gurushot Auto Voter';
   const centerPad = Math.floor((width - title.length) / 2);
   const rightPad = width - title.length - centerPad;
   console.log(`${c.cyan}┌${'─'.repeat(width)}┐${c.reset}`);
   console.log(`${c.cyan}│${c.reset}${' '.repeat(centerPad)}${c.bold}${c.cyan}${title}${c.reset}${' '.repeat(rightPad)}${c.cyan}│${c.reset}`);
   console.log(`${c.cyan}└${'─'.repeat(width)}┘${c.reset}\n`);
}

function renderBanner() {
   renderTopHeader();
}

function displayWidth(str) {
   if (!str) return 0;
   const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
   let width = 0;
   for (const char of Array.from(clean)) {
      const code = char.codePointAt(0);
      if (code >= 0xFE00 && code <= 0xFE0F) continue;
      if (code >= 0x2500 && code <= 0x259F) {
         width += 1;
      } else if (
         (code >= 0x1F300 && code <= 0x1FAFF) ||
         (code >= 0x2600 && code <= 0x27BF) ||
         (code >= 0x2B50 && code <= 0x2B55)
      ) {
         width += 2;
      } else {
         width += 1;
      }
   }
   return width;
}

function renderAccountCard({profile, bankroll, position = 'top'} = {}, width = 74) {
   const pad = (str, len) => str + ' '.repeat(Math.max(0, len - displayWidth(str)));

   const name = profile?.name || profile?.user_name || 'Photographer';
   const email = profile?.email ? ` (${profile.email})` : '';
   const rank = (profile?.member_status_name || profile?.member_status || 'Member').toUpperCase();
   const points = typeof profile?.points === 'number' ? ` (${Number(profile.points).toLocaleString()} pts)` : '';

   const line1Left = ` 👤 ${c.bold}${name}${c.reset}${c.gray}${email}${c.reset}`;
   const line1Right = `🏆 ${c.bold}Rank:${c.reset} ${c.yellow}${rank}${c.reset}${c.dim}${points}${c.reset} `;

   const coins = bankroll?.coins != null ? `${c.yellow}${bankroll.coins}${c.reset}` : `${c.gray}unknown${c.reset}`;
   const keys = bankroll?.keys != null ? `${c.white}${bankroll.keys}${c.reset}` : `${c.gray}-${c.reset}`;
   const swaps = bankroll?.swaps != null ? `${c.white}${bankroll.swaps}${c.reset}` : `${c.gray}-${c.reset}`;
   const fills = bankroll?.fills != null ? `${c.white}${bankroll.fills}${c.reset}` : `${c.gray}-${c.reset}`;
   const power = profile?.voting_power ? `x${profile.voting_power}` : 'x1';

   const line2Left = ` 🪙 ${c.bold}Coins:${c.reset} ${coins}   🔑 ${c.bold}Keys:${c.reset} ${keys}   🔄 ${c.bold}Swaps:${c.reset} ${swaps}   ⚡ ${c.bold}Fills:${c.reset} ${fills}`;
   const line2Right = `🔋 ${c.bold}Power:${c.reset} ${c.cyan}${power}${c.reset} `;

   if (position === 'bottom') {
      const titleTag = '─ Account Dashboard ';
      const topBorder = `${c.cyan}┌${titleTag}${'─'.repeat(Math.max(0, width - titleTag.length))}┐${c.reset}`;
      console.log(`\n${topBorder}`);
   } else {
      const title = ` ${c.bold}${c.cyan}Gurushot Auto Voter${c.reset}`;
      console.log(`${c.cyan}┌${'─'.repeat(width)}┐${c.reset}`);
      console.log(`${c.cyan}│${c.reset}${pad(title, width)}${c.cyan}│${c.reset}`);
      console.log(`${c.cyan}├${'─'.repeat(width)}┤${c.reset}`);
   }

   console.log(`${c.cyan}│${c.reset}${pad(line1Left, width - displayWidth(line1Right))}${line1Right}${c.cyan}│${c.reset}`);
   console.log(`${c.cyan}│${c.reset}${pad(line2Left, width - displayWidth(line2Right))}${line2Right}${c.cyan}│${c.reset}`);
   console.log(`${c.cyan}└${'─'.repeat(width)}┘${c.reset}\n`);
}

module.exports = {
   c,
   exposureBar,
   renderTopHeader,
   renderBanner,
   renderAccountCard,
   renderAccountFooter: renderAccountCard,
};
