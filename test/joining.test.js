const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planJoin, joinSuggested} = require('../lib/joining');
const {runCycle} = require('../lib/voting');
const {settings} = require('../lib/runner');
const suggestion = () => ({id: 7, title: 'Example', status: 'active', join_coins: 0, max_photo_submits: 2,
   member: {submit_state: 'join', suggested_images: [{id: 'a'}, {id: 'a'}, {id: 'b'}, {id: 'c'}]}});
const data = candidate => ({challenges: [], suggested_challenges: [candidate]});
const joined = () => ({...suggestion(), member: {ranking: {entries: [{id: 'a'}, {id: 'b'}], total: {exposure: 100}}}});
const quiet = () => {};

test('uses unique suggested photos in website order up to the photo limit', () => {
   assert.deepEqual(planJoin(suggestion()).imageIds, ['a', 'b']);
});

test('skips paid, unknown-cost, locked, closed, existing and malformed suggestions', () => {
   for (const patch of [{join_coins: 1}, {join_coins: undefined}, {join_coins: '0'}, {status: 'closed'},
      {max_photo_submits: 0}, {member: {submit_state: 'join_unlock'}},
      {member: {submit_state: 'join', ranking: {entries: [{id: 'old'}]}}},
      {member: {submit_state: 'join', suggested_images: [{id: 'a', permission: {allowed: false}}]}}]) {
      assert.equal(planJoin({...suggestion(), ...patch}).imageIds, undefined);
   }
   assert.throws(() => settings({voting: {autoJoin: 'true'}}));
});

test('dry run previews photos without submitting or extra reads', async () => {
   const logs = [];
   const original = data(suggestion());
   const result = await joinSuggested({api: {}, data: original, dryRun: true, log: text => logs.push(text)});
   assert.equal(result, original);
   assert.match(logs[0], /Would join Example for 0 coins with 2/);
});

test('rechecks cost immediately before joining', async () => {
   const api = {challenges: async () => data({...suggestion(), join_coins: 100}), joinChallenge: () => assert.fail()};
   await joinSuggested({api, data: data(suggestion()), log: quiet});
});

test('confirms active entries after joining and avoids duplicate suggestions', async () => {
   let reads = 0;
   let submits = 0;
   const original = data(suggestion());
   original.suggested_challenges.push(suggestion());
   const api = {challenges: async () => reads++ === 0 ? original : {challenges: [joined()]},
      joinChallenge: async (_, ids) => { submits++; assert.deepEqual(ids, ['a', 'b']); return {success: true}; }};
   const result = await joinSuggested({api, data: original, log: quiet});
   assert.equal(submits, 1);
   assert.equal(result.challenges.length, 1);
});

test('does not submit when another runner already joined', async () => {
   const api = {challenges: async () => ({challenges: [joined()]}), joinChallenge: () => assert.fail()};
   await joinSuggested({api, data: data(suggestion()), log: quiet});
});

test('stops on uncertain submission or missing entry confirmation', async () => {
   for (const fail of [true, false]) {
      let submits = 0;
      const api = {challenges: async () => data(suggestion()), joinChallenge: async () => {
         submits++; if (fail) throw new Error('response lost'); return {success: true};
      }};
      await assert.rejects(joinSuggested({api, data: data(suggestion()), log: quiet}));
      assert.equal(submits, 1);
   }
});

test('check-only and disabled auto-join do not submit; cancellation stops joining', async () => {
   const api = {challenges: async () => data(suggestion()), joinChallenge: () => assert.fail()};
   await runCycle({api, options: settings({}), checkOnly: true, log: quiet});
   await runCycle({api, options: settings({voting: {autoJoin: false}}), log: quiet});
   await joinSuggested({api, data: data(suggestion()), shouldStop: () => true, log: quiet});
});

test('newly joined challenges are included in the same voting cycle', async () => {
   let reads = 0;
   let voted = false;
   const active = joined(); active.member.ranking.total.exposure = 0;
   const api = {challenges: async () => reads++ < 2 ? data(suggestion()) : {challenges: [active]},
      joinChallenge: async () => ({success: true}), voteData: async () => {
         voted = true; return {challenge: {id: 7}, voting: {is_voting_open: false}};
      }};
   await runCycle({api, options: settings({}), log: quiet});
   assert.equal(voted, true);
});
