module.exports = {
   apps: [
      {
         name: 'gurushots-autovoter',
         script: 'main.js',
         args: '--no-tui',
         autorestart: true,
         // Back off 1s -> 2s -> 4s ... (capped at 15s) instead of restarting instantly forever on startup errors.
         exp_backoff_restart_delay: 1000,
         // Give in-flight requests time to finish on stop/restart before PM2 sends SIGKILL (default 1.6s).
         kill_timeout: 10000,
         watch: false,
         max_memory_restart: '200M',
         time: true,
         env: {
            NODE_ENV: 'production',
         },
      },
   ],
};
