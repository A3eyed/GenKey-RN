# Deploy GenKey Backend (one-time setup)

## 1. Add GitHub Secrets

Go to: **https://github.com/A3eyed/GenKey-RN/settings/secrets/actions**

Click **New repository secret** and add these two:

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | `11f75768147cb23843be0526f65d185f` |

## 2. Run the workflow

1. Open **https://github.com/A3eyed/GenKey-RN/actions**
2. Click **Deploy GenKey Backend**
3. Click **Run workflow** → **Run workflow**

The workflow will:
- Install dependencies
- Deploy the Worker to `https://genkey.genkey22.workers.dev`
- Bind the D1 database `genkey-db`

## 3. Verify

```bash
curl -X POST https://genkey.genkey22.workers.dev/api/register/options \
  -H "Content-Type: application/json" \
  -d '{"username":"alice"}'
```

You should get JSON (not 404).

## After deploy

Open the web demo and set API base to:

`https://genkey.genkey22.workers.dev`

Then register / login with passkeys.
