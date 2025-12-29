# Tasks Log

This file tracks the daily development tasks.

Task ID: T-0001
Title: Develop Joining Users Functionality
Status: IN-PROGRESS
Owner: Miles
Created: 2025-12-30 06:55
Last updated: 2025-12-30 06:55

START LOG

Timestamp: 2025-12-30 06:55
Current behavior or state:
- The structure for joining users (landing page, auth, signaling) needs to be verified and implemented/connected.
- `App.tsx` and `signalingService.ts` are being investigated.
- `SignalingService` requires an authenticated user to join a room.

Plan and scope for this task:
- Analyze existing code for joining logic in `LandingView.tsx` and `App.tsx`.
- Connect the UI commands (Join button) to `SignalingService.joinRoom`.
- Ensure guest login or authentication flow is seamless for new users joining via link.
- Verify that finding a room checks if it exists before trying to join.

Files or modules expected to change:
- `App.tsx`
- `components/LandingView.tsx`
- `services/signalingService.ts`

Risks or things to watch out for:
- Ensuring signaling connects correctly.
- Managing user state (joined/not joined).
- Handling permissions (mic/cam) during join.
