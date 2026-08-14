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
