const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {savedToken} = require('./session');

function readSession(file) {
   try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof data.token !== 'string' || !data.token) throw new Error();
      return {token: data.token, memberId: data.memberId || data.member_id};
   } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw new Error('Cannot read mobile-session.json; restore a valid session or remove it to sign in again');
   }
}

function saveSession(file, session) {
   const temp = path.join(path.dirname(file), `.mobile-session-${crypto.randomUUID()}.tmp`);
   const data = typeof session === 'string' ? {token: session} : session;
   try {
      fs.writeFileSync(temp, JSON.stringify(data), {mode: 0o600, flag: 'wx'});
      fs.renameSync(temp, file);
   } finally { fs.rmSync(temp, {force: true}); }
}

async function authenticateMobile({api, config, sessionFile, cookieFile, env = process.env}) {
   const saved = readSession(sessionFile);
   api.token = env.GURUSHOTS_TOKEN || saved?.token || savedToken(cookieFile);
   if (saved?.memberId) api.memberId = saved.memberId;
   const login = async () => {
      await api.login(env.GURUSHOTS_USERNAME || config.username, env.GURUSHOTS_PASSWORD || config.password);
      await api.profile();
      const data = await api.challenges();
      saveSession(sessionFile, {token: api.token, memberId: api.memberId});
      return data;
   };
   if (!api.token) return login();
   try {
      await api.profile();
      if ((!saved || !saved.memberId) && api.memberId) {
         saveSession(sessionFile, {token: api.token, memberId: api.memberId});
      }
      return await api.challenges();
   } catch (error) {
      // A mobile-route denial is not an expired session. Never replace the
      // token or repeatedly log in to try to get past it.
      if (!error.authenticationExpired || env.GURUSHOTS_TOKEN) throw error;
      return login();
   }
}

module.exports = {authenticateMobile, readSession, saveSession};
