const fs = require('node:fs');

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

function acquireLock(file) {
   let fd;
   try { fd = fs.openSync(file, 'wx', 0o600); }
   catch (error) {
      if (error.code !== 'EEXIST') throw error;
      throw new Error(`Another runner owns ${file}. If a previous process crashed, confirm it has stopped before removing this lock`);
   }
   fs.writeFileSync(fd, String(process.pid));
   fs.closeSync(fd);
   return () => fs.rmSync(file, {force: true});
}

module.exports = {settings, acquireLock};
