# LINE Rich Menu for Employee ERP

This document explains how to set up and manage the LINE Rich Menu for your employee ERP system.

## Overview

The Rich Menu is a customizable menu that appears at the bottom of the LINE chat when users interact with your bot. It provides quick access to essential functions for both employees and administrators.

## Menu Types

### 1. Employee Rich Menu (2×3 Grid)
For all employees, provides quick access to:

**Row 1:**
- 📊 **Dashboard** - View work summary and notifications
- ✍️ **Check-in/out** - Quick attendance check-in (scan page)
- 📄 **My Slip** - View salary and OT slip

**Row 2:**
- 📋 **Leave Request** - Submit leave requests
- ⏰ **OT Request** - Submit overtime requests
- 🕒 **Time Correction** - Request time entry corrections

### 2. Admin Rich Menu (1×4 Grid)
For HR/Admin users only:

- 📊 **Dashboard** - Admin dashboard
- 👥 **Attendance** - Manage attendance records
- 💰 **Payroll** - Payroll management
- ⚙️ **Admin** - Admin settings and audit logs

## Setup Methods

### Method 1: Using Admin Panel (Recommended)

1. **Log in as Admin**
   - Open the application as an admin/HR user
   - Go to **Admin → LINE Rich Menu** (or open `/admin/line-rich-menu`)

2. **Select Menu Type**
   - Choose between "Employee Menu" or "Admin Menu"

3. **Deploy**
   - Click "Deploy to LINE" button
   - Wait for success message showing the Rich Menu ID

4. **Verify**
   - The menu will appear on LINE for all users/admins in your bot's audience

### Method 2: Using cURL Command

Make sure you have your admin session token first:

```bash
# Get session token from browser:
# 1. Open browser DevTools (F12)
# 2. Go to Application → Local Storage → tdone_session
# 3. Copy the session value

# Deploy Employee Menu
bash scripts/deploy-rich-menu.sh employee https://your-domain YOUR_SESSION_TOKEN

# Deploy Admin Menu
bash scripts/deploy-rich-menu.sh admin https://your-domain YOUR_SESSION_TOKEN
```

### Method 3: Direct API Call

```bash
curl -X POST https://your-domain/api/line/rich-menu \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "action": "create_and_set_default",
  "imageContentType": "image/svg+xml",
  "imageBase64": "BASE64_ENCODED_IMAGE_HERE",
  "richMenu": {
    "size": { "width": 2500, "height": 1686 },
    "selected": true,
    "name": "TD One Employee Menu",
    "chatBarText": "TD One ERP",
    "areas": [
      ... area definitions ...
    ]
  }
}
EOF
```

## How the Menu Works

### For Employees
When an employee opens your bot in LINE and taps on the Rich Menu:
1. Each button opens a specific page in LINE LIFF
2. The LIFF page authenticates the user using their LINE ID
3. The user is redirected to the appropriate section (check-in, leave request, etc.)

### For Admins
Rich Menus can be customized per user:
- Set default menu (all users)
- Link specific menu to individual users
- Unlink users to revert to default

## API Endpoints

### GET Rich Menus
```bash
GET /api/line/rich-menu
Headers: Authorization: Bearer <admin_session_token>
```

Response:
```json
{
  "success": true,
  "richMenus": [
    {
      "richMenuId": "richmenu-...",
      "size": { "width": 2500, "height": 1686 },
      "name": "TD One Employee Menu",
      ...
    }
  ]
}
```

### Link Menu to Specific User
```bash
POST /api/line/rich-menu
Headers: Authorization: Bearer <admin_session_token>
Body:
{
  "action": "link_user",
  "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "richMenuId": "richmenu-xxxxxxxxxxxxxxxxxxxx"
}
```

### Unlink User from Custom Menu
```bash
POST /api/line/rich-menu
Headers: Authorization: Bearer <admin_session_token>
Body:
{
  "action": "unlink_user",
  "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### Delete Rich Menu
```bash
POST /api/line/rich-menu
Headers: Authorization: Bearer <admin_session_token>
Body:
{
  "action": "delete",
  "richMenuId": "richmenu-xxxxxxxxxxxxxxxxxxxx"
}
```

## Configuration Files

**Location:** `lib/lineRichMenuConfig.js`

Contains pre-configured menu structures:
- `EMPLOYEE_RICH_MENU` - Standard employee menu (2×3)
- `ADMIN_RICH_MENU` - Admin menu (1×4)

You can customize these JSON structures to add/remove menu items or change the layout.

## Environment Variables

Required in `.env.local`:

```bash
# LINE Channel Access Token
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token

# Optional protection
LINE_ADMIN_API_KEY=your_random_admin_key
```

## Customization

### Adding New Menu Items

Edit `lib/lineRichMenuConfig.js`:

```javascript
export const EMPLOYEE_RICH_MENU = {
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: {
        type: "uri",
        uri: "https://your-domain/your-page"  // Change this
      }
    },
    // Add more buttons...
  ]
};
```

### Changing Menu Image

The menu image is currently generated as an SVG. To use a custom image:

1. Design a 2500×1686px image (or 2500×843px for admin menu)
2. Convert to base64:
   ```bash
   base64 -i your-image.png
   ```
3. Update the admin panel or API request with the base64 string

## Troubleshooting

### Menu doesn't appear
- Confirm the user/bot is linked in LINE
- Check that your domain is correct
- Verify the LIFF ID matches LINE Developer Console

### Links don't work
- Ensure your domain is publicly accessible
- Check that pages are not behind authentication walls
- Verify `NEXT_PUBLIC_APP_BASE_URL` in `.env.local`

### Permission denied
- Confirm user has admin/hr_payroll role
- Check that `LINE_CHANNEL_ACCESS_TOKEN` is set
- Verify session token is valid and hasn't expired

### Rich Menu not updating
- LINE caches menu images (~24 hours)
- Delete old menu ID first before creating new one
- Use a new menu name to force refresh

## Best Practices

1. **Test First** - Always test in a dev environment before deploying to production
2. **Keep It Simple** - Use 4-6 items maximum for clarity
3. **Use Icons** - Emojis or clear labels help users understand buttons
4. **Consistent Layout** - Maintain same style/colors across all menus
5. **Monitor Usage** - Check which menu items are most/least used
6. **Version Control** - Save menu JSON before major changes
7. **User Feedback** - Ask employees which menu items they find most useful

## Menu Analytics

LINE provides analytics on rich menu click through rates:
1. Open LINE Official Account Manager
2. Go to Analytics → Click Statistics
3. View which menu buttons get the most clicks
4. Use this data to optimize menu layout

## Related Configuration

- LIFF Setup: See `docs/line-liff-richmenu.md`
- Session Management: `lib/validateSession.js`
- API Routes: `app/api/line/rich-menu/route.js`

## Support

For LINE Rich Menu API documentation, visit:
https://developers.line.biz/en/docs/line-bot-sdk-nodejs/api-reference/
