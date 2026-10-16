# How to integrate GenKey into your website or app

GenKey gives your users strong, phishing-resistant login (Passwordless or Classic 2FA) + continuous protection.

## Quick Start for Websites

### 1. Add the SDK

```html
<script src="https://your-cdn-or-server/genkey.js"></script>
```

### 2. Initialize

```js
const genkey = new GenKey('https://your-genkey-worker.workers.dev');
```

### 3. Register a user

```js
// Passwordless (recommended)
const result = await genkey.register({
  username: 'alice',
  mode: 'passwordless'
});

// OR Classic 2FA (password + passkey)
const result = await genkey.register({
  username: 'alice',
  mode: 'classic',
  password: 'her-password'
});
```

### 4. Login

```js
const result = await genkey.login({
  username: 'alice'
  // password: '...' only if the account uses classic mode
});

if (result.verified) {
  // User is authenticated
  console.log('Logged in as', result.user.username);
}
```

### 5. Continuous protection (recommended)

```js
setInterval(async () => {
  const risk = await genkey.checkRisk({
    sessionId: result.sessionId
  });

  if (risk.requireStepUp) {
    await genkey.stepUp({
      userId: result.user.id,
      sessionId: result.sessionId
    });
  }
}, 15000);
```

## What your users see

**Passwordless mode**
- Click “Sign in with GenKey”
- Unlock with Face ID / fingerprint
- Done

**Classic 2FA mode**
- Enter password
- Unlock with Face ID / fingerprint
- Done

## For mobile apps

Call the same backend endpoints and use the platform’s native passkey APIs (iOS AuthenticationServices, Android Credential Manager, or react-native-passkey).
