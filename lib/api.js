const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class ApiError extends Error {
   constructor(message, {status, code, retryAfterMs} = {}) {
      super(message);
      this.status = status;
      this.code = code;
      this.retryAfterMs = retryAfterMs;
   }
   get authenticationExpired() { return this.status === 401 || this.code === 1000; }
}

function retryAfter(value, now = Date.now()) {
   if (value == null) return undefined;
   const seconds = Number(value);
   return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - now) || undefined;
}

class GuruShotsApi {
   constructor({token, fetchImpl = fetch, sleepImpl = sleep, timeoutMs = 20000, readRetries = 2} = {}) {
      Object.assign(this, {token, fetchImpl, sleepImpl, timeoutMs, readRetries});
   }

   async request(endpoint, fields = {}, {readOnly = false, mobile = false, authenticated = true} = {}) {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(fields)) {
         if (Array.isArray(value)) value.forEach(item => body.append(`${key}[]`, String(item)));
         else if (value != null) body.set(key, String(value));
      }
      for (let attempt = 0; ; attempt++) {
         try {
            const response = await this.fetchImpl(`https://api.gurushots.com/${mobile ? 'rest_mobile' : 'rest'}/${endpoint}`, {
               method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
               headers: {
                  'content-type': 'application/x-www-form-urlencoded',
                  'x-api-version': '13', 'x-env': 'WEB', 'x-requested-with': 'XMLHttpRequest',
                  ...(authenticated && this.token ? {'x-token': this.token} : {}),
                  ...(mobile ? {
                     'x-api-version': '38', 'x-env': 'ANDROID',
                     'x-app-version': '5.53.0', 'x-app-id': 'com.gurushots.app',
                     'x-device': 'Pixel 6', 'x-model': 'Pixel 6', 'x-brand': 'google',
                     'user-agent': 'okhttp/4.12.0',
                  } : {}),
               }, body: body.toString(),
            });
            if (!response.ok) throw new ApiError(`${endpoint}: HTTP ${response.status}`, {
               status: response.status, retryAfterMs: retryAfter(response.headers.get('retry-after')),
            });
            let data;
            try { data = await response.json(); }
            catch { throw new ApiError(`${endpoint}: expected a JSON response`); }
            if (data?.success !== true) throw new ApiError(`${endpoint}: API rejected request (code ${Number(data?.error_code) || 'unknown'})`, {
               code: Number(data?.error_code),
            });
            return data;
         } catch (error) {
            const transient = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
            // A lost mutation response may already have been applied. Never replay it.
            if (!readOnly || !transient || attempt >= this.readRetries) throw error;
            const delay = error.retryAfterMs ?? 1000 * 2 ** attempt;
            if (delay > 30000) throw error;
            await this.sleepImpl(Math.max(100, delay));
         }
      }
   }

   async profile() {
      const data = await this.request('get_current_member_profile', {}, {readOnly: true});
      if (!data.profile?.id) throw new ApiError('Profile response did not identify an authenticated member');
      return data.profile;
   }

   async bankroll() {
      try {
         const data = await this.request('get_bankroll', {}, {mobile: true, readOnly: true});
         const items = data.bankroll?.challenges || [];
         const find = type => items.find(i => i.type === type)?.amount ?? 0;
         return {
            coins: find('COINS'),
            keys: find('KEYS'),
            swaps: find('SWAPS'),
            fills: find('FILLS'),
         };
      } catch {
         return null;
      }
   }

   async challenges() {
      const data = await this.request('get_my_active_challenges', {}, {readOnly: true});
      if (!Array.isArray(data.challenges)) throw new ApiError('Challenge response is missing its challenges array');
      return data;
   }

   voteData(challenge) {
      return this.request('get_vote_data', {c_id: challenge.id, url: challenge.url}, {readOnly: true});
   }

   submitVotes(challenge, tokens, verificationToken) {
      if (!tokens.length || !verificationToken) throw new ApiError('Vote submission requires votes and a website verification token');
      return this.request('submit_votes', {
         c_id: challenge.id, tokens, viewed_tokens: tokens, c_token: verificationToken,
      });
   }

   boost(challenge, entry) {
      return this.request('boost_photo', {c_id: challenge.id, image_id: entry.id});
   }

   joinChallenge(challenge, imageIds) {
      if (!challenge?.id || !Array.isArray(imageIds) || !imageIds.length) {
         throw new ApiError('Joining requires a challenge and selected photos');
      }
      return this.request('submit_to_challenge', {
         c_id: challenge.id, el: 'challenges', el_id: true, image_ids: imageIds,
      });
   }
}

module.exports = {GuruShotsApi, ApiError, retryAfter};
