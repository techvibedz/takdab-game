# Multiplayer

Run the game and PartyKit server in separate terminals:

```sh
npm run dev
npm run dev:party
```

The client uses `localhost:1999` by default. Copy `.env.example` to `.env.local` when the server or TURN relay is hosted elsewhere.

For production, deploy the room server with `npm run deploy:party`, set `VITE_PARTYKIT_HOST` to the returned PartyKit host, then rebuild the client. Configure the three `VITE_TURN_*` values for reliable voice across mobile carriers and restrictive networks; STUN remains the local/default fallback.

Checks:

```sh
npm test
npm run test:multiplayer
npm run build
```

`test:multiplayer` expects a PartyKit development server on port 1999. It verifies two clients, reconnects, private cards, signaling, card play, and challenges.
