# GenKey

**Strong, phishing-resistant authentication for any website or app.**

GenKey replaces weak password + SMS/code login with:

- **Passwordless** (Face ID / fingerprint only) — already multi-factor
- **Classic 2FA** (password + passkey)
- **Continuous risk monitoring** after login
- **Automatic step-up** when risk is high

## What the user experiences

1. Clicks “Sign in with GenKey”
2. Unlocks with Face ID / fingerprint
3. They’re in
4. GenKey keeps watching in the background

Phishing sites cannot steal the passkey.

## Project Structure

```
GenKey-RN/
├── backend/          # Cloudflare Workers + D1 backend
├── sdk/              # JavaScript SDK for websites
├── web-demo/         # Live demo page
├── app/              # React Native (Expo) starter
├── INTEGRATION.md    # How websites/apps integrate GenKey
└── README.md
```

## Quick Start

### 1. Deploy Backend (Cloudflare)

```bash
cd backend
npm install
npx wrangler login
npx wrangler d1 create genkey-db
# Put the database_id into wrangler.toml
npx wrangler d1 execute genkey-db --file=./schema.sql
npx wrangler deploy
```

You will receive a URL like `https://genkey.xxxx.workers.dev`.

### 2. Test with the Web Demo

1. Open `web-demo/index.html`
2. Replace `API_BASE` with your Worker URL
3. Open the page in a browser (must be HTTPS or localhost)
4. Register → use Face ID / fingerprint → see continuous risk score

### 3. Integrate into your own website

See **[INTEGRATION.md](./INTEGRATION.md)** for the full guide.

Basic usage:

```js
const genkey = new GenKey('https://your-worker.workers.dev');

// Register
await genkey.register({ username: 'alice', mode: 'passwordless' });

// Login
const result = await genkey.login({ username: 'alice' });
```

## Features

| Feature | Status |
|---------|--------|
| Passwordless (passkey only) | ✅ |
| Classic 2FA (password + passkey) | ✅ |
| Phishing resistance | ✅ |
| Continuous risk scoring | ✅ |
| Adaptive step-up | ✅ |
| JavaScript SDK | ✅ |
| Cloudflare Workers backend | ✅ |
| React Native starter | ✅ |

## Cost

- Cloudflare free tier is more than enough for personal and early production use.
- Total cost to run and test: **$0**.

## Next

When you give me your Cloudflare account details / API tokens, I can help you deploy the backend immediately and finish any remaining polish.
