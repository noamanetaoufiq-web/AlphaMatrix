# Backend setup (Firebase Auth + Realtime Database) — 5 minutes
1. Firebase console > Authentication > Sign-in method: enable **Email/Password**. In Settings > User actions, **disable "Enable create (sign-up)"**.
2. Authentication > Users > Add user (create BOTH yourself, pick strong passwords):
   - `ilhamati@palace.app`   — Ilham's password
   - `noamane@palace.app`    — your password
3. apiKey: already filled in script.js and admin.html.
4. Realtime Database > Rules: paste `database.rules.json` > Publish. (No UID needed: rules use the two emails.)
5. Authentication > Settings > Authorized domains: make sure `noamanetaoufiq-web.github.io` is listed.
6. Deploy. Login at the gate: answer `ilhamati` or `noamane` + password. Tap 💬, allow notifications.
Notes: Telegram tokens were removed from client code; the private chat replaces Telegram.
