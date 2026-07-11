module.exports = {
  apps: [
    {
      name: "jobetl-api",
      script: "npm",
      args: "run api",
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
