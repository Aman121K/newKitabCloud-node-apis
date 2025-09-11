
module.exports = {
  apps: [
    {
      name: "kitabcloud-api",          // any name you like
      script: "src/server.ts",         // your app’s entry point
      watch: false,                    // disable auto-reload on file change
      instances: 1,                    // or "max" for all CPUs
      autorestart: true,
      env: {
        NODE_ENV: "production"
        // add other env vars if needed
      }
    }
  ]
};
