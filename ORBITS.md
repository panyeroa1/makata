# ORBITS: Real-Time Nuance Translation Engine

## 1. Overview
**Orbits** is an elite real-time voice translation application designed to break language barriers with "Extreme Nuance." Unlike traditional translators that sanitize speech, Orbits captures and reproduces every filler word, hesitation, and stutter ("Verbatim Disfluency"), ensuring the emotional and human context of the conversation is preserved.

It features a futuristic, cyberpunk-inspired glassmorphism UI, real-time audio visualization, and a seamless "neural network" aesthetic.

## 2. Aesthetics & Design
*   **Theme**: Deep Space Dark (Default) & Light Mode.
*   **Visual Style**: Glassmorphism (blur filters, translucent panels), Neon Glows (Cyan/Purple), and "Floating" UI elements.
*   **Typography**: Futuristic Sans-Serif (Inter/Orbitron).
*   **Key UI Elements**:
    *   **Orbit Ring**: A pulsating visualizer that reacts to AI status (Listening/Processing/Speaking).
    *   **Floating Captions**: Dynamic subtitles with "User Mic" 🎤 and "AI Sparkles" ✨ icons.
    *   **Interactive Backgrounds**: Animated ambient gradients and particle effects.

## 3. Architecture & Models

### Tech Stack
*   **Frontend**: React (Vite) + TypeScript + Tailwind CSS.
*   **State Management**: React Hooks (`useState`, `useRef`, `useEffect`).
*   **Backend / DB**: Supabase (PostgreSQL + Realtime).
*   **Auth**: Supabase Auth (Email + Google OAuth).

### AI Models
1.  **Speech-to-Text (STT)**:
    *   **Provider**: **Deepgram**
    *   **Model**: `nova-3`
    *   **Features**: Live Streaming, Speaker Diarization, Smart Formatting, Low Latency (Interim Results).
2.  **Translation & Logic (LLM)**:
    *   **Provider**: **Google Gemini**
    *   **Model**: `gemini-2.5-flash`
    *   **Role**: Contextual translation, preserving disfluencies, and orchestration.
3.  **Text-to-Speech (TTS)**:
    *   **Provider**: **Google Gemini**
    *   **Model**: `gemini-2.5-flash-preview-tts` (Streaming)
    *   **Features**: Low latency streaming audio, dynamic voice selection based on target language.

### Audio Pipeline (Strict Sequencing)
To ensure smooth conversation flow without overlapping audio:
1.  **Input**: User speaks -> Deepgram STT (Stream).
2.  **Process**: Text -> Gemini LLM (Translation).
3.  **Output**: Translated Text -> Gemini TTS (Stream) -> **AudioQueue**.
    *   **AudioQueue**: A dedicated system that strictly sequences audio chunks with a **0.5s gap**, ensuring sentences never overlap.

## 4. App Flow

### 1. Landing ("The Portal")
*   **Entry**: Futuristic splash screen with "New Meeting", "Join", and "Sign In".
*   **Auth**: Optional but recommended for saving preferences/avatars.

### 2. Setup ("Secure Handshake")
*   **Host Mode**:
    *   User selects **"I want to listen in: [Language]"** (Target).
    *   Source language is auto-detected.
    *   Click "Start Meeting".
*   **Join Mode**:
    *   Enter Meeting ID and Secure Password.
    *   Select Listening Language.
    *   Click "Establish Connection".

### 3. Active Meeting ("Neural Link")
*   **Interface**:
    *   **Header**: Brand + "Listening: [Language]" Badge + Copiable Link.
    *   **Center**: Video feed (if Cam on) or Avatar visualization.
    *   **Bottom Overlay**: Floating Subtitles (Original + Translation).
    *   **Bottom Bar**: Controls for Mic, Cam, Screen Share, and "End Call".
*   **Interaction**: User speaks natural language. App translates and speaks back in the selected target language to the other participants.

## 5. Database Schema (Supabase)

### `public.profiles`
*Extends Supabase Auth user data.*
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | Primary Key (references `auth.users.id`) |
| `display_name` | text | User's public name |
| `avatar_url` | text | URL to user's avatar image |
| `settings` | jsonb | User preferences (Theme, Font, Auto-Join) |
| `updated_at` | timestamptz | Last update timestamp |

### `public.transcripts`
*Logs raw STT segments.*
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | PK |
| `session_id` | text | Meeting Room ID |
| `speaker_id` | text | User ID or 'system' |
| `content` | text | The raw text spoken |
| `timestamp` | timestamptz | When it was spoken |

### `public.segments` & `translations`
*Structured data for playback and history.*
*   **Segments**: Use `start_ms` and `end_ms` for timeline alignment.
*   **Translations**: Linked to segments via `segment_id`.

## 6. Developer's Todo: Building from Scratch

### Phase 1: Foundation
- [ ] Initialize React + Vite + TypeScript project.
- [ ] Install Tailwind CSS and configure `tailwind.config.js` (add animations).
- [ ] Set up Supabase project and run SQL init scripts.
- [ ] Configure environment variables (`VITE_SUPABASE_URL`, `API_KEY` for Gemini, `DEEPGRAM_API_KEY`).

### Phase 2: Core Services
- [ ] Implement `DeepgramSTT` class (WebSocket management).
- [ ] Implement `GeminiService` (Translation prompt engineering & TTS generation).
- [ ] Build `AudioQueue` class (Buffer management for sequential playback).
- [ ] Create `TranslationPipeline` to orchestrate STT -> LLM -> Queue.

### Phase 3: UI/UX Implementation
- [ ] Build atomic components: `GlassPanel`, `OrbitRing`, `Tooltip`.
- [ ] Create Views: `LandingView`, `HostSetup`, `ActiveCall`.
- [ ] Implement `RealtimeTranslationService` hook for React state integration.
- [ ] Add "Mic" and "Sparkles" icons to subtitle rendering.

### Phase 4: Integration & Polish
- [ ] Wire up `App.tsx` state machine (Idle -> Setup -> Call).
- [ ] Integrate Supabase Auth and Realtime (for signaling/presence).
- [ ] Optimize performance (memoization, efficient re-renders).
- [ ] **Verify Audio Sequencing**: Ensure 0.5s gaps between TTS utterances.

## 7. System Architecture Diagram (Mermaid)

```mermaid
graph TD
    User[User / Microphone] -->|Audio Stream| Deepgram[Deepgram STT (Nova-3)]
    Deepgram -->|Text Stream| Pipeline[Translation Pipeline]
    
    subgraph Core_Logic [Neural Engine]
        Pipeline -->|Original Text| LLM[Gemini Flash 2.5]
        LLM -->|Translated Text| TTS[Gemini TTS (Streaming)]
    end
    
    TTS -->|Audio Chunks| AudioQueue[Audio Queue System]
    AudioQueue -->|Sequenced Audio (0.5s Gap)| Speaker[User Speakers]
    
    Pipeline -->|Logs| Supabase[(Supabase DB)]
    
    subgraph UI_Layer [React Frontend]
        Pipeline -.->|Events| Subtitles[Floating Subtitles]
        Deepgram -.->|Voice Activity| OrbitTheVisual[Orbit Ring Visualizer]
    end
```
