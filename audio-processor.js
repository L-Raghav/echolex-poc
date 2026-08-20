// This runs on a dedicated audio-rendering thread, separate from the main JS thread.
// Its job: pass audio through unchanged (so playback isn't affected) while also
// sending a copy of each chunk back to app.js via a message port.

class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0) {
      const channelData = input[0]; // mono channel, Float32Array of samples (-1.0 to 1.0)

      // Pass the audio through so playback continues normally
      if (output.length > 0) {
        output[0].set(channelData);
      }

      // Send a copy of this chunk to the main thread (this is what app.js logs)
      this.port.postMessage(channelData.slice());
    }

    return true; // returning true keeps this processor alive for the next chunk
  }
}

registerProcessor('capture-processor', CaptureProcessor);
