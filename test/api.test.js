const {test} = require('node:test');
const assert = require('node:assert/strict');
const {GuruShotsApi, retryAfter} = require('../lib/api');
const ok = data => new Response(JSON.stringify({success: true, ...data}));

test('join submits selected photo IDs with the website fields and is not retried', async () => {
   let calls = 0;
   const api = new GuruShotsApi({fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.gurushots.com/rest/submit_to_challenge');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('c_id'), '7');
      assert.equal(form.get('el'), 'challenges');
      assert.equal(form.get('el_id'), 'true');
      assert.deepEqual(form.getAll('image_ids[]'), ['a&b', 'c']);
      throw new Error('response lost');
   }});
   await assert.rejects(api.joinChallenge({id: 7}, ['a&b', 'c']));
   assert.equal(calls, 1);
});

test('uses website headers and encodes token arrays without leaking them into URLs', async () => {
   const api = new GuruShotsApi({token: 'session', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest/submit_votes');
      assert.equal(options.headers['x-token'], 'session');
      assert.equal(options.headers['x-requested-with'], 'XMLHttpRequest');
      const form = new URLSearchParams(options.body);
      assert.deepEqual(form.getAll('tokens[]'), ['a+b&c', 'd']);
      assert.deepEqual(form.getAll('viewed_tokens[]'), ['a+b&c', 'd']);
      assert.equal(form.get('c_token'), 'verification');
      return ok({});
   }});
   await api.submitVotes({id: 7}, ['a+b&c', 'd'], 'verification');
});

test('retries read requests and honors Retry-After', async () => {
   let calls = 0;
   const delays = [];
   const api = new GuruShotsApi({sleepImpl: async ms => delays.push(ms), fetchImpl: async () => {
      calls++;
      return calls === 1 ? new Response('', {status: 429, headers: {'retry-after': '2'}}) : ok({challenges: []});
   }});
   assert.deepEqual((await api.challenges()).challenges, []);
   assert.deepEqual(delays, [2000]);
});

test('does not replay mutations after a transport failure or HTTP failure', async () => {
   for (const response of [null, new Response('', {status: 503})]) {
      let calls = 0;
      const api = new GuruShotsApi({fetchImpl: async () => { calls++; if (!response) throw new Error('connection lost'); return response; }});
      await assert.rejects(api.submitVotes({id: 1}, ['photo'], 'verification'));
      assert.equal(calls, 1);
   }
});

test('rejects HTTP 200 API errors, missing success, HTML and malformed challenge lists', async () => {
   for (const payload of [{success: false, error_code: 1000}, {}, {success: true}, '<html>']) {
      let calls = 0;
      const api = new GuruShotsApi({fetchImpl: async () => { calls++; return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload)); }});
      await assert.rejects(api.challenges());
      assert.equal(calls, 1);
   }
});

test('exposes expired authentication without printing response contents', async () => {
   const api = new GuruShotsApi({fetchImpl: async () => new Response(JSON.stringify({success: false, error_code: 1000, token: 'secret'}))});
   await assert.rejects(api.profile(), error => error.authenticationExpired && !error.message.includes('secret'));
});

test('a long cooldown stops the cycle instead of retrying early', async () => {
   const api = new GuruShotsApi({sleepImpl: async () => assert.fail('must not retry'), fetchImpl: async () => new Response('', {status: 429, headers: {'retry-after': '120'}})});
   await assert.rejects(api.challenges());
   assert.equal(retryAfter('Thu, 01 Jan 1970 00:00:10 GMT', 1000), 9000);
});
