# IRL Hide & Seek v3 — Render + Node.js + Socket.IO

This version replaces Cloudflare Workers and Durable Objects with one Node.js server.
Express serves the HTML pages; Socket.IO handles live multiplayer rooms.

## Run locally
1. Install Node.js LTS.
2. Open this folder in VS Code.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

To test phones on the same Wi-Fi, find your PC's LAN IPv4 address with `ipconfig`, then open `http://YOUR-PC-IP:3000` on the phone. Allow Node.js through Windows Firewall for private networks.

## Deploy to Render
1. Create a GitHub repository and upload the contents of this folder.
2. In Render, create a **New Web Service** and connect that repository.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
4. Deploy. Render provides an HTTPS URL.
5. Open the URL, create a room, and share the Host panel's `ChairmanJoinCloudflare.html?room=XXXXXX` link with players.

## Game flow
- Host creates room. Server returns room code and private host token.
- Host page connects using the token.
- Players join using room link or code and wait on player.html.
- Host starts. Server randomly selects Seeker(s), assigns all other connected non-host players as Hiders, and sends role events.
- Clients automatically switch to hider.html or seeker.html.
- Host admin panel switches from lobby to live match.

## Admin commands
/help, /status, /players, /start [seekers], /pause, /resume, /end, /newround, /setseekers number, /timer seconds, /broadcast message, /caught player, /uncaught player, /revive player, /kick player, /rename old new, /rules, /setrules text, /safezone text, /boundary text, /checkin, /emergency, /lockroom, /unlockroom, /shuffle, /ability message, /reset.

## Hosting note
The room state is held in server memory. Use a single Render instance for this prototype; restarting/redeploying the service clears active rooms. If your hosting plan sleeps when idle, the first visit may take a little longer while it wakes.

## IRL safety
This app does not use GPS. Abilities are game announcements/rule effects only. Agree on boundaries and a safe point before play; never use roads, private property or unsafe hiding places. The emergency command pauses the match and broadcasts a stop instruction.
