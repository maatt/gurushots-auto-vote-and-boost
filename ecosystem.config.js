module.exports = {
   apps: [
      {
         name: 'gurushots-autovoter',
         script: 'main.js',
         args: '--no-tui',
         autorestart: true,
         watch: false,
         max_memory_restart: '200M',
         time: true,
         env: {
            NODE_ENV: 'production',
         },
      },
   ],
};
