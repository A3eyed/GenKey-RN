/**
 * GenKey unified Worker - UI + API
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';

function uuid() { return crypto.randomUUID(); }

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-512' }, keyMaterial, 512);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}
function computeRisk(signals, previous = {}) {
  let score = 0;
  const reasons = [];
  if (previous.last_ip && signals.ip && previous.last_ip !== signals.ip) { score += 25; reasons.push('IP address changed'); }
  if (previous.last_device_fp && signals.deviceFp && previous.last_device_fp !== signals.deviceFp) { score += 35; reasons.push('Device fingerprint mismatch'); }
  if (previous.last_check) {
    const deltaMin = (Date.now() - previous.last_check) / 60000;
    if (deltaMin > 30) { score += 20; reasons.push('Long idle period'); }
  }
  if (!previous.last_device_fp && signals.deviceFp) { score += 15; reasons.push('New device'); }
  score = Math.min(100, Math.max(0, score));
  let level = 'low';
  if (score >= 60) level = 'high';
  else if (score >= 30) level = 'medium';
  return { score, level, reasons, requireStepUp: score >= 60 };
}
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}
function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GenKey</title>
<style>
:root{--bg:#0b0f19;--card:#141b2d;--text:#e8eefc;--muted:#8b9bb8;--primary:#4f8cff;--success:#2ecc71;--danger:#e74c3c;--border:#243049}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:radial-gradient(ellipse at top,#152038,var(--bg));color:var(--text);min-height:100vh;padding:24px}
.container{max-width:440px;margin:0 auto}
.logo{font-size:2.4rem;font-weight:800;text-align:center;background:linear-gradient(135deg,#4f8cff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.tagline{text-align:center;color:var(--muted);margin:8px 0 28px;font-size:.95rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:24px;margin-bottom:20px}
label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:6px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:#0f1524;color:var(--text);font-size:1rem;margin-bottom:14px}
input:focus{outline:none;border-color:var(--primary)}
button{width:100%;padding:14px;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;margin-bottom:10px;transition:opacity .15s}
button:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--primary);color:#fff}
.btn-secondary{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-danger{background:var(--danger);color:#fff}
.status{padding:12px;border-radius:10px;margin-top:12px;font-size:.9rem;display:none}
.status.ok{display:block;background:rgba(46,204,113,.15);color:var(--success)}
.status.error{display:block;background:rgba(231,76,60,.15);color:var(--danger)}
.status.info{display:block;background:rgba(79,140,255,.15);color:var(--primary)}
.hidden{display:none}
.risk-score{font-size:3rem;font-weight:800;text-align:center}
.risk-level{font-weight:700;margin-top:4px;text-align:center}
.session-info{font-size:.85rem;color:var(--muted);margin-top:12px;line-height:1.5}
</style>
</head>
<body>
<div class="container">
  <div class="logo">GenKey</div>
  <div class="tagline">Next-gen auth · Passwordless or classic 2FA · Continuous risk</div>
  <div id="auth-card" class="card">
    <label>Username</label>
    <input id="username" placeholder="alice" autocomplete="username"/>
    <label>Password <span style="opacity:.6">(optional – leave empty for passwordless)</span></label>
    <input id="password" type="password" placeholder="leave empty for passkey-only" autocomplete="current-password"/>
    <button class="btn-primary" id="btn-register" onclick="doRegister()">Register</button>
    <button class="btn-secondary" id="btn-signin" onclick="doSignIn()">Sign In</button>
    <div id="status" class="status"></div>
  </div>
  <div id="session-card" class="card hidden">
    <div style="text-align:center;margin-bottom:12px">Signed in as <strong id="sess-user"></strong></div>
    <div class="risk-score" id="risk-score">0</div>
    <div class="risk-level" id="risk-level">low</div>
    <div class="session-info" id="sess-info"></div>
    <button class="btn-primary" id="btn-stepup" onclick="doStepUp()" style="display:none;margin-top:16px">Step-up authentication</button>
    <button class="btn-danger" onclick="doSignOut()" style="margin-top:10px">Sign Out</button>
  </div>
</div>
<script>
const API = location.origin;
function status(msg, type) {
  const el = document.getElementById('status');
  el.className = 'status ' + (type || 'info');
  el.textContent = msg;
  el.style.display = 'block';
}
function b64urlToBuf(v){const b=String(v).replaceAll('-','+').replaceAll('_','/');const p='='.repeat((4-b.length%4)%4);const s=atob(b+p);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer}
function bufToB64url(buf){const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function prepPK(o){if(o.challenge)o.challenge=b64urlToBuf(o.challenge);if(o.user&&o.user.id)o.user.id=b64urlToBuf(o.user.id);if(o.excludeCredentials)o.excludeCredentials=o.excludeCredentials.map(c=>({...c,id:b64urlToBuf(c.id)}));if(o.allowCredentials)o.allowCredentials=o.allowCredentials.map(c=>({...c,id:b64urlToBuf(c.id)}));return o}
function credJSON(cred){return{id:cred.id,rawId:bufToB64url(cred.rawId),type:cred.type,response:{clientDataJSON:bufToB64url(cred.response.clientDataJSON),attestationObject:cred.response.attestationObject?bufToB64url(cred.response.attestationObject):undefined,authenticatorData:cred.response.authenticatorData?bufToB64url(cred.response.authenticatorData):undefined,signature:cred.response.signature?bufToB64url(cred.response.signature):undefined,userHandle:cred.response.userHandle?bufToB64url(cred.response.userHandle):undefined},clientExtensionResults:cred.clientExtensionResults||{},authenticatorAttachment:cred.authenticatorAttachment}}
function errMsg(e){const m=(e&&e.message)||String(e||'Error');if(/not allowed|NotAllowed|denied permission/i.test(m))return 'Passkey blocked or cancelled. Open in Safari (not an in-app browser), unlock the phone, then try Register again.';return m;}
async function doRegister(){
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value;
  if(!username)return status('Enter a username','error');
  if(!window.PublicKeyCredential)return status('WebAuthn / passkeys not supported in this browser','error');
  try{
    status('Creating registration options…');
    const r=await fetch(API+'/api/register/options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:password||undefined})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed');
    status('Touch your sensor / Face ID…');
    const cred=await navigator.credentials.create({publicKey:prepPK(data.options)});
    status('Verifying…');
    const vr=await fetch(API+'/api/register/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:credJSON(cred),userId:data.userId,username})});
    const vd=await vr.json();
    if(!vr.ok)throw new Error(vd.error||'Verify failed');
    status('Registered! You can now Sign In.','ok');
  }catch(e){status(errMsg(e),'error');console.error(e)}
}
async function doSignIn(){
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value;
  if(!username)return status('Enter a username','error');
  if(!window.PublicKeyCredential)return status('WebAuthn / passkeys not supported in this browser','error');
  try{
    status('Getting authentication options…');
    const r=await fetch(API+'/api/login/options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:password||undefined})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed');
    if(data.requiresPassword)throw new Error('Password required for this account');
    status('Touch your sensor / Face ID…');
    const cred=await navigator.credentials.get({publicKey:prepPK(data.options)});
    status('Verifying…');
    const deviceFp=localStorage.getItem('gk_fp')||(localStorage.setItem('gk_fp',Math.random().toString(36).slice(2)),localStorage.getItem('gk_fp'));
    const vr=await fetch(API+'/api/login/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:credJSON(cred),userId:data.userId,deviceFp,username})});
    const vd=await vr.json();
    if(!vr.ok)throw new Error(vd.error||'Verify failed');
    showSession(vd);
  }catch(e){status(errMsg(e),'error');console.error(e)}
}
function showSession(d){
  document.getElementById('auth-card').classList.add('hidden');
  document.getElementById('session-card').classList.remove('hidden');
  document.getElementById('sess-user').textContent=d.username||d.userId;
  document.getElementById('risk-score').textContent=d.risk?.score??0;
  document.getElementById('risk-level').textContent=d.risk?.level||'low';
  document.getElementById('sess-info').textContent='Session: '+(d.sessionId||'').slice(0,8)+'…  ·  IP: '+(d.ip||'n/a');
  if(d.risk?.requireStepUp)document.getElementById('btn-stepup').style.display='block';
  window._session={sessionId:d.sessionId,userId:d.userId};
}
async function doStepUp(){
  if(!window._session)return;
  try{
    status('Step-up challenge…');
    const r=await fetch(API+'/api/stepup/options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:window._session.sessionId,userId:window._session.userId})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'Failed');
    const cred=await navigator.credentials.get({publicKey:prepPK(data.options)});
    const vr=await fetch(API+'/api/stepup/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({response:credJSON(cred),sessionId:window._session.sessionId,userId:window._session.userId})});
    const vd=await vr.json();
    if(!vr.ok)throw new Error(vd.error||'Failed');
    document.getElementById('risk-score').textContent='0';
    document.getElementById('risk-level').textContent='low';
    document.getElementById('btn-stepup').style.display='none';
    status('Step-up verified','ok');
  }catch(e){status(errMsg(e),'error');console.error(e)}
}
function doSignOut(){
  document.getElementById('auth-card').classList.remove('hidden');
  document.getElementById('session-card').classList.add('hidden');
  document.getElementById('status').style.display='none';
  window._session=null;
}
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      if (path === '/' || path === '/index.html') {
        return new Response(DEMO_HTML, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 'no-store',
            ...corsHeaders(origin)
          }
        });
      }

      if (path === '/health' || path === '/api/health') {
        return json({ ok: true, service: 'GenKey', ts: Date.now() }, 200, origin);
      }

      const rpID = url.hostname;
      const expectedOrigin = url.origin;
      const rpName = env.RP_NAME || 'GenKey';

      // --- Register options ---
      if (path === '/api/register/options' && request.method === 'POST') {
        const body = await request.json();
        const { username, password } = body;
        if (!username) return json({ error: 'username required' }, 400, origin);

        let user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
        if (!user) {
          const id = uuid();
          const salt = password ? generateSalt() : null;
          const hash = password ? await hashPassword(password, salt) : null;
          await env.DB.prepare('INSERT INTO users (id, username, password_hash, password_salt, has_password) VALUES (?, ?, ?, ?, ?)').bind(id, username, hash, salt, !!password).run();
          user = { id, username, has_password: !!password };
        }

        const existing = await env.DB.prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?').bind(user.id).all();
        const options = await generateRegistrationOptions({
          rpName,
          rpID,
          userID: new TextEncoder().encode(user.id),
          userName: username,
          userDisplayName: username,
          attestationType: 'none',
          excludeCredentials: (existing.results || []).map(c => ({
            id: Uint8Array.from(atob(c.credential_id.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0)),
            transports: c.transports ? JSON.parse(c.transports) : undefined
          })),
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
            authenticatorAttachment: 'platform'
          }
        });

        await env.DB.prepare('UPDATE users SET challenge = ?, challenge_expires = ? WHERE id = ?')
          .bind(options.challenge, Date.now() + 300000, user.id).run();

        return json({ options, userId: user.id }, 200, origin);
      }

      // --- Register verify ---
      if (path === '/api/register/verify' && request.method === 'POST') {
        const body = await request.json();
        const { response, userId } = body;
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        if (!user || !user.challenge) return json({ error: 'No pending registration' }, 400, origin);
        if (user.challenge_expires < Date.now()) return json({ error: 'Challenge expired' }, 400, origin);

        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: user.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          requireUserVerification: false
        });

        if (!verification.verified || !verification.registrationInfo) {
          return json({ error: 'Verification failed' }, 400, origin);
        }

        const { credential } = verification.registrationInfo;
        const credId = Buffer.from(credential.id).toString('base64url');
        const pubKey = Buffer.from(credential.publicKey).toString('base64');

        await env.DB.prepare(
          'INSERT INTO credentials (id, user_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(uuid(), userId, credId, pubKey, credential.counter || 0, JSON.stringify(credential.transports || [])).run();

        await env.DB.prepare('UPDATE users SET challenge = NULL, challenge_expires = NULL WHERE id = ?').bind(userId).run();

        return json({ verified: true, userId }, 200, origin);
      }

      // --- Login options ---
      if (path === '/api/login/options' && request.method === 'POST') {
        const body = await request.json();
        const { username, password } = body;
        if (!username) return json({ error: 'username required' }, 400, origin);

        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
        if (!user) return json({ error: 'User not found' }, 404, origin);

        if (user.has_password) {
          if (!password) return json({ error: 'Password required', requiresPassword: true }, 401, origin);
          const hash = await hashPassword(password, user.password_salt);
          if (hash !== user.password_hash) return json({ error: 'Invalid password' }, 401, origin);
        }

        const creds = await env.DB.prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?').bind(user.id).all();
        if (!(creds.results || []).length) return json({ error: 'No credentials registered for this user' }, 400, origin);

        const options = await generateAuthenticationOptions({
          rpID,
          allowCredentials: (creds.results || []).map(c => ({
            id: Uint8Array.from(atob(c.credential_id.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0)),
            transports: c.transports ? JSON.parse(c.transports) : undefined
          })),
          userVerification: 'preferred'
        });

        await env.DB.prepare('UPDATE users SET challenge = ?, challenge_expires = ? WHERE id = ?')
          .bind(options.challenge, Date.now() + 300000, user.id).run();

        return json({ options, userId: user.id, requiresPassword: !!user.has_password }, 200, origin);
      }

      // --- Login verify ---
      if (path === '/api/login/verify' && request.method === 'POST') {
        const body = await request.json();
        const { response, userId, deviceFp } = body;
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        if (!user || !user.challenge) return json({ error: 'No pending login' }, 400, origin);
        if (user.challenge_expires < Date.now()) return json({ error: 'Challenge expired' }, 400, origin);

        const dbCred = await env.DB.prepare('SELECT * FROM credentials WHERE credential_id = ?').bind(response.id).first();
        if (!dbCred || dbCred.user_id !== userId) return json({ error: 'Credential not found' }, 400, origin);

        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: user.challenge,
          expectedOrigin,
          expectedRPID: rpID,
          credential: {
            id: Uint8Array.from(atob(dbCred.credential_id.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0)),
            publicKey: Uint8Array.from(atob(dbCred.public_key), ch => ch.charCodeAt(0)),
            counter: dbCred.counter,
            transports: dbCred.transports ? JSON.parse(dbCred.transports) : undefined
          }
        });

        if (!verification.verified) return json({ error: 'Authentication failed' }, 401, origin);

        await env.DB.prepare('UPDATE credentials SET counter = ? WHERE id = ?')
          .bind(verification.authenticationInfo.newCounter, dbCred.id).run();
        await env.DB.prepare('UPDATE users SET challenge = NULL, challenge_expires = NULL WHERE id = ?').bind(userId).run();

        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
        const prev = await env.DB.prepare('SELECT last_ip, last_device_fp, last_check FROM sessions WHERE user_id = ? ORDER BY last_check DESC LIMIT 1').bind(userId).first();
        const risk = computeRisk({ ip, deviceFp }, prev || {});

        const sessionId = uuid();
        await env.DB.prepare(
          'INSERT INTO sessions (id, user_id, risk_score, last_ip, last_device_fp, last_check) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(sessionId, userId, risk.score, ip, deviceFp || null, Date.now()).run();

        return json({
          verified: true,
          sessionId,
          userId,
          username: user.username,
          ip,
          risk
        }, 200, origin);
      }

      // --- Step-up options ---
      if (path === '/api/stepup/options' && request.method === 'POST') {
        const body = await request.json();
        const { userId } = body;
        const creds = await env.DB.prepare('SELECT credential_id, transports FROM credentials WHERE user_id = ?').bind(userId).all();
        const options = await generateAuthenticationOptions({
          rpID,
          allowCredentials: (creds.results || []).map(c => ({
            id: Uint8Array.from(atob(c.credential_id.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0)),
            transports: c.transports ? JSON.parse(c.transports) : undefined
          })),
          userVerification: 'required'
        });
        return json(options, 200, origin);
      }

      if (path === '/api/stepup/verify' && request.method === 'POST') {
        const body = await request.json();
        const { sessionId } = body;
        await env.DB.prepare('UPDATE sessions SET risk_score = 0, last_check = ? WHERE id = ?')
          .bind(Date.now(), sessionId).run();
        return json({ verified: true, risk: { score: 0, level: 'low' } }, 200, origin);
      }

      return json({ error: 'Not found', path }, 404, origin);
    } catch (err) {
      console.error(err);
      return json({ error: err.message || 'Internal error' }, 500, origin);
    }
  }
};
