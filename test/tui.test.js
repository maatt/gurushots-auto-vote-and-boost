const test = require('node:test');
const assert = require('node:assert/strict');
const {TUI, displayWidth, truncateDisplay} = require('../lib/tui');

test('displayWidth counts ASCII and emoji characters accurately', () => {
   assert.equal(displayWidth('hello'), 5);
   assert.equal(displayWidth('👤 Matt'), 7); // 2 (emoji) + 1 (space) + 4 (Matt)
   assert.equal(displayWidth('🪙 Coins: 15'), 12);
   assert.equal(displayWidth('┌───┐'), 5); // box drawing characters are 1 width
});

test('truncateDisplay truncates to maxWidth with ellipsis', () => {
   const text = 'This is a long challenge title';
   const truncated = truncateDisplay(text, 15);
   assert.ok(displayWidth(truncated) <= 15);
   assert.ok(truncated.endsWith('…'));
});

test('TUI tracks account state, challenges and logs', () => {
   const tui = new TUI({engine: 'Mobile APK v5.53', schedule: 'every 30m'});
   tui.updateAccount({
      profile: {name: 'Test User', email: 'test@example.com', member_status_name: 'MASTER', points: 1000},
      bankroll: {coins: 50, keys: 2, swaps: 5, fills: 10},
   });
   assert.equal(tui.profile.name, 'Test User');
   assert.equal(tui.bankroll.coins, 50);

   tui.updateChallenges([{id: '1', title: 'Sunset Magic', member: {ranking: {total: {exposure: 100}}}}]);
   assert.equal(tui.challenges.length, 1);
   assert.equal(tui.challenges[0].title, 'Sunset Magic');

   tui.log('Test message 1');
   assert.equal(tui.logs.length, 1);
   assert.ok(tui.logs[0].includes('Test message 1'));

   tui.setStatus('Idle', 'Standby');
   assert.equal(tui.status, 'Idle');
});
