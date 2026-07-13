# WealthCraft Post-Deployment Checklist

Once Vercel reports a successful deployment, run through these smoke tests on the live production URL to ensure the database, authentication, and WebSockets are connected properly.

## Core Connectivity
- [ ] **Login works**: Click "Sign in with Google" and ensure you are successfully redirected back to the lobby.
- [ ] **Registration works**: Ensure new accounts are properly recorded in the Neon database without 500 errors.

## Lobby Mechanics
- [ ] **Create room**: Generate a new room and verify that a 6-character room code is successfully issued.
- [ ] **Join room**: Open a second browser (incognito) and join the room code. Verify that both browsers see the new player instantly (Validates Pusher WebSockets).

## Gameplay Simulation
- [ ] **Bot game**: Start a 1 Human vs 3 Bots game. Ensure the bots take their turns rapidly without crashing the backend loop.
- [ ] **Multiplayer game**: Play a fast few turns between two human tabs.
- [ ] **Trading**: Propose a trade from one player to another. Accept it. Verify cash/assets update immediately.
- [ ] **Audits**: Audit an opponent and verify the outcome logic fires without throwing server errors.
- [ ] **Auctions**: Trigger a property auction and verify that the timer ticks down globally across all clients.
- [ ] **Year End**: Complete a full lap and verify that the rebalance modal appears and processes successfully.
- [ ] **Victory**: Trigger the endgame condition and ensure the winner screen renders and commits to the database.

## System Monitoring
- [ ] **Analytics**: Hit the authenticated `GET /api/admin/analytics` route and ensure it returns data without throwing 500 errors.
- [ ] **Error monitoring**: Check Vercel Logs. Ensure there are no silent unhandled promise rejections or database connection timeouts.
