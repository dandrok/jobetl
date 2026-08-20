# Deploying the dashboard at https://jobetl.thedotfile.com

The dashboard is a static Svelte bundle plus a small JSON API. In production
nginx terminates TLS, serves `ui/dist` directly, and proxies `/api/*` to the
Node process on loopback. Node is never exposed to the internet.

```
browser ──HTTPS──▶ nginx ──HTTP──▶ 127.0.0.1:3001 (pm2: jobetl-api) ──▶ postgres
                     │
                     └── serves ui/dist directly
```

`thedotfile.com` itself stays on Netlify and is untouched. A subdomain pointed
straight at EC2 avoids proxying through Netlify, which would add a second
forwarding hop and make `X-Forwarded-For` partly attacker-controlled.

## 1. DNS

Add an `A` record for `jobetl` on `thedotfile.com` pointing at the EC2 public IP.
Netlify hosts the apex; this record is a sibling of it and does not affect it.

Confirm before continuing, or certbot will fail:

```bash
dig +short jobetl.thedotfile.com
```

## 2. EC2 security group

Inbound should be **80, 443, and 22 only** — ideally 22 restricted to your own IP.

Explicitly verify **3001 and 5432 are closed**. `.env` used to point at
`13.60.24.63:5432`, so Postgres may still have a public ingress rule. From a
machine outside AWS:

```bash
nc -vz -w 5 jobetl.thedotfile.com 3001   # must fail
nc -vz -w 5 jobetl.thedotfile.com 5432   # must fail
```

## 3. Generate the dashboard password hash

```bash
npm run hash:password
```

The prompt does not echo. It prints a `DASHBOARD_PASSWORD_HASH='...'` line for
`.env` on the EC2 box. **Single quotes are required** — the Argon2 digest
contains `$`, which the shell and some dotenv parsers would otherwise expand.

This uses Argon2id at OWASP-minimum cost (m=19 MiB, t=2, p=1) rather than the
library default of m=64 MiB, p=4. `argon2.verify()` reads its cost parameters
from the stored digest, so an old hash keeps its old cost until regenerated —
the server logs a warning at boot if it detects one.

## 4. nginx

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/jobetl`:

```nginx
# Login throttle. Defence in depth in front of the app's own per-IP limiter,
# so most abuse never reaches Node.
limit_req_zone $binary_remote_addr zone=jobetl_login:10m rate=10r/m;

server {
    listen 80;
    listen [::]:80;
    server_name jobetl.thedotfile.com;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name jobetl.thedotfile.com;

    ssl_certificate     /etc/letsencrypt/live/jobetl.thedotfile.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobetl.thedotfile.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # NOTE: add_header does not merge across levels. If you add an add_header to
    # any location block below, you must repeat every one of these inside it or
    # they are silently dropped for that location.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), camera=(), microphone=()" always;
    add_header Content-Security-Policy   "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

    # Adjust the path if the checkout is not under /home/ubuntu.
    root  /home/ubuntu/jobetl/ui/dist;
    index index.html;

    client_max_body_size 128k;
    server_tokens off;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /api/login {
        limit_req      zone=jobetl_login burst=5 nodelay;
        limit_req_status 429;

        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

`X-Real-IP` is what the app's rate limiter keys on, and `TRUST_PROXY=true` (set
in `ecosystem.config.cjs`) is what makes it trust that header. Both are
required: without the header every visitor shares one bucket, and without
`TRUST_PROXY` the header is ignored.

nginx must be able to traverse into the web root:

```bash
chmod o+x /home/ubuntu /home/ubuntu/jobetl /home/ubuntu/jobetl/ui
sudo ln -s /etc/nginx/sites-available/jobetl /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jobetl.thedotfile.com
```

Certbot installs its own renewal timer; confirm with `systemctl list-timers | grep certbot`.

## 5. Deploy

`.github/workflows/deploy.yml` runs on every push to `master` and now builds the
UI as well as the backend (`npm run build:ui`) — without that step `ui/dist`
never exists on the server and nginx has nothing to serve.

## 6. Verify

```bash
# TLS + security headers
curl -sI https://jobetl.thedotfile.com | grep -iE 'strict-transport|x-frame|x-content|content-security'

# Unauthenticated API is denied
curl -s -o /dev/null -w '%{http_code}\n' https://jobetl.thedotfile.com/api/jobs   # 401

# Node is not directly reachable
curl -m 5 http://<ec2-ip>:3001/api/jobs                                          # must time out

# Login works and sets a Secure cookie
curl -si -X POST https://jobetl.thedotfile.com/api/login \
  -H 'Content-Type: application/json' -d '{"password":"..."}' | grep -i set-cookie
```

The cookie must show `HttpOnly`, `SameSite=Strict` and `Secure`.

## Operational notes

- **Sessions are in-memory.** Any restart or `pm2 reload` logs you out. This is
  deliberate for a single-user dashboard; `SessionStore` is a class so a
  Postgres-backed implementation is a one-file swap.
- **Peak login memory is `UV_THREADPOOL_SIZE` x Argon2 `memoryCost`.** The
  native binding runs on libuv's threadpool, which caps real concurrency
  regardless of request volume. Measured at 50 concurrent login requests:

  | Argon2 memoryCost | threadpool | peak RSS above baseline |
  |---|---|---|
  | 64 MiB (old default) | 4 | ~258 MB |
  | 19 MiB (current)     | 4 | ~77 MB  |
  | 19 MiB               | 16 | ~400 MB |

  The old defaults exceeded the former 250 MB `max_memory_restart`, so a burst
  of unauthenticated logins could force a PM2 restart loop. Both `UV_THREADPOOL_SIZE`
  and the Argon2 parameters are now pinned. **Do not raise `UV_THREADPOOL_SIZE`
  without re-checking this table** — it multiplies peak login memory directly.
- **`PasswordVerifier` bounds the request queue**, returning `503` under burst
  rather than accumulating pending work. It does not reduce the peak above.
- **Rate limiting resets on restart**, since it is also in-memory. The nginx
  `limit_req` zone is unaffected and keeps working.
