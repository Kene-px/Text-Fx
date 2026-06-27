# Text Fx — Figma Text Animation Plugin

Text Fx is a Figma plugin that transforms any text into a ready-to-use animated component. Select a text layer or type a word, configure your animation style, preview it live inside the plugin, and generate a fully prototyped component set — all without leaving Figma.

---

## Features

- **Multiple animation styles** — Typing, Fade In/Out, Slide (Left, Right, Up, Down), Scale (Grow/Shrink), and Rotate
- **Letter or word granularity** — animate character by character or word by word
- **Forward and backward direction** — run each animation in either direction
- **Configurable duration** — set the total animation duration in milliseconds
- **Live preview** — play and pause the animation inside the plugin before generating anything
- **Custom typography** — pick a Google Font, set weight, size, alignment, text case, and color directly from the preview toolbar
- **Auto-prototyping** — generated components include Figma prototype interactions wired up automatically (AFTER_TIMEOUT transitions, SMART_ANIMATE for scale/rotate, DISSOLVE for dissolve-style animations)
- **Works across Figma products** — Figma Design, FigJam, and Figma Slides are all supported
- **Feedback modal** — submit feedback without leaving the plugin

---

## How It Works

### Step 1 — Choose your subject

Select an existing **text layer** in Figma and the plugin will read its content automatically, or type a word/sentence directly into the plugin's input field (up to 100 characters).

### Step 2 — Configure and preview

Choose your animation settings:

| Setting   | Options |
|-----------|---------|
| Style     | Typing · Scale · Rotate · Fade · Slide |
| Type by   | Letter · Word |
| Direction | Forward · Backward |
| Duration  | 100 ms – 10,000 ms |
| Font      | Any Google Font, with weight, size, alignment, case, and color controls |

The **live preview** plays the animation in real time. Use the play/pause button in the corner of the preview area to control playback.

### Step 3 — Create the component

Click **Create component**. The plugin generates a Figma **Component Set** where each variant represents one frame of the animation. Prototype interactions are wired between variants automatically so the animation plays when previewed in Figma's prototype mode.

---

## Animation Styles

| Style    | What it does |
|----------|-------------|
| **Typing** | Reveals text one letter or word at a time, with a blinking cursor |
| **Fade In** | Text fades from invisible to fully visible |
| **Fade Out** | Text fades from fully visible to invisible |
| **Slide Left / Right / Up / Down** | Text slides into view from the specified direction |
| **Scale** | Text scales up from nothing (Grow) or scales down to nothing (Shrink) |
| **Rotate** | Text appears or disappears in a spiral/rotational pattern |

---

## Platform Support

| Editor   | Behavior |
|----------|----------|
| **Figma Design** | Creates a prototyped Component Set with automatic variant interactions |
| **FigJam** | Creates a sequence of Rounded Rectangle shapes connected by arrows to visualise the animation flow |
| **Figma Slides** | Creates one slide per animation frame, then opens Grid view to show the full sequence |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Plugin logic | TypeScript (compiled to `code.js`) |
| UI | Vanilla HTML/CSS/JavaScript (`ui.html`) |
| Fonts | Google Fonts API |
| Figma API | `@figma/plugin-typings` |
| Linting | ESLint with `@figma/eslint-plugin-figma-plugins` |

The plugin communicates between the UI and the Figma document via the standard `figma.ui.postMessage` / `onmessage` pattern. The UI lives in a single self-contained `ui.html` file. All animation frame generation and component/prototype creation happens in `code.ts`.

---

## Project Structure

```
Text-Fx/
├── code.ts          # Plugin logic — animation frame generation, component creation, prototyping
├── code.js          # Compiled output (generated from code.ts, do not edit manually)
├── ui.html          # Plugin UI — step flow, live preview, typography controls, feedback modal
├── manifest.json    # Figma plugin manifest
├── tsconfig.json    # TypeScript configuration
├── package.json     # NPM scripts and dev dependencies
└── icon.png         # Plugin icon
```

---

## Development Setup

**Prerequisites:** Node.js and npm

### 1. Install dependencies

```bash
npm install
```

### 2. Compile TypeScript

```bash
# One-time build
npm run build

# Watch mode (recompiles on save)
npm run watch
```

### 3. Load the plugin in Figma

1. Open Figma Desktop.
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json` from this directory.

The plugin will appear under **Plugins → Development** and will reload automatically when `code.js` changes.

---

## Credits

Designed by [kene](https://hellokene.com) · Developed by [sarah](https://sarah-adewale.netlify.app)
