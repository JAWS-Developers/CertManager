# CertManager

A web application for managing SSL/TLS certificates via the [ZeroSSL](https://zerossl.com) API.

![CertManager Dashboard](https://github.com/user-attachments/assets/81ea4bcd-fa49-436c-9b65-381bcb4cce5a)

## Features

- **Service Management** – Create and manage services, each associated with one or more domains and a certificate path.
- **Automatic Certificate Issuance** – Generates a CSR, requests a 90-day certificate from ZeroSSL, handles domain verification (HTTP file or email), downloads the certificate, and installs it automatically.
- **One-click Renewal** – Before expiry, click *Renew* to replace the old certificate with a fresh one.
- **Automatic Restart** – After installation, the configured restart command is executed on the server (e.g. `systemctl restart nginx`).
- **Dashboard** – Overview of all services with certificate status, expiry countdown, and quick-action links.
- **Settings** – Store your ZeroSSL API key securely in the backend.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend API | PHP (local JSON storage) |
| Certificate Authority | ZeroSSL REST API v2 |

### Directory Structure

```
├── backend/              # PHP backend
│   ├── api/
│   │   ├── services.php  # Services CRUD API
│   │   ├── cert.php      # Certificate operations (request/verify/install/renew)
│   │   └── settings.php  # ZeroSSL API key management
│   ├── lib/
│   │   ├── Services.php      # JSON-backed service store
│   │   ├── ZeroSSL.php       # ZeroSSL REST API client
│   │   └── CertManager.php   # CSR generation, cert installation, command execution
│   └── data/
│       ├── services.json     # Services data store
│       └── settings.json     # App settings (ZeroSSL API key)
└── src/                  # React frontend
    ├── screens/
    │   ├── home/             # Dashboard
    │   ├── services/         # Services list, form, and detail (cert workflow)
    │   └── settings/         # ZeroSSL API key configuration
    ├── components/           # Layout, Modal, StatusBadge, DomainsInput
    ├── api/                  # TypeScript API wrappers
    └── types/                # TypeScript types
```

## Getting Started

### Prerequisites

- **PHP 8.0+** with `openssl` and `curl` extensions enabled
- **Node.js 18+**
- A free [ZeroSSL account](https://app.zerossl.com/signup) and API access key

### Development Setup

1. **Install frontend dependencies:**
   ```bash
   npm install
   ```

2. **Start the PHP backend** (in a separate terminal):
   ```bash
   php -S localhost:8000 -t backend/
   ```

3. **Start the frontend dev server:**
   ```bash
   npm run dev
   ```
   The Vite dev server proxies all `/api/*` requests to the PHP backend at `http://localhost:8000`.

4. Open [http://localhost:5173](http://localhost:5173) and go to **Settings** to add your ZeroSSL API key.

### Production Deployment

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Configure your web server (Apache/Nginx) to:
   - Serve the `dist/` directory for all non-API requests
   - Proxy `/api/*` to the PHP backend (or place the `backend/` directory under your document root and configure `mod_rewrite`/`try_files`)

3. Ensure the PHP process has write access to `backend/data/` and the certificate directories.

## Certificate Workflow

1. **Create a Service** – Set the service name, domains, certificate directory path, verification method, and restart command.
2. **Request Certificate** – CertManager generates a private key and CSR, then calls ZeroSSL to initiate the certificate request.
3. **Verify Domain** – For HTTP verification, the validation file is automatically created in your webroot. For email, ZeroSSL sends a verification link.
4. **Install** – Once issued, downloads the certificate, creates `fullchain.pem` (cert + CA bundle) and `privkey.key`, places them at the configured path, and executes the restart command.
5. **Renew** – When notified by ZeroSSL that a certificate is expiring, click *Renew* to issue a fresh certificate and reinstall automatically.

## Security Notes

- The ZeroSSL API key is stored in `backend/data/settings.json` — ensure this file is not web-accessible.
- The PHP backend uses `exec()` to run restart commands; only deploy on trusted infrastructure.
- Private keys are stored in `backend/data/services.json` in the interim; restrict access to this file (`chmod 600`).
