const fs = require('node:fs');
const path = require('node:path');

function settings(config) {
   const options = {triggerExposure: 80, targetExposure: 100, freeBoosts: true, autoJoin: true, schedule: '*/30 * * * *', ...config.voting};
   if (![options.triggerExposure, options.targetExposure].every(value => typeof value === 'number' && Number.isFinite(value))
      || options.triggerExposure < 0 || options.triggerExposure > options.targetExposure || options.targetExposure > 100 || options.targetExposure <= 0) {
      throw new Error('Voting exposure must satisfy 0 <= triggerExposure <= targetExposure <= 100 and targetExposure > 0');
   }
   if (typeof options.freeBoosts !== 'boolean') throw new Error('freeBoosts must be true or false');
   if (typeof options.autoJoin !== 'boolean') throw new Error('autoJoin must be true or false');
   return options;
}

const heldLocks = new Set();

function processAlive(pid) {
   try { process.kill(pid, 0); return true; }
   catch (error) { return error.code === 'EPERM'; }
}

function lockIsStale(file) {
   if (heldLocks.has(file)) return false;
   let content, stat;
   try { content = fs.readFileSync(file, 'utf8').trim(); stat = fs.statSync(file); }
   catch (error) { return error.code === 'ENOENT'; }
   const pid = Number.parseInt(content, 10);
   // Empty/garbage lock: only stale if it is not a lock being written right now.
   if (!Number.isInteger(pid) || pid <= 0) return Date.now() - stat.mtimeMs > 10000;
   // Same PID as us but not held by us (e.g. container restart reusing PID 1), or a dead process.
   return pid === process.pid || !processAlive(pid);
}

function acquireLock(file) {
   file = path.resolve(file);
   let fd;
   for (let attempt = 0; ; attempt++) {
      try { fd = fs.openSync(file, 'wx', 0o600); break; }
      catch (error) {
         if (error.code !== 'EEXIST') throw error;
         if (attempt === 0 && lockIsStale(file)) {
            fs.rmSync(file, {force: true});
            continue;
         }
         throw new Error(`Another runner owns ${file}. If a previous process crashed, confirm it has stopped before removing this lock`);
      }
   }
   fs.writeFileSync(fd, String(process.pid));
   fs.closeSync(fd);
   heldLocks.add(file);
   return () => {
      if (!heldLocks.delete(file)) return;
      try { if (fs.readFileSync(file, 'utf8').trim() === String(process.pid)) fs.rmSync(file, {force: true}); }
      catch {}
   };
}

module.exports = {settings, acquireLock};
