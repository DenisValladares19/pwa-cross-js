/**
 * Refuerzo de graves por compresion paralela dependiente de frecuencia.
 *
 * La banda baja se aisla con un pasa-bajos sintonizable, se lleva a un
 * compresor optico y se remezcla a bajo nivel con la senal seca. Al reducir
 * el factor de cresta de los graves antes de sumarlos, sube el RMS (mas
 * cuerpo y sustain) sin apenas mover el pico de salida - a diferencia de un
 * EQ, que sube ambos por igual.
 *
 * Ruta de armonicos opcional y separada: genera 2o-5o armonico de la
 * fundamental para explotar el efecto psicoacustico de fundamental ausente
 * (traduccion en altavoces pequenos). No forma parte de la compresion.
 */

const BB_SMOOTH = 0.005; // constante de tiempo del suavizado de parametros
const BB_MIX_MAX = 0.3; // tope del blend: a fondo el pico sube <2 dB
const BB_HARM_MAX = 0.35;
const BB_CURVE_SIZE = 8192;
// Suelo de la ventana de entrada al generador de armonicos. Deliberadamente
// por debajo del low-cut de salida: el contenido de 25-40 Hz no llega a los
// altavoces, pero su 2o y 3er armonico si, y ahi es donde se vuelve audible.
// Medido con fundamental sola, tras el low-cut de 41 Hz: bajar este suelo de
// 40 a 25 sube el 2o armonico +16.4 dB para una nota de 25 Hz y +7.0 dB para
// una de 32. Por debajo de 25 Hz ya no hay musica, solo retumbe y ruido de
// micro, y deformar ruido reparte ruido por toda la banda de graves.
const BB_HARM_FLOOR = 25;
// Nivel de entrada al distorsionador. Medido: por encima de ~0.6 la senal
// alcanza los extremos de la curva, el tanh de redondeo entra en juego y
// aparecen 4o, 5o, 7o y 8o armonicos - eso es lo que se oye como saturacion.
const BB_HARM_DRIVE = 0.5;

// Voicing tipo leveler optico: ratio suave y knee ancho.
const BB_THRESHOLD = -6;
const BB_RATIO = 3;
const BB_KNEE = 12;
// M = (1 - 1/R) * |T| devuelve la banda comprimida a nivel util; sin makeup el
// compresor la deja tan por debajo del seco que la mezcla no se oye. El umbral
// alto es intencionado: DRIVE es quien empuja la senal contra el, como en el
// hardware. Un umbral bajo mantiene la reduccion clavada al maximo y entonces
// el procesador deja de comprimir y se limita a duplicar el grave.
const BB_MAKEUP = (1 - 1 / BB_RATIO) * Math.abs(BB_THRESHOLD);

const dbToLin = (db) => Math.pow(10, db / 20);

/**
 * Curva de transferencia asimetrica.
 *
 * Es un polinomio de grado 4, no un tanh con ganancia: sobre una sinusoide un
 * polinomio de grado N genera exactamente hasta el armonico N y ni uno mas.
 * Asi salen 2o, 3o y 4o - los que la literatura psicoacustica pide para la
 * fundamental ausente - sin la serie impar interminable que produce el
 * recorte suave y que es lo que se oye como saturacion.
 *
 * El tanh final solo redondea los extremos para que la curva no tenga
 * pendiente creciente en +-1 (sin discontinuidades de primera derivada, sin
 * clicks); con coeficientes pequenos apenas anade orden.
 */
function createAsymmetricCurve() {
  const curve = new Float32Array(BB_CURVE_SIZE);
  const norm = Math.tanh(0.55 + 0.35 + 0.25 + 0.1);
  for (let i = 0; i < BB_CURVE_SIZE; i++) {
    const x = (i * 2) / (BB_CURVE_SIZE - 1) - 1;
    const x2 = x * x;
    const raw = 0.55 * x + 0.35 * x2 + 0.25 * x2 * x + 0.1 * x2 * x2;
    curve[i] = Math.tanh(raw) / norm;
  }
  return curve;
}

/**
 * Carga el modulo del worklet. La URL se parametriza porque en una extension
 * el archivo se sirve desde chrome-extension:// y no desde el origen de la
 * pagina; el resto del modulo es identico en la PWA y en la extension.
 */
async function loadBigBottomWorklet(ctx, url = "./js/worklets/opto-compressor.js") {
  await ctx.audioWorklet.addModule(url);
}

/**
 * Construye el grafo y devuelve su interfaz de control.
 * @param {AudioContext} ctx
 * @param {Object} opts valores iniciales {tune, drive, mix, harmonics, enabled}
 */
function createBigBottom(ctx, opts = {}) {
  const tune = opts.tune ?? 80;
  const drive = opts.drive ?? 6;
  const mix = opts.mix ?? 35;
  const harmonics = opts.harmonics ?? 0;
  let enabled = opts.enabled ?? false;

  const input = ctx.createGain();
  const output = ctx.createGain();

  // --- Via seca ---
  input.connect(output);

  // --- Via de compresion: LPF(TUNE) -> drive -> opto -> allpass -> mix ---
  const lpf = createFilter({
    ctx,
    filterType: "LR",
    frequency: tune,
    slope: 24,
    type: "lowpass",
  });

  const driveGain = ctx.createGain();
  driveGain.gain.setValueAtTime(dbToLin(drive), ctx.currentTime);

  // Si el modulo del worklet no llego a registrarse, la via de compresion se
  // queda muda y el resto de la cadena sigue funcionando (mejor eso que un
  // grafo roto y silencio total).
  let comp = null;
  try {
    // Sin outputChannelCount: el nodo sigue el numero de canales de su
    // entrada. Fijarlo a 2 hacia que con una fuente mono la salida estereo se
    // mezclase de vuelta a un canal y la aportacion cayera unos 7 dB.
    comp = new AudioWorkletNode(ctx, "opto-compressor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    });
  } catch (error) {
    console.log("compresor optico no disponible", error);
  }

  if (comp) {
    const now = ctx.currentTime;
    comp.parameters.get("threshold").setValueAtTime(BB_THRESHOLD, now);
    comp.parameters.get("ratio").setValueAtTime(BB_RATIO, now);
    comp.parameters.get("knee").setValueAtTime(BB_KNEE, now);
    comp.parameters.get("makeup").setValueAtTime(BB_MAKEUP, now);
  }

  // Compensa el desfase que el pasa-bajos introduce antes de sumar con el seco.
  const align = ctx.createBiquadFilter();
  align.type = "allpass";
  align.frequency.setValueAtTime(tune, ctx.currentTime);
  align.Q.setValueAtTime(0.5, ctx.currentTime);

  const mixGain = ctx.createGain();
  mixGain.gain.setValueAtTime(0, ctx.currentTime);

  input.connect(lpf.input);
  lpf.output.connect(driveGain);
  if (comp) {
    driveGain.connect(comp);
    comp.connect(align);
  }
  align.connect(mixGain);
  mixGain.connect(output);

  // --- Via de armonicos (exciter psicoacustico), independiente ---
  // Banda estrecha de entrada: distorsionar solo la fundamental evita
  // intermodulacion con el resto del espectro.
  // Pasa-bajos de 24 dB/oct: con la pendiente suave de antes se colaba medio
  // espectro en el distorsionador y lo que salia era intermodulacion, no
  // armonicos de la fundamental.
  const harmLow = createFilter({
    ctx,
    filterType: "LR",
    frequency: tune,
    slope: 24,
    type: "lowpass",
  });

  const harmSub = ctx.createBiquadFilter();
  harmSub.type = "highpass";
  harmSub.frequency.setValueAtTime(BB_HARM_FLOOR, ctx.currentTime);
  harmSub.Q.setValueAtTime(Math.SQRT1_2, ctx.currentTime);

  // Sin nivelador a proposito: uno delante de la curva atenua los pasajes
  // fuertes y deja pasar los flojos, con lo que la proporcion de armonicos
  // sube justo cuando el bajo baja y estos se comen la nota. Con drive fijo el
  // 2o armonico sigue al nivel del bajo, que es como se comporta el analogico.
  const harmPre = ctx.createGain();
  harmPre.gain.setValueAtTime(BB_HARM_DRIVE, ctx.currentTime);

  const shaper = ctx.createWaveShaper();
  shaper.curve = createAsymmetricCurve();
  shaper.oversample = "4x";

  // Techo de orden: recorta lo que quede por encima del 5o armonico.
  const harmTop = createFilter({
    ctx,
    filterType: "LR",
    frequency: Math.min(tune * 6, 1200),
    slope: 24,
    type: "lowpass",
  });

  // Quita el fundamental duplicado: solo pasan los armonicos generados.
  const harmHpf = createFilter({
    ctx,
    filterType: "LR",
    frequency: tune,
    slope: 24,
    type: "highpass",
  });

  const harmGain = ctx.createGain();
  harmGain.gain.setValueAtTime(0, ctx.currentTime);

  input.connect(harmLow.input);
  harmLow.output.connect(harmSub);
  harmSub.connect(harmPre);
  harmPre.connect(shaper);
  shaper.connect(harmTop.input);
  harmTop.output.connect(harmHpf.input);
  harmHpf.output.connect(harmGain);
  harmGain.connect(output);

  // --- Estado de UI ---
  let currentMix = mix;
  let currentHarmonics = harmonics;

  const ramp = (param, value) =>
    param.setTargetAtTime(value, ctx.currentTime, BB_SMOOTH);

  const applyBlend = () => {
    ramp(mixGain.gain, enabled && comp ? (currentMix / 100) * BB_MIX_MAX : 0);
    ramp(harmGain.gain, enabled ? (currentHarmonics / 100) * BB_HARM_MAX : 0);
  };

  applyBlend();

  return {
    input,
    output,

    setTune(hz) {
      const f = Number(hz);
      lpf.filters.forEach((filter) => ramp(filter.frequency, f));
      harmLow.filters.forEach((filter) => ramp(filter.frequency, f));
      harmHpf.filters.forEach((filter) => ramp(filter.frequency, f));
      harmTop.filters.forEach((filter) => ramp(filter.frequency, Math.min(f * 6, 1200)));
      ramp(align.frequency, f);
    },

    setDrive(db) {
      ramp(driveGain.gain, dbToLin(Number(db)));
    },

    setMix(pct) {
      currentMix = Number(pct);
      applyBlend();
    },

    setHarmonics(pct) {
      currentHarmonics = Number(pct);
      applyBlend();
    },

    setEnabled(value) {
      enabled = !!value;
      applyBlend();
    },

    /** Recibe la reduccion de ganancia en dB, ya limitada en el worklet. */
    onMeter(callback) {
      if (comp) comp.port.onmessage = (event) => callback(event.data);
    },
  };
}

window.loadBigBottomWorklet = loadBigBottomWorklet;
window.createBigBottom = createBigBottom;
