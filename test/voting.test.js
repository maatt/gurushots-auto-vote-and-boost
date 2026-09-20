const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planVotes, runCycle, freeBoostEntry} = require('../lib/voting');
const {settings, acquireLock} = require('../lib/runner');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const challenge = {id: 1, title: 'Example', boost_enable: true, member: {
   ranking: {total: {exposure: 70}, entries: [{id: 'entry'}]}, boost: {state: 'AVAILABLE'},
}};
const voteData = () => ({challenge: {id: 1}, voting: {is_voting_open: true, mode: 'member_joined',
   vote_limit: 150, exposure: {exposure_factor: 70, vote_ratio: 10}},
   images: [{token: 'a', ratio: 0.01}, {token: 'a'}, {token: 'b'}, {token: 'c'}, {token: 'd', reported: true}],
});

test('plans unique votes using exposure gain, never image aspect ratio', () => {
   const plan = planVotes(voteData(), challenge, 100, () => 0.5);
   assert.equal(plan.tokens.length, 3);
   assert.equal(new Set(plan.tokens).size, 3);
   assert.equal(plan.estimatedExposure, 100);
});

test('respects server vote limits and current exposure', () => {
   const data = voteData();
   data.voting.vote_limit = 1;
   assert.equal(planVotes(data, challenge, 100).tokens.length, 1);
   data.voting.exposure.exposure_factor = 100;
   assert.equal(planVotes(data, challenge, 100).tokens.length, 0);
});

test('skips closed and special modes; rejects mismatched or invalid payloads', () => {
   const data = voteData();
   data.voting.mode = 'guru_pick';
   assert.equal(planVotes(data, challenge, 100).tokens.length, 0);
   data.voting.mode = 'member_joined';
   data.voting.exposure.vote_ratio = null;
   assert.throws(() => planVotes(data, challenge, 100));
   assert.throws(() => planVotes(voteData(), {id: 2}, 100));
});

test('check and dry run never submit votes, boost, or request verification', async () => {
   for (const checkOnly of [true, false]) {
      let reads = 0;
      const api = {challenges: async () => ({challenges: [challenge]}), voteData: async () => { reads++; return voteData(); },
         submitVotes: () => assert.fail(), boost: () => assert.fail()};
      await runCycle({api, options: settings({}), checkOnly, dryRun: !checkOnly,
         verificationToken: () => assert.fail(), log: () => {}});
      assert.equal(reads, checkOnly ? 0 : 1);
   }
});

test('only explicitly available free boosts qualify; skips turbo entries', () => {
   assert.equal(freeBoostEntry(challenge).id, 'entry');
   for (const state of ['LOCKED', 'MISSED', 'USED', 'AVAILABLE_KEY']) {
      assert.equal(freeBoostEntry({...challenge, member: {...challenge.member, boost: {state}}}), null);
   }
   assert.equal(freeBoostEntry({...challenge, member: {...challenge.member,
      ranking: {entries: [{id: 'entry', turbo: true}]}}}), null);
});

test('a failed vote aborts the cycle before boosts or further submissions', async () => {
   let submits = 0;
   const api = {challenges: async () => ({challenges: [challenge, challenge]}), voteData: async () => voteData(),
      submitVotes: async () => { submits++; throw new Error('uncertain result'); }, boost: () => assert.fail()};
   await assert.rejects(runCycle({api, options: settings({}), verificationToken: async () => 'token', log: () => {}}));
   assert.equal(submits, 1);
});

test('successful votes report refreshed exposure and a boost that is no longer free is skipped', async () => {
   let reads = 0;
   let submits = 0;
   const logs = [];
   const current = {...challenge, member: {ranking: {total: {exposure: 99}}, boost: {state: 'LOCKED'}}};
   const api = {challenges: async () => ({challenges: [reads++ === 0 ? challenge : current]}),
      voteData: async () => voteData(), submitVotes: async () => { submits++; }, boost: () => assert.fail()};
   await runCycle({api, options: settings({}), verificationToken: async () => 'token', log: message => logs.push(message)});
   assert.equal(submits, 1);
   assert.equal(reads, 3);
   assert.ok(logs.some(message => message.includes('confirmed exposure: 99%')));
});

test('cancellation after verification prevents submission', async () => {
   let stopped = false;
   const api = {challenges: async () => ({challenges: [challenge]}), voteData: async () => voteData(), submitVotes: () => assert.fail()};
   await runCycle({api, options: settings({}), shouldStop: () => stopped,
      verificationToken: async () => { stopped = true; return 'token'; }, log: () => {}});
});

test('a high exposure challenge skips fetching a voting pool', async () => {
   const api = {challenges: async () => ({challenges: [{...challenge, member: {ranking: {total: {exposure: 95}}}}]}),
      voteData: () => assert.fail()};
   await runCycle({api, options: settings({}), log: () => {}});
});

test('configuration rejects unsafe ranges and nonboolean boost controls', () => {
   for (const voting of [{triggerExposure: 101}, {targetExposure: -1}, {triggerExposure: '80'}, {freeBoosts: 'false'}]) {
      assert.throws(() => settings({voting}));
   }
});

test('exclusive runner lock prevents another process from starting', () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-lock-'));
   try {
      const file = path.join(dir, 'lock');
      const release = acquireLock(file);
      assert.throws(() => acquireLock(file));
      release();
      acquireLock(file)();
   } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
