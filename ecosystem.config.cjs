module.exports = {
  apps: [
    {
      name: "jobetl-api",
      script: "npm",
      args: "run api",
      env_production: {
        NODE_ENV: "production",
        // Bind loopback only: nginx is the only thing that should reach this.
        HOST: "127.0.0.1",
        PORT: "3001",
        // nginx sets X-Real-IP; without this the rate limiter sees 127.0.0.1
        // for every visitor and they all share one bucket.
        TRUST_PROXY: "true",
        // Argon2 runs on the libuv threadpool, so peak login memory is
        // UV_THREADPOOL_SIZE x memoryCost. Pinned to the default so that peak
        // is deterministic: 4 x 19 MiB = ~77 MB, well under max_memory_restart.
        UV_THREADPOOL_SIZE: "4"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "400M",
      autorestart: true,
      exp_backoff_restart_delay: 100
    }
  ]
};
