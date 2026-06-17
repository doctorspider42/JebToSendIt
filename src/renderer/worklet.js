/*
 * AudioWorklet — liczy szczytową amplitudę w krótkich oknach (~10 ms)
 * i wysyła ją na główny wątek. Detekcja uderzenia (próg + cooldown)
 * dzieje się w renderer.js, żeby łatwo sterować nią z UI.
 *
 * Pracuje na surowych próbkach (blok 128), więc łapie nawet bardzo
 * krótkie transjenty (uderzenie/jebnięcie), których pętla rAF by nie złapała.
 */
class PeakProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.windowMax = 0;
    this.acc = 0;
    this.reportSamples = Math.max(1, Math.round(sampleRate * 0.010)); // ~10 ms
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > this.windowMax) this.windowMax = a;
      }
      this.acc += ch.length;
      if (this.acc >= this.reportSamples) {
        this.port.postMessage(this.windowMax);
        this.windowMax = 0;
        this.acc = 0;
      }
    }
    return true;
  }
}

registerProcessor('peak-processor', PeakProcessor);
