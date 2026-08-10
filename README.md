Liumial — Community Chat (static demo)

This repository contains a static, client-only web demo of a chat-first community app named Liumial. It stores all data in the browser's localStorage so you can run it without a backend. The demo covers the features you requested:

- Username/password sign-up & login (stored locally in localStorage)
- Servers (like Discord guilds), channels, and membership
- Per-server text channels and direct messages (single-browser only)
- Messages persisted in localStorage so user progress is saved in the browser
- Profile customization (avatar color, background CSS / gradient, bio)
- Quests: chat-based tasks that award XP and badges when completed
- HelperBot: a simple chat bot with commands (/help, /quests, /profile, /recommend, /bg)
- Theme settings: change accent color and global background (single color or gradient)

Important notes
- This is a client-only demo: accounts and data are stored locally and do not sync across devices or users.
- Passwords are obfuscated with base64 only; this is NOT secure. Do not use real passwords.
- For a production-ready multi-user app, a backend (e.g., Node + PostgreSQL + WebSocket) is required.

How to use
1. Clone the repository
2. Open index.html in a browser
3. Click "Log in / Sign up" to create an account (data saved to localStorage)
4. Create servers, channels, send messages, and complete quests
5. Use commands in chat (e.g. /help, /quests, /bg <css>)

What I added
- index.html, style.css, app.js — the full client application
- LICENSE (MIT)
- README (this file)

Next steps I can take (choose one):
- Scaffold a simple Node.js backend (Express + Socket.IO + SQLite/Postgres) and migrate persistence so multiple users can interact in realtime.
- Add an import/export tool to move data from localStorage into a server-side database.
- Create issues and a project board in this repo for the feature roadmap.

If you'd like me to push a backend scaffold or create issues in this repository, tell me which branch to use and I will proceed.
