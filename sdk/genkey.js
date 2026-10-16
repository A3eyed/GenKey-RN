/**
 * GenKey JavaScript SDK
 * Simple integration for any website or web app
 */
class GenKey {
  constructor(apiBase) {
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  async #request(path, body) {
    const res = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async register({ username, displayName, mode = 'passwordless', password }) {
    if (!username) throw new Error('username is required');
    if (mode === 'classic' && !password) throw new Error('password is required for classic mode');

    const options = await this.#request('/api/register/options', {
      username,
      displayName: displayName || username,
      mode
    });

    const credential = await navigator.credentials.create({
      publicKey: this.#preparePublicKeyOptions(options)
    });

    const result = await this.#request('/api/register/verify', {
      response: this.#credentialToJSON(credential),
      password: mode === 'classic' ? password : undefined,
      userId: options.userId,
      mode,
      expectedChallenge: options.challenge
    });

    return result;
  }

  async login({ username, password }) {
    if (!username) throw new Error('username is required');

    const options = await this.#request('/api/login/options', { username });

    if (options.requiresPassword && !password) {
      throw new Error('This account requires a password (classic 2FA mode)');
    }

    const assertion = await navigator.credentials.get({
      publicKey: this.#preparePublicKeyOptions(options)
    });

    const result = await this.#request('/api/login/verify', {
      response: this.#credentialToJSON(assertion),
      password: options.requiresPassword ? password : undefined,
      userId: options.userId,
      expectedChallenge: options.challenge,
      deviceFp: this.#getDeviceFingerprint()
    });

    return result;
  }

  async checkRisk({ sessionId, behaviorScore = 0 }) {
    return this.#request('/api/risk/check', {
      sessionId,
      deviceFp: this.#getDeviceFingerprint(),
      behaviorScore
    });
  }

  async stepUp({ userId, sessionId }) {
    const options = await this.#request('/api/stepup/options', { userId });
    const assertion = await navigator.credentials.get({
      publicKey: this.#preparePublicKeyOptions(options)
    });
    return this.#request('/api/stepup/verify', {
      response: this.#credentialToJSON(assertion),
      userId,
      sessionId,
      expectedChallenge: options.challenge
    });
  }

  #preparePublicKeyOptions(options) {
    const prepared = { ...options };
    if (prepared.challenge) prepared.challenge = this.#base64urlToBuffer(prepared.challenge);
    if (prepared.user?.id) prepared.user.id = this.#base64urlToBuffer(prepared.user.id);
    if (prepared.excludeCredentials) {
      prepared.excludeCredentials = prepared.excludeCredentials.map(c => ({
        ...c, id: this.#base64urlToBuffer(c.id)
      }));
    }
    if (prepared.allowCredentials) {
      prepared.allowCredentials = prepared.allowCredentials.map(c => ({
        ...c, id: this.#base64urlToBuffer(c.id)
      }));
    }
    return prepared;
  }

  #credentialToJSON(cred) {
    const json = { id: cred.id, rawId: this.#bufferToBase64url(cred.rawId), type: cred.type, response: {} };
    if (cred.response.attestationObject) {
      json.response = {
        clientDataJSON: this.#bufferToBase64url(cred.response.clientDataJSON),
        attestationObject: this.#bufferToBase64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : []
      };
    } else {
      json.response = {
        clientDataJSON: this.#bufferToBase64url(cred.response.clientDataJSON),
        authenticatorData: this.#bufferToBase64url(cred.response.authenticatorData),
        signature: this.#bufferToBase64url(cred.response.signature),
        userHandle: cred.response.userHandle ? this.#bufferToBase64url(cred.response.userHandle) : undefined
      };
    }
    return json;
  }

  #base64urlToBuffer(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(base64 + pad);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    return buffer;
  }

  #bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  #getDeviceFingerprint() {
    const data = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, new Date().getTimezoneOffset()].join('|');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(16);
  }
}

if (typeof window !== 'undefined') window.GenKey = GenKey;
if (typeof module !== 'undefined') module.exports = GenKey;
