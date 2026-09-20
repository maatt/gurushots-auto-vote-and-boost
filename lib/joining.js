function planJoin(challenge) {
   if (!challenge?.id || challenge.status !== 'active') return {reason: 'Challenge is not active'};
   if (challenge.join_coins !== 0) return {reason: 'Entry costs coins or its cost is unknown'};
   if (challenge.member?.submit_state !== 'join') return {reason: 'Challenge is already joined or requires unlocking'};
   if (challenge.member?.ranking?.entries?.length) return {reason: 'Challenge already has entries'};
   const limit = challenge.max_photo_submits;
   if (!Number.isInteger(limit) || limit <= 0) return {reason: 'Invalid photo limit'};
   // Match the website's pre-submit dialog: use its suggested order, up to
   // max_photo_submits. Never substitute arbitrary photos from the library.
   const photos = challenge.member.suggested_images;
   if (!Array.isArray(photos)) return {reason: 'No suggested photos'};
   const imageIds = [...new Set(photos.filter(photo => photo?.permission?.allowed !== false)
      .map(photo => photo?.id).filter(id => typeof id === 'string' && id.length))].slice(0, limit);
   return imageIds.length ? {imageIds} : {reason: 'No eligible suggested photos'};
}

async function joinSuggested({api, data, dryRun, shouldStop = () => false, log = console.log}) {
   const suggestions = data.suggested_challenges ?? [];
   if (!Array.isArray(suggestions)) throw new Error('Malformed suggested challenge list');
   let current = data;
   const seen = new Set();
   for (const candidate of suggestions) {
      if (shouldStop()) break;
      const id = String(candidate?.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (current.challenges.some(challenge => String(challenge.id) === id)) continue;
      const initial = planJoin(candidate);
      if (!initial.imageIds) {
         log(`Join ${candidate?.title ?? 'Unknown'}: skipped (${initial.reason}).`);
         continue;
      }
      if (dryRun) {
         log(`Would join ${candidate.title} for 0 coins with ${initial.imageIds.length} suggested photo(s): ${initial.imageIds.join(', ')}.`);
         continue;
      }
      current = await api.challenges();
      if (current.challenges.some(challenge => String(challenge.id) === id)) continue;
      const fresh = current.suggested_challenges?.find(challenge => String(challenge.id) === id);
      const plan = planJoin(fresh);
      if (!plan.imageIds) {
         log(`Join ${candidate.title}: skipped (${plan.reason}).`);
         continue;
      }
      if (shouldStop()) break;
      // Mutation requests are never replayed after an uncertain response.
      const result = await api.joinChallenge(fresh, plan.imageIds);
      current = await api.challenges();
      const joinedId = String(result.challenge_id ?? fresh.id);
      const joined = current.challenges.find(challenge => String(challenge.id) === joinedId);
      const entries = new Set((joined?.member?.ranking?.entries ?? []).map(entry => String(entry.id)));
      if (!joined || !plan.imageIds.every(imageId => entries.has(imageId))) {
         throw new Error(`Join ${candidate.title}: submission accepted but active entries could not be confirmed; stopping before further actions`);
      }
      log(`Joined ${candidate.title}: ${plan.imageIds.length} photo(s), 0 coins; active entries confirmed.`);
   }
   return current;
}

module.exports = {planJoin, joinSuggested};
