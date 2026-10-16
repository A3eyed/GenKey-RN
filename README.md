# GenKey – React Native + Cloudflare Workers

**Passwordless multi-factor + Classic 2FA with continuous risk monitoring.**

Zero / very low cost stack:
- **Backend**: Cloudflare Workers + D1 (SQLite)
- **App**: React Native (Expo)

## Project Structure

```
GenKey-RN/
├── backend/          # Cloudflare Worker
│   ├── src/index.js
│   ├── schema.sql
│   ├── wrangler.toml
│   └── package.json
└── app/              # Expo React Native app
    ├── App.js
    └── package.json
```

## 1. Deploy the Backend (Cloudflare)

```bash
cd backend
npm install
npx wrangler login
npx wrangler d1 create genkey-db
```

Copy the `database_id` that is printed and paste it into `wrangler.toml`.

Then run the migration:

```bash
npx wrangler d1 execute genkey-db --file=./schema.sql
```

Deploy:

```bash
npx wrangler deploy
```

After deploy you will get a URL like:
`https://genkey.<your-subdomain>.workers.dev`

## 2. Configure the App

Open `app/App.js` and replace:

```js
const API_BASE = 'https://genkey.YOUR_SUBDOMAIN.workers.dev';
```

with your real Worker URL.

## 3. Run the App on your phone

```bash
cd app
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (iOS/Android).

## Features

- Passwordless mode (passkey only – multi-factor)
- Classic 2FA mode (password + passkey)
- Continuous risk scoring (device, IP, behavior, time)
- Step-up challenge on high risk
- Works on iOS and Android

## Notes on Passkeys in React Native

Full native passkey support requires a library such as:
- `react-native-passkey`
- or platform modules + Expo config plugins

The current `App.js` contains the complete API flow and UI.  
The native `Passkey.create()` / `Passkey.get()` calls are marked with TODO so you can plug in the library of your choice.

## Cost

Cloudflare free tier is extremely generous for personal / prototype use.  
Expo Go is free.  
Total cost for testing: **$0**.
