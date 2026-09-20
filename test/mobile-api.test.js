const {test} = require('node:test');
const assert = require('node:assert/strict');
const {MobileApi} = require('../lib/mobile-api');
const {ApiError} = require('../lib/api');

const ok = data => new Response(JSON.stringify({success: true, ...data}));

test('MobileApi sends mobile headers and uses rest_mobile endpoint', async () => {
   const api = new MobileApi({token: 'm-session', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/get_my_active_challenges');
      assert.equal(options.headers['x-api-version'], '38');
      assert.equal(options.headers['x-env'], 'ANDROID');
      assert.equal(options.headers['x-app-version'], '5.53.0');
      assert.equal(options.headers['x-app-id'], 'com.gurushots.app');
      assert.equal(options.headers['user-agent'], 'okhttp/4.12.0');
      assert.equal(options.headers['x-device'], 'Pixel 6');
      assert.equal(options.headers['x-model'], 'Pixel 6');
      assert.equal(options.headers['x-brand'], 'google');
      assert.equal(options.headers['x-token'], 'm-session');
      return ok({challenges: []});
   }});
   const data = await api.challenges();
   assert.deepEqual(data.challenges, []);
});

test('MobileApi login submits credentials, stores token and memberId', async () => {
   const api = new MobileApi({fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/signin/');
      assert.equal(options.headers['user-agent'], 'okhttp/4.12.0');
      assert.equal(options.headers['x-token'], undefined);
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('login'), 'photographer@example.com');
      assert.equal(form.get('password'), 'secret-pass');
      return ok({token: 'new-mobile-token', member_id: 'm-12345'});
   }});

   const token = await api.login('photographer@example.com', 'secret-pass');
   assert.equal(token, 'new-mobile-token');
   assert.equal(api.token, 'new-mobile-token');
   assert.equal(api.memberId, 'm-12345');
});

test('MobileApi login validates credentials and response payload', async () => {
   const api = new MobileApi();
   await assert.rejects(api.login('', 'pass'), ApiError);
   await assert.rejects(api.login('user', ''), ApiError);

   const badApi = new MobileApi({fetchImpl: async () => ok({token: ''})});
   await assert.rejects(badApi.login('user', 'pass'), /missing its session token or member ID/);
});

test('MobileApi profile queries get_profile when memberId is available', async () => {
   const api = new MobileApi({token: 'm-token', memberId: 'm-123', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/get_profile');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('id'), 'm-123');
      return ok({id: 'm-123', name: 'Photographer'});
   }});
   const profile = await api.profile();
   assert.equal(profile.name, 'Photographer');
});

test('MobileApi profile falls back to challenges verification when memberId is missing', async () => {
   let calledChallenges = false;
   const api = new MobileApi({token: 'm-token', sleepImpl: async () => {}, fetchImpl: async (url) => {
      if (url.includes('get_current_member_profile')) return new Response('', {status: 404});
      if (url.includes('get_my_active_challenges')) {
         calledChallenges = true;
         return ok({challenges: [{id: 1}]});
      }
      throw new Error(`Unexpected url: ${url}`);
   }});
   const profile = await api.profile();
   assert.equal(calledChallenges, true);
   assert.equal(profile.challenges, 1);
});

test('MobileApi bankroll retrieves and parses coins, keys, swaps, and fills', async () => {
   const api = new MobileApi({token: 'm-token', fetchImpl: async (url) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/get_bankroll');
      return ok({bankroll: {challenges: [
         {type: 'COINS', amount: 25},
         {type: 'KEYS', amount: 5},
         {type: 'SWAPS', amount: 10},
         {type: 'FILLS', amount: 8},
      ]}});
   }});
   const bankroll = await api.bankroll();
   assert.deepEqual(bankroll, {coins: 25, keys: 5, swaps: 10, fills: 8});
});

test('MobileApi voteData queries get_vote_images with challenge ID', async () => {
   const api = new MobileApi({token: 'm-token', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/get_vote_images');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('c_id'), '42');
      assert.equal(form.get('limit'), '100');
      assert.equal(form.get('onboarding_mode'), 'false');
      return ok({images: [{id: 'img1'}, {id: 'img2'}]});
   }});
   const data = await api.voteData({id: 42});
   assert.equal(data.images.length, 2);
});

test('MobileApi submitVotes submits image IDs without requiring captcha verification token', async () => {
   const api = new MobileApi({token: 'm-token', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/submit_vote');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('c_id'), '42');
      assert.equal(form.get('layout'), 'scroll');
      assert.deepEqual(form.getAll('image_ids[]'), ['img1', 'img2']);
      assert.deepEqual(form.getAll('viewed_image_ids[]'), ['img1', 'img2']);
      assert.equal(form.get('c_token'), null);
      return ok({exposure: {exposure_factor: 100}});
   }});
   const result = await api.submitVotes({id: 42}, ['img1', 'img2']);
   assert.equal(result.exposure.exposure_factor, 100);
});

test('MobileApi submitVotes rejects empty or invalid photo IDs', async () => {
   const api = new MobileApi();
   await assert.rejects(api.submitVotes({id: 42}, []), /requires photo IDs/);
   await assert.rejects(api.submitVotes({id: 42}, ['']), /requires photo IDs/);
});

test('MobileApi boost submits boost_photo to rest_mobile', async () => {
   const api = new MobileApi({token: 'm-token', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/boost_photo');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('c_id'), '42');
      assert.equal(form.get('image_id'), 'entry-99');
      return ok({});
   }});
   await api.boost({id: 42}, {id: 'entry-99'});
});

test('MobileApi joinChallenge submits photos array and android_app el fields', async () => {
   const api = new MobileApi({token: 'm-token', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.gurushots.com/rest_mobile/submit_to_challenge');
      const form = new URLSearchParams(options.body);
      assert.deepEqual(form.getAll('photos[]'), ['photo-1', 'photo-2']);
      assert.equal(form.get('el'), 'android_app');
      assert.equal(form.get('el_id'), '42');
      assert.equal(form.get('chlg_id'), '42');
      assert.equal(form.get('onboarding_mode'), 'false');
      return ok({challenge_id: 42});
   }});
   const result = await api.joinChallenge({id: 42}, ['photo-1', 'photo-2']);
   assert.equal(result.challenge_id, 42);
});
