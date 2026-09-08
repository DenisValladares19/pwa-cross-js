/**
 * Compresor optico feed-forward en dominio logaritmico.
 *
 * Basado en Giannoulis, Massberg & Reiss,
 * "Digital Dynamic Range Compressor Design - A Tutorial and Analysis",
 * JAES 60(6):399-408, 2012:
 *   - gain computer con soft knee (Ec. 4)
 *   - detector "branched" suavizado (Ec. 16)
 *
 * El caracter optico viene del release dependiente del programa: el tiempo de
 * recuperacion crece con la reduccion de ganancia actual, imitando la memoria
 * no lineal de la celda LDR (recuperacion rapida inicial + cola lenta).
 */

const DB_FLOOR = 1e-9;
const LN10_OVER_20 = Math.LN10 / 20;
const METER_BLOCKS = 32; // ~90 ms a 44.1 kHz con bloques de 128 muestras

class OptoCompressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -24, minValue: -60, maxValue: 0, automationRate: "k-rate" },
      { name: "ratio", defaultValue: 3, minValue: 1, maxValue: 20, automationRate: "k-rate" },
      { name: "knee", defaultValue: 12, minValue: 0, maxValue: 40, automationRate: "k-rate" },
      { name: "attack", defaultValue: 0.01, minValue: 0.0005, maxValue: 0.5, automationRate: "k-rate" },
      { name: "releaseFast", defaultValue: 0.06, minValue: 0.005, maxValue: 1, automationRate: "k-rate" },
      { name: "releaseSlow", defaultValue: 0.5, minValue: 0.05, maxValue: 15, automationRate: "k-rate" },
      { name: "makeup", defaultValue: 0, minValue: -24, maxValue: 24, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();

    // Estado del detector por canal. Preasignado: nada se crea en process().
    // Dos ramas de release con la misma constante de ataque: la celda LDR
    // recupera ~50% deprisa y el resto con una cola larga. Una sola rama solo
    // sabe hacer una pendiente, y con senal continua se queda clavada en
    // reduccion maxima, comportandose como una ganancia fija.
    this.yFast = new Float32Array(8);
    this.ySlow = new Float32Array(8);

    // Coeficientes cacheados y las taus que los generaron.
    this.attackTau = -1;
    this.alphaA = 0;
    this.releaseFastTau = -1;
    this.alphaRFast = 0;
    this.releaseSlowTau = -1;
    this.alphaRSlow = 0;

    this.blockCount = 0;
    this.peakGr = 0;
    this.alive = true;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "stop") {
        this.alive = false;
      }
    };
  }

  /** alpha = exp(-1 / (tau * fs)), cacheado porque exp() es caro por muestra. */
  attackCoeff(tau) {
    if (tau !== this.attackTau) {
      this.attackTau = tau;
      this.alphaA = Math.exp(-1 / (tau * sampleRate));
    }
    return this.alphaA;
  }

  releaseFastCoeff(tau) {
    if (tau !== this.releaseFastTau) {
      this.releaseFastTau = tau;
      this.alphaRFast = Math.exp(-1 / (tau * sampleRate));
    }
    return this.alphaRFast;
  }

  releaseSlowCoeff(tau) {
    if (tau !== this.releaseSlowTau) {
      this.releaseSlowTau = tau;
      this.alphaRSlow = Math.exp(-1 / (tau * sampleRate));
    }
    return this.alphaRSlow;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      return this.alive;
    }

    const p = parameters;
    const T = p.threshold[0];
    const R = p.ratio[0];
    const W = p.knee[0];
    const attack = p.attack[0];
    const relFast = p.releaseFast[0];
    const relSlow = p.releaseSlow[0];
    const makeup = p.makeup[0];

    const slope = 1 / R - 1;
    const halfKnee = W * 0.5;
    const alphaA = this.attackCoeff(attack);
    const alphaRFast = this.releaseFastCoeff(relFast);
    const relSpan = relSlow - relFast;

    let blockPeakGr = 0;

    for (let ch = 0; ch < input.length; ch++) {
      const inCh = input[ch];
      const outCh = output[ch];
      if (!inCh || !outCh) continue;

      let yFast = this.yFast[ch];
      let ySlow = this.ySlow[ch];

      for (let n = 0; n < inCh.length; n++) {
        const x = inCh[n];
        const mag = x < 0 ? -x : x;
        const xDb = 20 * Math.log10(mag + DB_FLOOR);

        // --- Gain computer soft knee (Ec. 4) ---
        const over = xDb - T;
        let yG;
        if (2 * over < -W) {
          yG = xDb;
        } else if (2 * (over < 0 ? -over : over) <= W) {
          const d = over + halfKnee;
          yG = xDb + (slope * d * d) / (2 * W);
        } else {
          yG = T + over / R;
        }

        let xL = xDb - yG;
        if (xL < 0) xL = 0;

        // --- Detector branched suavizado (Ec. 16), dos ramas de release ---
        if (xL > yFast) {
          yFast = alphaA * yFast + (1 - alphaA) * xL;
        } else {
          yFast = alphaRFast * yFast + (1 - alphaRFast) * xL;
        }

        if (xL > ySlow) {
          ySlow = alphaA * ySlow + (1 - alphaA) * xL;
        } else {
          // Release dependiente del programa: mas reduccion => cola mas lenta.
          let k = ySlow / 6;
          if (k > 1) k = 1;
          const alphaRSlow = this.releaseSlowCoeff(relFast + relSpan * k);
          ySlow = alphaRSlow * ySlow + (1 - alphaRSlow) * xL;
        }

        // Mitad rapida, mitad lenta: dos pendientes de recuperacion visibles.
        const yL = 0.5 * yFast + 0.5 * ySlow;

        // 10^(cDb/20) via exp() - una sola llamada trascendente extra.
        outCh[n] = x * Math.exp((makeup - yL) * LN10_OVER_20);

        if (yL > blockPeakGr) blockPeakGr = yL;
      }

      this.yFast[ch] = yFast;
      this.ySlow[ch] = ySlow;
    }

    // Medicion throttled: nunca por bloque, para no inundar el hilo principal.
    if (blockPeakGr > this.peakGr) this.peakGr = blockPeakGr;
    if (++this.blockCount >= METER_BLOCKS) {
      this.blockCount = 0;
      this.port.postMessage(this.peakGr);
      this.peakGr = 0;
    }

    return this.alive;
  }
}

registerProcessor("opto-compressor", OptoCompressorProcessor);
