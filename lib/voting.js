const {joinSuggested} = require('./joining');
const {exposureBar} = require('./ui');

function exposureOf(challenge) {
   const value = challenge.member?.ranking?.exposure?.exposure_factor
      ?? challenge.member?.ranking?.total?.exposure;
   return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function planVotes(data, challenge, target, random = Math.random, identifier = 'token') {
   if (String(data.challenge?.id) !== String(challenge.id)) throw new Error('Vote data belongs to a different challenge');
   const voting = data.voting;
   if (voting?.is_voting_open !== true) return {tokens: [], reason: 'Voting is closed'};
   if (voting.mode !== 'member_joined') return {tokens: [], reason: `Unsupported voting mode: ${voting.mode}`};
   const exposure = voting.exposure?.exposure_factor;
   const ratio = voting.exposure?.vote_ratio;
   if (![exposure, ratio, voting.vote_limit].every(Number.isFinite)
      || exposure < 0 || exposure > 100 || ratio <= 0 || voting.vote_limit < 0
      || !Number.isFinite(target) || target <= 0 || target > 100) {
      throw new Error('Invalid exposure or vote limit in vote data');
   }
   if (!Array.isArray(data.images)) throw new Error('Vote data is missing images');
   const tokens = [...new Set(data.images.filter(image => image && !image.reported)
      .map(image => image[identifier]).filter(token => typeof token === 'string' && token.length))];
   for (let i = tokens.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
   }
   const count = Math.min(tokens.length, Math.floor(voting.vote_limit), Math.max(0, Math.ceil((target - exposure) / ratio)));
   return {tokens: tokens.slice(0, count), exposure, estimatedExposure: Math.min(100, exposure + count * ratio),
      reason: count ? undefined : 'No votes needed or available'};
}

function freeBoostEntry(challenge) {
   if (!challenge.boost_enable || challenge.member?.boost?.state !== 'AVAILABLE') return null;
   return challenge.member?.ranking?.entries?.find(entry => entry.id && !entry.boosted && !entry.turbo) ?? null;
}

async function runCycle({api, options, dryRun = false, checkOnly = false, shouldStop = () => false, verificationToken, mobile = false, initialData, log = console.log, onChallenges}) {
   let data = initialData ?? await api.challenges();
   if (typeof onChallenges === 'function') onChallenges(data.challenges, data.suggested_challenges?.length ?? 0);
   log(`Active challenges: ${data.challenges.length}. Suggested: ${data.suggested_challenges?.length ?? 0}.`);
   if (options.autoJoin && !checkOnly) data = await joinSuggested({api, data, dryRun, shouldStop, log});
   for (const challenge of data.challenges) {
      if (shouldStop()) return;
      const exposure = exposureOf(challenge);
      const bar = exposure !== null ? `  ${exposureBar(exposure)}` : '';
      const label = `  • ${challenge.title}: exposure ${exposure === null ? 'unknown' : `${exposure}%`}`;
      const spaces = bar ? ' '.repeat(Math.max(2, 44 - label.length)) : '';
      log(`${label}${spaces}${bar.trim()}`);
      if (checkOnly) continue;
      if (exposure === null || exposure < options.triggerExposure) {
         // Limit each challenge to one batch per cycle; confirm using server state afterwards.
         const plan = planVotes(await api.voteData(challenge), challenge, options.targetExposure, Math.random, mobile ? 'id' : 'token');
         if (!plan.tokens.length) log(`    ↳ Skipped: ${plan.reason}.`);
         else if (dryRun) log(`    ↳ Would vote for ${plan.tokens.length} images; estimated exposure ${plan.estimatedExposure}%.  ${exposureBar(plan.estimatedExposure)}`);
         else {
            const token = mobile ? undefined : await verificationToken();
            if (shouldStop()) return;
            await api.submitVotes(challenge, plan.tokens, token);
            const refreshed = await api.challenges();
            if (typeof onChallenges === 'function') onChallenges(refreshed.challenges);
            const current = refreshed.challenges.find(item => String(item.id) === String(challenge.id));
            const actual = current ? exposureOf(current) : null;
            const actualBar = actual !== null ? `  ${exposureBar(actual)}` : '';
            log(`    ↳ Server accepted ${plan.tokens.length} votes; confirmed exposure: ${actual === null ? 'unavailable' : `${actual}%`}.${actualBar}`);
         }
      }
      if (options.freeBoosts) {
         const entry = freeBoostEntry(challenge);
         if (entry && dryRun) log('    ↳ Would apply an available free boost.');
         else if (entry) {
            // Re-check immediately before using the free boost.
            const refreshed = await api.challenges();
            const current = refreshed.challenges.find(item => String(item.id) === String(challenge.id));
            const currentEntry = current && freeBoostEntry(current);
            if (currentEntry && !shouldStop()) {
               await api.boost(current, currentEntry);
               log('    ↳ Server confirmed free boost.');
            }
         }
      }
   }
}

module.exports = {exposureOf, planVotes, freeBoostEntry, runCycle};
