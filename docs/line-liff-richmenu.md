# LINE LIFF + Rich Menu Setup

Note: This document now also supports employee LIFF login/link flow.

This project now includes:
- LIFF page at `/liff`
- Rich Menu management API at `/api/line/rich-menu`

## 1) Create LINE assets

1. In LINE Developers Console, create a Messaging API channel.
2. In the same provider, create LIFF app and set endpoint URL:
   - `https://<your-domain>/liff`
3. Get values:
   - LIFF ID
   - Channel access token (long-lived)

## 2) Configure environment variables

Add these variables to `.env.local`:

```bash
NEXT_PUBLIC_APP_BASE_URL=https://your-domain
NEXT_PUBLIC_LIFF_ID=2009413188-4647l7eA
LINE_LOGIN_CHANNEL_ID=2009413188
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
# Optional extra protection for rich-menu API
LINE_ADMIN_API_KEY=your_random_admin_key
```

## 2.1) Migration required for employee LIFF login

Run this migration in production:

- `migrations/007_add_line_user_id_to_login_users.sql`

This adds `login_users.line_user_id` and a unique index so one LINE account cannot be linked to multiple employee accounts.

## 2.2) Employee LIFF login endpoints

- `POST /api/liff-login`
- `POST /api/verify-pin` (verify employee PIN and link LINE user)

Both endpoints require `id_token` from LIFF SDK and verify it against LINE endpoint `oauth2/v2.1/verify`.

## 3) LIFF test

1. Open LIFF URL from LINE app.
2. Page should show display name + LINE user ID.
3. Tap `Open Dashboard` to open your web app dashboard.

## 4) Rich Menu API usage

Endpoint:
- `POST /api/line/rich-menu`
- `GET /api/line/rich-menu`

Authentication:
- `Authorization: Bearer <tdone_session_token>` (admin/HR role)
- Optional `x-line-admin-key: <LINE_ADMIN_API_KEY>`

### 4.1 List rich menus

```bash
curl -X GET https://your-domain/api/line/rich-menu \
  -H "Authorization: Bearer <session_token>" \
  -H "x-line-admin-key: <optional_key>"
```

### 4.2 Create and set default rich menu

Send payload with:
- `richMenu`: LINE rich menu object
- `imageBase64`: image content (base64 only, no data URI prefix)
- `imageContentType`: `image/png` or `image/jpeg`

Example body:

```json
{
  "action": "create_and_set_default",
  "imageContentType": "image/png",
  "imageBase64": "<BASE64_IMAGE>",
  "richMenu": {
    "size": { "width": 2500, "height": 843 },
    "selected": true,
    "name": "TD One Main Menu",
    "chatBarText": "Open TD One",
    "areas": [
      {
        "bounds": { "x": 0, "y": 0, "width": 1250, "height": 843 },
        "action": {
          "type": "uri",
          "uri": "https://your-domain/liff"
        }
      },
      {
        "bounds": { "x": 1250, "y": 0, "width": 1250, "height": 843 },
        "action": {
          "type": "uri",
          "uri": "https://your-domain/dashboard"
        }
      }
    ]
  }
}
```

### 4.3 Link rich menu to specific user

```json
{
  "action": "link_user",
  "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "richMenuId": "richmenu-xxxxxxxxxxxxxxxxxxxx"
}
```

### 4.4 Unlink user

```json
{
  "action": "unlink_user",
  "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### 4.5 Delete rich menu

```json
{
  "action": "delete",
  "richMenuId": "richmenu-xxxxxxxxxxxxxxxxxxxx"
}
```

## 5) Recommended production hardening

- Keep `LINE_CHANNEL_ACCESS_TOKEN` server-side only.
- Keep `LINE_ADMIN_API_KEY` enabled in production.
- Restrict API caller role to admin/HR only (already enforced).
- Log all rich menu management actions if you need formal audit records.
