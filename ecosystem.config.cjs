module.exports = {
  apps: [
    {
      name: "jobetl-api",
      script: "npm",
      args: "run api",
      env_production: {
        NODE_ENV: "production"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "250M",
      autorestart: true,
      exp_backoff_restart_delay: 100
    }
  ]
};
