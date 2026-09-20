const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readSession, saveSession, authenticateMobile} = require('../lib/mobile-session');
const {ApiError} = require('../lib/api');

test('readSession returns undefined for missing file and rejects malformed json', () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-msess-'));
   try {
      const file = path.join(dir, 'session.json');
      assert.equal(readSession(file), undefined);

      fs.writeFileSync(file, 'not-json');
      assert.throws(() => readSession(file), /Cannot read mobile-session.json/);

      fs.writeFileSync(file, JSON.stringify({}));
      assert.throws(() => readSession(file), /Cannot read mobile-session.json/);

      fs.writeFileSync(file, JSON.stringify({token: 'tok123', memberId: 'mem456'}));
      assert.deepEqual(readSession(file), {token: 'tok123', memberId: 'mem456'});
   } finally {
      fs.rmSync(dir, {recursive: true, force: true});
   }
});

test('saveSession writes atomically with restricted file permissions', () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-msess-'));
   try {
      const file = path.join(dir, 'session.json');
      saveSession(file, {token: 'tok-abc', memberId: 'mem-xyz'});
      const stat = fs.statSync(file);
      assert.equal(stat.mode & 0o777, 0o600);
      assert.deepEqual(readSession(file), {token: 'tok-abc', memberId: 'mem-xyz'});
   } finally {
      fs.rmSync(dir, {recursive: true, force: true});
   }
});

test('authenticateMobile reuses valid saved session without logging in', async () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-msess-'));
   try {
      const sessionFile = path.join(dir, 'session.json');
      saveSession(sessionFile, {token: 'valid-tok', memberId: 'mem-1'});

      let loginCalls = 0;
      let profileCalls = 0;
      let challengeCalls = 0;
      const api = {
         profile: async () => { profileCalls++; return {id: 'mem-1'}; },
         challenges: async () => { challengeCalls++; return {challenges: [{id: 10}]}; },
         login: async () => { loginCalls++; return 'new-tok'; },
      };

      const result = await authenticateMobile({
         api,
         config: {},
         sessionFile,
         cookieFile: path.join(dir, 'missing-cookies.json'),
         env: {},
      });

      assert.equal(api.token, 'valid-tok');
      assert.equal(api.memberId, 'mem-1');
      assert.equal(profileCalls, 1);
      assert.equal(challengeCalls, 1);
      assert.equal(loginCalls, 0);
      assert.equal(result.challenges.length, 1);
   } finally {
      fs.rmSync(dir, {recursive: true, force: true});
   }
});

test('authenticateMobile signs in when session is missing and saves session', async () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-msess-'));
   try {
      const sessionFile = path.join(dir, 'session.json');

      let loginCalls = 0;
      const api = {
         profile: async () => ({id: 'mem-2'}),
         challenges: async () => ({challenges: [{id: 20}]}),
         login: async (u, p) => {
            loginCalls++;
            assert.equal(u, 'myuser');
            assert.equal(p, 'mypass');
            api.token = 'logged-in-token';
            api.memberId = 'mem-2';
            return 'logged-in-token';
         },
      };

      const result = await authenticateMobile({
         api,
         config: {username: 'myuser', password: 'mypass'},
         sessionFile,
         cookieFile: path.join(dir, 'missing-cookies.json'),
         env: {},
      });

      assert.equal(loginCalls, 1);
      assert.equal(result.challenges.length, 1);
      assert.deepEqual(readSession(sessionFile), {token: 'logged-in-token', memberId: 'mem-2'});
   } finally {
      fs.rmSync(dir, {recursive: true, force: true});
   }
});

test('authenticateMobile re-authenticates when saved token has expired', async () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-msess-'));
   try {
      const sessionFile = path.join(dir, 'session.json');
      saveSession(sessionFile, {token: 'expired-tok', memberId: 'mem-old'});

      let loggedIn = false;
      const api = {
         profile: async () => {
            if (!loggedIn) throw new ApiError('Unauthorized', {status: 401, code: 1000});
            return {id: 'mem-new'};
         },
         challenges: async () => ({challenges: []}),
         login: async () => {
            loggedIn = true;
            api.token = 'fresh-tok';
            api.memberId = 'mem-new';
            return 'fresh-tok';
         },
      };

      await authenticateMobile({
         api,
         config: {username: 'u', password: 'p'},
         sessionFile,
         cookieFile: path.join(dir, 'missing.json'),
         env: {},
      });

      assert.equal(loggedIn, true);
      assert.equal(api.token, 'fresh-tok');
      assert.deepEqual(readSession(sessionFile), {token: 'fresh-tok', memberId: 'mem-new'});
   } finally {
      fs.rmSync(dir, {recursive: true, force: true});
   }
});
