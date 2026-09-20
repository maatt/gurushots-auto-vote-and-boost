const fs = require('node:fs');
const path = require('node:path');

function readCookies(file) {
   try {
      const cookies = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(cookies)) throw new Error('Expected a cookie array');
      return cookies;
   } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('Cannot read cookies.json; restore a valid cookie array or remove the file to sign in again');
   }
}

function savedToken(file) {
   // Browser cookie expiry and server session expiry are separate. Validate the
   // saved token with profile() before deciding whether a new login is needed.
   return readCookies(file).find(cookie => cookie.name === 'gs_t'
      && (cookie.domain === 'gurushots.com' || cookie.domain === '.gurushots.com')
      && typeof cookie.value === 'string')?.value;
}

module.exports = {savedToken, readCookies};

