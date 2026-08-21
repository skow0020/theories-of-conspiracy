# Theories of Conspiracy

A multiplayer party game where one player acts as the judge, everyone else invents a funny conspiracy theory about a given topic, and the judge picks their favorite.

This app is built with Next.js, React, and Socket.IO for real-time multiplayer rooms.

## Requirements

- Node.js 18+
- npm
- ngrok (optional, for testing from a phone or other device)

## Local development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Then open:

- http://localhost:3000

The app uses a custom Node server so the Socket.IO multiplayer room system works correctly.

## Production mode

Build the app:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

This runs the app in production mode through the custom server.

## Using ngrok for remote testing

If you want to test the app from a phone or another device, tunnel your local app through ngrok.

1. Start the app locally:

```bash
npm run dev
```

2. In a second terminal, run:

```bash
ngrok http 3000
```

3. Copy the HTTPS forwarding URL from ngrok, for example:

```bash
https://8504-24-152-148-2.ngrok-free.app
```

4. Open that URL in the browser or on your phone.

5. If you want to override the socket URL manually, set:

```bash
NEXT_PUBLIC_SOCKET_URL=https://your-ngrok-url
```

The app also defaults to the current window origin when running from an ngrok host, so it will follow the active tunnel automatically after the URL changes.

## Important note about ngrok and dev mode

The local dev server needs to allow the tunnel origin in development. The project already includes ngrok origins in the Next.js config, including:

- localhost
- 127.0.0.1
- 0.0.0.0
- *.ngrok-free.app
- *.ngrok.app

If ngrok changes its URL, you usually only need to reopen the tunnel and load the new public URL. No code change is needed unless you want to force a specific socket URL with an environment variable.

## Deploying to Heroku

This project bundles the Next.js frontend and the Socket.IO server into a single Node process (`server.js`) so it can be deployed as one Heroku web process.

1. Create a Heroku app and push your code (CLI):

```bash
heroku login
heroku create your-app-name
git push heroku HEAD:main
```

2. Ensure the `Procfile` is present (this repo includes one) so Heroku runs the correct command:

```
web: node server.js
```

3. Set the client socket URL to point at the Heroku app (so browsers connect to the host running Socket.IO). Replace `your-app-name` with your actual app name:

```bash
heroku config:set NEXT_PUBLIC_SOCKET_URL=https://your-app-name.herokuapp.com
```

4. Scale a web dyno if necessary and follow logs:

```bash
heroku ps:scale web=1
heroku logs --tail
```

Notes:
- Use the HTTPS URL (`https://...`) — WebSocket handshakes work reliably over wss/https.
- If you keep the frontend on Vercel, set the same `NEXT_PUBLIC_SOCKET_URL` in the Vercel project environment variables so the browser connects to the Heroku host instead of the Vercel host.
- Heroku supports WebSockets. If you run multiple dynos, configure a Socket.IO adapter (Redis) so events propagate across instances.
- For faster deployments or regional control consider Render, Fly, or Cloud Run (these services can run the same `server.js` process).


## Common workflow

- Local play: http://localhost:3000
- Remote play: your ngrok HTTPS URL
- Build check: npm run build
- Restart dev server if the port is stuck: Ctrl+C and run npm run dev again

## Game flow

- Create or join a room
- Pick a topic
- Submit a conspiracy theory
- Judge reviews theories anonymously
- Cast a vote
- Advance to the next round

The judge vote phase keeps theory submissions hidden to reduce bias during judging.
