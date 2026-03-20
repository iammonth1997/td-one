# PWA UAT Checklist (Employee UI)

Date: ____________________
Tester: ____________________
Environment: Local / Staging / Production
Build/Version: ____________________
Domain Tested: ____________________

## 1) Entry Criteria (must be true before testing)

- [ ] App is served over HTTPS (required for full PWA behavior outside localhost)
- [ ] Latest deployment is live and hard refresh completed
- [ ] PWA files are reachable:
  - [ ] /manifest.json
  - [ ] /sw.js
  - [ ] /offline.html
- [ ] Employee test account is available

## 2) Android (Chrome) - Functional UAT

### 2.1 Installability
- [ ] Open employee flow (login -> dashboard)
- [ ] Install UI is available (browser install prompt or Install App button)
- [ ] Install action succeeds and app icon appears on Home screen

Result:
- Pass / Fail
- Notes: ______________________________________________

### 2.2 Standalone Launch
- [ ] Launch app from Home screen icon
- [ ] App opens in standalone mode (no browser address bar)
- [ ] Employee routes render correctly (dashboard, request, slip, scan)

Result:
- Pass / Fail
- Notes: ______________________________________________

### 2.3 Offline Behavior
- [ ] Open a few employee UI pages while online
- [ ] Turn airplane mode ON (or disable internet)
- [ ] Re-open app from Home screen
- [ ] Previously visited UI pages do not crash
- [ ] Offline fallback page appears when page is not available

Result:
- Pass / Fail
- Notes: ______________________________________________

### 2.4 Install Banner Dismissal Logic
- [ ] Tap close on install banner
- [ ] Banner is hidden
- [ ] Banner does not reappear immediately after reload
- [ ] Dismissal behavior is acceptable for business expectation (7-day hide)

Result:
- Pass / Fail
- Notes: ______________________________________________

## 3) iOS (Safari) - Functional UAT

### 3.1 Add to Home Screen
- [ ] Open employee flow in Safari
- [ ] Use Share -> Add to Home Screen
- [ ] App icon appears on Home screen

Result:
- Pass / Fail
- Notes: ______________________________________________

### 3.2 Standalone Launch
- [ ] Launch from iOS Home screen icon
- [ ] App opens without normal Safari chrome
- [ ] Employee routes render correctly

Result:
- Pass / Fail
- Notes: ______________________________________________

### 3.3 Offline Behavior
- [ ] Open key employee pages while online
- [ ] Disable internet
- [ ] Re-open app from Home screen
- [ ] App does not crash and fallback behavior is acceptable

Result:
- Pass / Fail
- Notes: ______________________________________________

## 4) Security/Behavior Sanity (Employee UI)

- [ ] API routes are not cached by service worker (network behavior is correct)
- [ ] Authentication/session behavior remains unchanged after install
- [ ] Logout still works correctly from installed app
- [ ] No sensitive data appears in offline fallback content

Result:
- Pass / Fail
- Notes: ______________________________________________

## 5) DevTools Verification (Desktop support check)

- [ ] Application > Manifest loads valid metadata and icons
- [ ] Application > Service Workers shows active service worker
- [ ] Offline simulation confirms fallback behavior

Result:
- Pass / Fail
- Notes: ______________________________________________

## 6) Final Sign-off

Overall Status:
- [ ] PASS (Ready for production)
- [ ] CONDITIONAL PASS (minor follow-up)
- [ ] FAIL (must fix before release)

Open Issues:
1. ______________________________________________
2. ______________________________________________
3. ______________________________________________

Approved by: ____________________
Date: ____________________
