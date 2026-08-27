# EchoLex — Sprint 0 Report: Audio Capture Proof of Concept

**Status:** ✅ Complete
**Goal:** Prove that raw audio can be captured live, in real time, from a playing audio file in the browser — the foundational building block every later sprint depends on.

---

## 1. Why This Sprint Exists

EchoLex's entire premise is generating a transcript *as audio plays*, not from a pre-recorded file after the fact. Before building anything involving speech recognition, we needed to answer one narrow question first: **can JavaScript actually get its hands on raw audio data while it's playing, in small enough pieces to process it live?**

If the answer were no, the whole project would need a different approach. Sprint 0 exists purely to prove the answer is yes, with nothing else mixed in — no networking, no APIs, no UI polish. Just capture.

## 2. What Was Built

```
echolex-poc/
├── README.md
├── .gitignore
├── .env.example
├── index.html
├── app.js
├── audio-processor.js
└── assets/
    └── audio/
        └── sample.mp3   (local only — not pushed to GitHub)
```

Three files do the actual work: `index.html`, `app.js`, and `audio-processor.js`. Here's what each one does and why it's written the way it is.

---

## 3. `index.html` — The Page Itself

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>EchoLex — Sprint 0: Audio Capture Test</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; }
    button { padding: 10px 18px; font-size: 15px; cursor: pointer; }
    audio { width: 100%; margin: 20px 0; }
    p.hint { color: #555; font-size: 14px; }
  </style>
</head>
<body>
  <h1>EchoLex — Sprint 0</h1>
  <p>Goal: prove we can capture live audio samples while the file plays.</p>

  <audio id="podcastAudio" controls src="assets/audio/sample.mp3"></audio>

  <button id="startCapture">Start Capture</button>
  <p class="hint">Click this once, then press play on the audio above.</p>

  <script src="app.js"></script>
</body>
</html>
```

**What matters here, line by line:**

- `<audio id="podcastAudio" controls src="assets/audio/sample.mp3">` — this is a built-in HTML element that plays audio files. `controls` tells the browser to show the default play/pause/volume UI, so we didn't have to build one ourselves. The `src` attribute is a **relative path**: it means "look for a file at `assets/audio/sample.mp3`, starting from wherever this HTML file lives." This is why the folder structure matters — if `sample.mp3` isn't at exactly that path, the browser simply can't find it.
- `<button id="startCapture">` — a plain button. Nothing happens when you click it yet from HTML's perspective; the `id` is just a hook so JavaScript (`app.js`) can find this specific button and attach behavior to it later.
- `<script src="app.js">` — this is what connects the page to our actual logic. Without this line, `app.js` would just be a file sitting unused on disk; this is what tells the browser "run this JavaScript file once the page loads."
- The `id` attributes (`podcastAudio`, `startCapture`) are the bridge between HTML and JavaScript — JS uses `document.getElementById(...)` to grab a reference to these exact elements, which you'll see in `app.js` next.

This file has no logic in it at all on purpose — HTML's job is structure (what exists on the page), not behavior (what happens when you interact with it). That's `app.js`'s job.

---

## 4. `app.js` — The Orchestrator

```javascript
const audioEl = document.getElementById('podcastAudio');
const startBtn = document.getElementById('startCapture');

let audioContext;
let chunkCount = 0;

startBtn.addEventListener('click', async () => {
  if (audioContext) {
    console.log('Capture already running — refresh the page to restart.');
    return;
  }

  audioContext = new AudioContext();

  await audioContext.audioWorklet.addModule('audio-processor.js');

  const source = audioContext.createMediaElementSource(audioEl);
  const captureNode = new AudioWorkletNode(audioContext, 'capture-processor');

  captureNode.port.onmessage = (event) => {
    chunkCount++;
    const chunk = event.data;

    if (chunkCount % 20 === 0) {
      console.log(
        `Captured chunk #${chunkCount}: ${chunk.length} samples @ ${audioContext.sampleRate}Hz`,
        'first 5 samples:', chunk.slice(0, 5)
      );
    }
  };

  source.connect(captureNode);
  captureNode.connect(audioContext.destination);

  audioEl.play();
  console.log('✅ Audio capture started. Sample rate:', audioContext.sampleRate, 'Hz');
});
```

**Walking through it:**

- **`document.getElementById('podcastAudio')`** and **`document.getElementById('startCapture')`** — these grab live references to the exact HTML elements from before, so JavaScript can control them (play the audio, react to the button being clicked).

- **`let audioContext; let chunkCount = 0;`** — two variables declared outside the click handler, deliberately. `audioContext` needs to persist across the whole session (we check `if (audioContext)` later to prevent starting capture twice). `chunkCount` needs to keep incrementing every time a new chunk arrives, not reset each time.

- **`startBtn.addEventListener('click', async () => { ... })`** — this is the core pattern of interactive web pages: "when this specific thing happens (a click), run this function." The function is marked `async` because a few lines inside it (`audioWorklet.addModule`) take time to complete and we need to `await` them rather than moving on before they're ready.

- **`new AudioContext()`** — this is the browser's entry point into the **Web Audio API**, a built-in system for working with audio at a low level (not just "play this file" but "give me access to the actual sound data"). One `AudioContext` represents one audio-processing session.

- **`await audioContext.audioWorklet.addModule('audio-processor.js')`** — this loads our second JS file (`audio-processor.js`, explained next) as a special kind of processor that runs on its own dedicated audio thread. We `await` this because it has to finish loading before we can use it in the next line.

- **`createMediaElementSource(audioEl)`** — this is the critical bridge: it takes our existing `<audio>` element (which is already playing sound normally) and makes its audio stream available to the Web Audio API as a "source" we can tap into.

- **`new AudioWorkletNode(audioContext, 'capture-processor')`** — creates a connection point to the processor we loaded a moment ago. `'capture-processor'` is a name we'll see defined inside `audio-processor.js` — this is how the two files find each other.

- **`captureNode.port.onmessage = (event) => {...}`** — this sets up a listener for messages *sent from* the audio-processor file. Every time it sends us a new chunk of raw samples, this function runs. Since real audio produces hundreds of tiny chunks per second, we only `console.log` every 20th one (`chunkCount % 20 === 0`) — otherwise the console would be an unreadable, overwhelming flood of text.

- **`source.connect(captureNode); captureNode.connect(audioContext.destination);`** — this line is doing something worth understanding: Web Audio API works like plugging cables between audio nodes. We're saying "audio flows from the source (our file), through the capture node (where we tap/copy it), and finally out to the destination (your speakers)." Without this chain, either you wouldn't hear anything, or we wouldn't get to see the data.

- **`audioEl.play()`** — starts actual playback, now that the whole audio-processing chain is wired up and ready to receive it.

---

## 5. `audio-processor.js` — The Part That Actually Taps the Audio

```javascript
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0) {
      const channelData = input[0];

      if (output.length > 0) {
        output[0].set(channelData);
      }

      this.port.postMessage(channelData.slice());
    }

    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
```

This file is different from the other two in an important way: **it doesn't run on the main JavaScript thread that the rest of your page runs on.** It runs on a separate, dedicated thread specifically for audio processing. This matters because audio needs to be processed extremely fast and consistently (any delay causes audible glitches) — keeping it isolated from everything else your page might be doing (rendering, handling clicks, etc.) protects it from those interruptions.

- **`class CaptureProcessor extends AudioWorkletProcessor`** — this is the required shape for any audio worklet: a class that extends a special built-in browser class.

- **`process(inputs, outputs)`** — this single method is called automatically by the browser, over and over, extremely frequently (roughly every 2.7 milliseconds for typical settings) — each time, it's handed a small new slice of raw audio.

- **`const channelData = input[0]`** — `inputs` is structured as `inputs[input_number][channel_number]`, since audio can have multiple inputs and multiple channels (like stereo left/right). We're grabbing the first input's first channel — effectively treating the audio as mono for this proof of concept.

- **`output[0].set(channelData)`** — this copies the audio straight through to the output unchanged. Without this line, connecting through our capture node would silence the audio entirely — we're required to explicitly pass it along if we want it to keep playing normally.

- **`this.port.postMessage(channelData.slice())`** — this is how data escapes this isolated audio thread and reaches `app.js`'s `onmessage` handler from before. The `.slice()` matters: it creates a genuine copy of the data rather than a reference to it, because the original buffer gets reused/overwritten by the browser on the very next cycle — without copying, the data you'd receive in `app.js` could already be stale or corrupted by the time you look at it.

- **`return true`** — tells the browser "keep calling `process()` again for the next chunk." Returning `false` here would shut the processor down permanently.

- **`registerProcessor('capture-processor', CaptureProcessor)`** — this is what makes the name `'capture-processor'` (used back in `app.js`) actually mean something — it registers this class under that name so the main thread can create an `AudioWorkletNode` referencing it.

---

## 6. Reading the Actual Test Output

The console confirmed capture is genuinely working:

```
✅ Audio capture started. Sample rate: 192000 Hz
Captured chunk #20: 128 samples @ 192000Hz
first 5 samples: [-0.0000855..., -0.0001158..., -0.0001474..., ...]
```

A few things worth understanding about this output:

- **128 samples per chunk** — this is the standard, fixed chunk size `AudioWorkletProcessor` delivers on most browsers. It's small and consistent by design, since consistent timing matters more for audio than large chunk sizes.
- **The tiny decimal numbers** (like `-0.0000855...`) are the actual waveform values — audio samples are represented as numbers between -1.0 and 1.0, describing the speaker's position at that exact instant. Near-zero values like these typically mean this moment in the audio was quiet.
- **192000 Hz is worth flagging** — this is unusually high (192kHz is a "hi-res audio" rate; most audio, including the MP3 file itself, is natively 44.1kHz or 48kHz). This number comes from your **system's audio output device settings**, not from the MP3 file — `AudioContext` matches whatever sample rate your computer's sound card/drivers are currently configured for, regardless of the source file's actual rate. This isn't a bug, and it doesn't affect this sprint's goal (proving capture works) — but it's a detail to keep in mind for Sprint 1, since Deepgram's streaming API expects audio at a specific rate (commonly 16kHz), so we'll need to explicitly resample before sending audio there.

---

## 7. The Non-Code Skills Exercised This Sprint

Worth documenting, since this was a first project end-to-end:

- **Git & GitHub fundamentals:** cloning a repo, `git status` / `git add` / `git commit` / `git push`, setting global git identity (`user.name`, `user.email`), and authenticating with GitHub over HTTPS.
- **Terminal navigation:** `pwd`, `cd`, `ls` / `ls -a`, `mkdir -p`, `mv`, and writing files directly from the terminal with `cat > file << 'EOF'`.
- **Running a local development server** (`python -m http.server`) and understanding *why* it's required (browsers restrict certain APIs, like `AudioWorklet`, when a page is opened directly from the file system rather than served over `http://`).
- **Browser developer tools:** using the Console tab to observe real-time program behavior.

---

## 8. What's Next: Sprint 1 Preview

Sprint 0 proved we can *capture* audio. Sprint 1's job is to take those captured chunks and stream them to **Deepgram's real-time speech-to-text API**, so that instead of logging raw sample numbers, we start seeing actual live words appear as the audio plays. The resampling note above (192kHz → 16kHz) will be one of the first things to handle before that streaming connection can work correctly.
