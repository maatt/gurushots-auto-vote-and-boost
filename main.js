const fs = require('node:fs');
const path = require('node:path');
const cron = require('node-cron');
const {runCycle} = require('./lib/voting');
const {settings, acquireLock} = require('./lib/runner');
const {MobileApi} = require('./lib/mobile-api');
const {authenticateMobile} = require('./lib/mobile-session');
const {savedToken} = require('./lib/session');
const {renderAccountCard, c} = require('./lib/ui');
const {TUI} = require('./lib/tui');

async function main(args = process.argv.slice(2)) {
   try { process.title = 'gurushots-autovoter'; } catch {}
   if (process.stdout.isTTY) process.stdout.write('\x1b]0;GuruShots Auto Voter\x07');
   const known = new Set(['--check', '--dry-run', '--once', '--help', '--tui', '--no-tui']);
   if (args.some(arg => !known.has(arg))) throw new Error('Unknown argument. Use --help for supported options');
   if (args.includes('--help')) {
      console.log('npm start [-- --once | --check | --dry-run] [--tui | --no-tui]\n--check: read-only authentication and challenge summary\n--dry-run: read-only join, vote and free-boost plan\n--once: one live cycle\n--tui: force full-screen interactive TUI mode\n--no-tui: use standard linear scrolling mode\nDefault: run interactive full-screen browserless mobile autovoter immediately and every 30 minutes.');
      return;
   }
   const configFile = path.join(__dirname, 'config.json');
   let config = {};
   try { if (fs.existsSync(configFile)) config = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
   catch { throw new Error('Cannot read config.json; check that it contains valid JSON'); }
   const options = settings(config);
   if (!cron.validate(options.schedule)) throw new Error('Invalid voting.schedule cron expression');
   const release = acquireLock(path.join(__dirname, '.autovoter.lock'));
   process.once('exit', release);
   const cookieFile = path.join(__dirname, 'cookies.json');
   let running = false;
   let stopping = false;
   let nextAllowedAt = 0;
   let task;
   let tui;
   const stop = async () => {
      stopping = true;
      if (task) task.stop();
      if (tui) tui.stop();
   };
   process.once('SIGINT', stop);
   process.once('SIGTERM', stop);
   const checkOnly = args.includes('--check');
   const dryRun = args.includes('--dry-run');
   const once = checkOnly || dryRun || args.includes('--once');
   const useTui = (args.includes('--tui') || (!args.includes('--no-tui') && !once && !checkOnly)) && Boolean(process.stdout.isTTY);

   if (!useTui && process.stdout.isTTY) console.clear();

   if (useTui) {
      tui = new TUI({
         engine: 'Gurushot API',
         schedule: options.schedule,
         mode: dryRun ? 'Dry Run' : checkOnly ? 'Check' : 'Live Auto-Voter',
      });
      tui.start({
         onTriggerCycle: () => {
            if (!running && !stopping) run();
         },
         onStop: () => stop(),
      });
   }

   const run = async () => {
      if (running || stopping) return;
      if (Date.now() < nextAllowedAt) {
         const msg = `Server cooldown: next eligible run after ${new Date(nextAllowedAt).toLocaleString()}`;
         if (tui) {
            tui.setStatus('Cooldown', msg);
            tui.log(msg);
         } else {
            console.log(msg);
         }
         return;
      }
      running = true;
      if (tui) {
         tui.runningCycle = true;
         tui.setStatus('Running...', 'Connecting and authenticating...');
      }
      try {
         const api = new MobileApi();
         const initialData = await authenticateMobile({api, config, cookieFile, sessionFile: path.join(__dirname, 'mobile-session.json')});

         let profile;
         try { profile = await api.profile(); } catch {}
         let bankroll;
         try { if (typeof api.bankroll === 'function') bankroll = await api.bankroll(); } catch {}

         if (tui) {
            tui.updateAccount({profile, bankroll});
            if (initialData?.challenges) {
               tui.updateChallenges(initialData.challenges, initialData.suggested_challenges?.length ?? 0);
            }
         } else {
            renderAccountCard({profile, bankroll, position: 'top'});
         }

         if (stopping) return;

         const logger = tui ? msg => tui.log(msg) : console.log;
         const onChallenges = tui ? (ch, sug) => tui.updateChallenges(ch, sug) : undefined;

         await runCycle({
            api,
            options,
            dryRun,
            checkOnly,
            mobile: true,
            initialData,
            shouldStop: () => stopping,
            log: logger,
            onChallenges,
         });

         // Refresh bankroll after actions
         try { if (typeof api.bankroll === 'function') bankroll = await api.bankroll(); } catch {}

         if (tui) {
            tui.updateAccount({profile, bankroll});
            tui.setStatus('Idle', 'Cycle completed successfully.');
            tui.cycleCount++;
            tui.log(`${c.green}✔ Cycle complete.${c.reset}`);
         } else {
            console.log(`\n${c.green}✔ Cycle complete.${c.reset}`);
         }
      } catch (error) {
         if (tui) {
            tui.setStatus('Error', error.message);
            tui.log(`${c.red}✖ Cycle failed: ${error.message}${c.reset}`);
         } else {
            console.error(`\n${c.red}✖ Cycle failed: ${error.message}${c.reset}`);
         }
         if (error.status === 429) nextAllowedAt = Date.now() + (error.retryAfterMs ?? 30000);
         if (once) process.exitCode = 1;
      } finally {
         running = false;
         if (tui) tui.runningCycle = false;
      }
   };
   try {
      await run();
      if (!once && !stopping) {
         task = cron.schedule(options.schedule, async () => {
            if (!tui && process.stdout.isTTY) console.clear();
            await run();
            if (tui && !stopping) {
               tui.setNextRun(task.getNextRun());
            } else if (!stopping) {
               console.log(`${c.dim}⏳ Next run: ${task.getNextRun()?.toLocaleString()}${c.reset}`);
            }
         }, {noOverlap: true});
         if (tui) {
            tui.setNextRun(task.getNextRun());
         } else {
            console.log(`${c.dim}⏳ Next run: ${task.getNextRun()?.toLocaleString()}${c.reset}`);
         }
      }
   } finally {
      if (once || stopping) {
         if (tui) tui.stop();
         process.removeListener('exit', release);
         release();
         process.removeListener('SIGINT', stop);
         process.removeListener('SIGTERM', stop);
      }
   }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {main};
