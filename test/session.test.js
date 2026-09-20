const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {savedToken} = require('../lib/session');

test('reloads saved sessions and lets the server decide whether an expired cookie token is valid', () => {
   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-session-'));
   const file = path.join(dir, 'cookies.json');
   try {
      assert.equal(savedToken(file), undefined);
      fs.writeFileSync(file, JSON.stringify([{name: 'gs_t', domain: 'gurushots.com', expires: 1, value: 'old'}]));
      assert.equal(savedToken(file), 'old');
      fs.writeFileSync(file, JSON.stringify([{name: 'gs_t', domain: '.gurushots.com', value: 'new'}]));
      assert.equal(savedToken(file), 'new');
      fs.writeFileSync(file, JSON.stringify([{name: 'gs_t', domain: 'other.example', value: 'wrong'}]));
      assert.equal(savedToken(file), undefined);
      fs.writeFileSync(file, 'invalid secret cookie contents');
      assert.throws(() => savedToken(file), error => !error.message.includes('secret'));
   } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
