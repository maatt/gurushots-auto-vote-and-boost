const {GuruShotsApi, ApiError} = require('./api');

// Contract traced from the user-provided Android 5.53.0 APK. Mobile access is
// checked before a cycle can join, vote, or boost. Never fall back to Chromium.
class MobileApi extends GuruShotsApi {
   constructor(options = {}) {
      super(options);
      if (options.memberId) this.memberId = options.memberId;
   }

   async login(username, password) {
      if (!username || !password) throw new ApiError('Mobile login requires GURUSHOTS_USERNAME and GURUSHOTS_PASSWORD or config.json credentials');
      const data = await this.request('signin/', {login: username, password}, {mobile: true, authenticated: false});
      if (typeof data.token !== 'string' || !data.token || !data.member_id) {
         throw new ApiError('Mobile login response is missing its session token or member ID');
      }
      this.token = data.token;
      this.memberId = data.member_id;
      return data.token;
   }

   async profile() {
      if (this.memberId) {
         try {
            const data = await this.request('get_profile', {id: this.memberId}, {mobile: true, readOnly: true});
            if (data?.id) return data;
         } catch {}
      }
      try {
         const data = await this.request('get_current_member_profile', {}, {readOnly: true});
         if (data.profile?.id) {
            this.memberId = data.profile.id;
            return data.profile;
         }
      } catch {}
      const data = await this.challenges();
      return {id: 'authenticated', challenges: data.challenges?.length};
   }

   async challenges() {
      const data = await this.request('get_my_active_challenges', {}, {mobile: true, readOnly: true});
      if (!Array.isArray(data.challenges)) throw new ApiError('Mobile challenge response is missing its challenges array');
      return data;
   }

   voteData(challenge) {
      return this.request('get_vote_images', {c_id: challenge.id, limit: 100, onboarding_mode: false}, {mobile: true, readOnly: true});
   }

   async submitVotes(challenge, imageIds) {
      if (!Array.isArray(imageIds) || !imageIds.length
         || imageIds.some(id => typeof id !== 'string' || !id)) {
         throw new ApiError('Mobile vote submission requires photo IDs');
      }
      return this.request('submit_vote', {
         c_id: challenge.id, image_ids: imageIds, viewed_image_ids: imageIds, layout: 'scroll',
      }, {mobile: true});
   }

   async boost(challenge, entry) {
      if (!challenge?.id || !entry?.id) throw new ApiError('Mobile boost requires challenge and photo entry');
      return this.request('boost_photo', {c_id: challenge.id, image_id: entry.id}, {mobile: true});
   }

   async joinChallenge(challenge, imageIds) {
      if (!challenge?.id || !Array.isArray(imageIds) || !imageIds.length) {
         throw new ApiError('Joining requires a challenge and selected photos');
      }
      return this.request('submit_to_challenge', {
         photos: imageIds, el: 'android_app', el_id: challenge.id, chlg_id: challenge.id, onboarding_mode: false,
      }, {mobile: true});
   }
}

module.exports = {MobileApi};
