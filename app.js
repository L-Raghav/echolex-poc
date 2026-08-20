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

  // Load our custom AudioWorkletProcessor (runs on a separate audio thread)
  await audioContext.audioWorklet.addModule('audio-processor.js');

  // Tap into the <audio> element's output
  const source = audioContext.createMediaElementSource(audioEl);
  const captureNode = new AudioWorkletNode(audioContext, 'capture-processor');

  // Every time the processor sends us a chunk of raw samples, log it
  captureNode.port.onmessage = (event) => {
    chunkCount++;
    const chunk = event.data; // Float32Array of raw PCM samples

    // Only log every ~20th chunk so the console doesn't flood
    if (chunkCount % 20 === 0) {
      console.log(
        `Captured chunk #${chunkCount}: ${chunk.length} samples @ ${audioContext.sampleRate}Hz`,
        'first 5 samples:', chunk.slice(0, 5)
      );
    }
  };

  // Route audio: element -> capture node (taps the data) -> speakers (so you still hear it)
  source.connect(captureNode);
  captureNode.connect(audioContext.destination);

  audioEl.play();
  console.log('✅ Audio capture started. Sample rate:', audioContext.sampleRate, 'Hz');
});
