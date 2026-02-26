let frecuencias = [
  { frecuencia: 20, vol: 0 },
  { frecuencia: 25, vol: 0 },
  { frecuencia: 31.5, vol: 0 },
  { frecuencia: 40, vol: 0 },
  { frecuencia: 50, vol: 0 },
  { frecuencia: 63, vol: 0 },
  { frecuencia: 80, vol: 0 },
  { frecuencia: 100, vol: 0 },
  { frecuencia: 125, vol: 0 },
  { frecuencia: 160, vol: 0 },
  { frecuencia: 200, vol: 0 },
  { frecuencia: 250, vol: 0 },
  { frecuencia: 315, vol: 0 },
  { frecuencia: 400, vol: 0 },
  { frecuencia: 500, vol: 0 },
  { frecuencia: 630, vol: 0 },
  { frecuencia: 800, vol: 0 },
  { frecuencia: 1000, vol: 0 },
  { frecuencia: 1250, vol: 0 },
  { frecuencia: 1600, vol: 0 },
  { frecuencia: 2000, vol: 0 },
  { frecuencia: 2500, vol: 0 },
  { frecuencia: 3150, vol: 0 },
  { frecuencia: 4000, vol: 0 },
  { frecuencia: 5000, vol: 0 },
  { frecuencia: 6300, vol: 0 },
  { frecuencia: 8000, vol: 0 },
  { frecuencia: 10000, vol: 0 },
  { frecuencia: 12500, vol: 0 },
  { frecuencia: 16000, vol: 0 },
  { frecuencia: 20000, vol: 0 },
];

// Función para crear el módulo BBE Low Contour
function createBBELowNode(ctx, inputNode, options = {}) {
  const lowContourGain = options.lowContourGain || 0;
  const bassBoostGain = options.bassBoostGain || 0;
  const isEnabled = options.enabled !== undefined ? options.enabled : true;
  const frequency = 80; // Hz

  // Crear nodos internos
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.707;

  const lowContourGainNode = ctx.createGain();
  // Al ser paralelo, sumamos el efecto al original
  lowContourGainNode.gain.value = isEnabled
    ? Math.pow(10, lowContourGain / 20) - 1
    : 0;

  const merger = ctx.createGain(); // Sumador final del módulo

  // Extra Bass Boost para tono más profundo
  const bassBoostFilter = ctx.createBiquadFilter();
  bassBoostFilter.type = "lowpass";
  bassBoostFilter.frequency.value = 50; // Hz para profundidad sub
  bassBoostFilter.Q.value = 0.707;

  const bassBoostGainNode = ctx.createGain();
  bassBoostGainNode.gain.value = isEnabled
    ? Math.pow(10, bassBoostGain / 20) - 1
    : 0;

  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = 0.001; // 1ms

  // Arquitectura:
  // input -> dry path -> merger
  // input -> filter -> lowContourGainNode -> merger
  // input -> bassBoostFilter -> bassBoostGainNode -> merger
  // merger -> delay
  inputNode.connect(merger);
  inputNode.connect(filter);
  filter.connect(lowContourGainNode);
  lowContourGainNode.connect(merger);

  inputNode.connect(bassBoostFilter);
  bassBoostFilter.connect(bassBoostGainNode);
  bassBoostGainNode.connect(merger);

  merger.connect(delay);

  return {
    output: delay,
    lowContourGainNode: lowContourGainNode,
    bassBoostGainNode: bassBoostGainNode,
  };
}

// Función para crear el módulo BBE Process (Claridad)
function createBBEProcessNode(ctx, inputNode, options = {}) {
  const processGain = options.processGain || 0;
  const isEnabled = options.enabled !== undefined ? options.enabled : true;
  const frequency = 4500; // Hz (entre 3kHz y 5kHz)

  // Crear nodos internos
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.707;

  const processGainNode = ctx.createGain();
  // Convertir dB a ganancia lineal
  processGainNode.gain.value = isEnabled
    ? Math.pow(10, processGain / 20) - 1
    : 0;

  const merger = ctx.createGain(); // Sumador final del módulo

  // Arquitectura:
  // input -> dry path -> merger
  // input -> filter -> processGainNode -> merger
  inputNode.connect(merger);
  inputNode.connect(filter);
  filter.connect(processGainNode);
  processGainNode.connect(merger);

  return {
    output: merger,
    processGainNode: processGainNode,
  };
}

// Función para crear filtros LR o Butterworth parametrizables
function createFilter({
  type = "highpass", // "highpass" o "lowpass"
  frequency = 1000, // Frecuencia de corte (Hz)
  slope = 24, // Pendiente (24, 48 dB/octava)
  filterType = "LR", // "LR" (Linkwitz-Riley) o "butterworth",
  ctx,
}) {
  const stages = slope / 12; // Etapas necesarias (2 para 24 dB, 4 para 48 dB)
  const filters = [];

  // Configurar Q según el tipo de filtro
  const Q = filterType === "LR" ? 0.5 : 0.7071; // Q para LR o Butterworth

  // Crear y configurar cada etapa
  for (let i = 0; i < stages; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = Q;
    filters.push(filter);
  }

  // Conectar en serie
  filters.reduce((prev, curr) => prev.connect(curr));

  return {
    input: filters[0],
    output: filters[filters.length - 1],
    filters: filters, // Opcional: acceso a cada etapa
  };
}

// Create filters
let hightFilter;

let lowFilter;

window.frecuencias = frecuencias.map((item) => {
  let oldObj = { ...item };
  let local = localStorage.getItem(`vol-frecuencia-${oldObj.frecuencia}`);
  if (local === null || local === "") {
    localStorage.setItem(`vol-frecuencia-${oldObj.frecuencia}`, oldObj.vol);
  } else {
    oldObj.vol = local;
  }
  return oldObj;
});

let listSongs = [];
let songActive;

/**
 * Funcion para quitar o mostrar decimales de un
 * numero pasado por parametros
 * @param {Number} number
 * @param {Number} numDecimal numero de decimales que desea mostrar
 * @returns Number
 */
const deleteDecimal = (number, numDecimal = 0) => {
  if (number % 1 == 0) {
    return Number(number);
  } else {
    return Number(number).toFixed(numDecimal);
  }
};

/**
 * Funcion que crea las barras de cada frecuencia
 * definida en el array anterior
 */
let createBarraBand = () => {
  let contenedorFrecuencias = document.querySelector(".contenido");
  let html = ``;
  window.frecuencias.forEach((item, i) => {
    html += `
        <div class="bar">
            <span style="text-align: center; width: 80px; position: relative;left: -13px;" id="span-vol-${
              i + 1
            }">Vol: ${deleteDecimal(item.vol, 2)}</span>
            <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.00001" 
                class="range-vertical"
                value=${item.vol}
                id="band-${i + 1}"
            >
            <span style="font-size: 12px;">${item.frecuencia}Hz</span>
          </div>
    `;
  });
  contenedorFrecuencias.innerHTML = html;
};

const copyright = document.querySelector(".copyright");
copyright.innerHTML = `&copy; DENIS VALLADARES 2021 - ${new Date().getFullYear()}`;

setTimeout(() => {
  const audioELement = document.querySelector("audio");
  const input = document.getElementById("musica");
  const btnAdd = document.getElementById("btn-add");

  // Bajas frecuencias controles
  const inputFrecuenciaBaja = document.getElementById("frecuenciaBaja");
  const inputGananciaBaja = document.getElementById("gananciaBaja");
  const mostrarFrecuenciaBaja = document.getElementById("verFrecuenciaBaja");
  const mostrarGananciaBaja = document.getElementById("verGananciaBaja");

  // Altas frecuencias controles
  const inputFrecuenciaAlta = document.getElementById("frecuenciaAlta");
  const mostrarFrecuenciaAlta = document.getElementById("verFrecuenciaAlta");
  const inputGananciaAlta = document.getElementById("gananciaAlta");
  const mostrarGananciaAlta = document.getElementById("verGananciaAlta");
  // container del modal
  const modal = document.querySelector(".modal-container");
  const close = document.querySelector(".close");
  const open = document.querySelector(".iconEq");
  const btnCerrar = document.querySelector("#btn-cerrar");
  const btnReset = document.querySelector("#btn-reset");

  // BBE Controles UI
  const inputBbeLowContour = document.getElementById("bbeLowContour");
  const inputBbeBassBoost = document.getElementById("bbeBassBoost");
  const inputBbeProcess = document.getElementById("bbeProcess");
  const checkBbeLow = document.getElementById("enableBBELow");
  const checkBbeProcess = document.getElementById("enableBBEProcess");

  const verBbeLowContour = document.getElementById("verBbeLowContour");
  const verBbeBassBoost = document.getElementById("verBbeBassBoost");
  const verBbeProcess = document.getElementById("verBbeProcess");

  // Inicialización de parámetros BBE
  window.bbeParams = {
    lowContour: parseFloat(localStorage.getItem("bbeLowContour")) || 4,
    bassBoost: parseFloat(localStorage.getItem("bbeBassBoost")) || 4,
    process: parseFloat(localStorage.getItem("bbeProcess")) || 3,
    lowEnabled: localStorage.getItem("bbeLowEnabled") !== "false",
    processEnabled: localStorage.getItem("bbeProcessEnabled") !== "false",
  };

  const updateBBEUI = () => {
    inputBbeLowContour.value = window.bbeParams.lowContour;
    inputBbeBassBoost.value = window.bbeParams.bassBoost;
    inputBbeProcess.value = window.bbeParams.process;
    checkBbeLow.checked = window.bbeParams.lowEnabled;
    checkBbeProcess.checked = window.bbeParams.processEnabled;

    verBbeLowContour.innerText = window.bbeParams.lowContour.toFixed(1);
    verBbeBassBoost.innerText = window.bbeParams.bassBoost.toFixed(1);
    verBbeProcess.innerText = window.bbeParams.process.toFixed(1);
  };

  updateBBEUI();

  // Event Listeners para BBE
  inputBbeLowContour.addEventListener("input", (e) => {
    window.bbeParams.lowContour = parseFloat(e.target.value);
    verBbeLowContour.innerText = window.bbeParams.lowContour.toFixed(1);
    localStorage.setItem("bbeLowContour", window.bbeParams.lowContour);
    if (window.bbeLowNode && window.bbeParams.lowEnabled) {
      window.bbeLowNode.lowContourGainNode.gain.value =
        Math.pow(10, window.bbeParams.lowContour / 20) - 1;
    }
  });

  inputBbeBassBoost.addEventListener("input", (e) => {
    window.bbeParams.bassBoost = parseFloat(e.target.value);
    verBbeBassBoost.innerText = window.bbeParams.bassBoost.toFixed(1);
    localStorage.setItem("bbeBassBoost", window.bbeParams.bassBoost);
    if (window.bbeLowNode && window.bbeParams.lowEnabled) {
      window.bbeLowNode.bassBoostGainNode.gain.value =
        Math.pow(10, window.bbeParams.bassBoost / 20) - 1;
    }
  });

  inputBbeProcess.addEventListener("input", (e) => {
    window.bbeParams.process = parseFloat(e.target.value);
    verBbeProcess.innerText = window.bbeParams.process.toFixed(1);
    localStorage.setItem("bbeProcess", window.bbeParams.process);
    if (window.bbeProcessNode && window.bbeParams.processEnabled) {
      window.bbeProcessNode.processGainNode.gain.value =
        Math.pow(10, window.bbeParams.process / 20) - 1;
    }
  });

  checkBbeLow.addEventListener("change", (e) => {
    window.bbeParams.lowEnabled = e.target.checked;
    localStorage.setItem("bbeLowEnabled", window.bbeParams.lowEnabled);
    if (window.bbeLowNode) {
      const gLow = window.bbeParams.lowEnabled
        ? Math.pow(10, window.bbeParams.lowContour / 20) - 1
        : 0;
      const gBass = window.bbeParams.lowEnabled
        ? Math.pow(10, window.bbeParams.bassBoost / 20) - 1
        : 0;
      window.bbeLowNode.lowContourGainNode.gain.value = gLow;
      window.bbeLowNode.bassBoostGainNode.gain.value = gBass;
    }
  });

  checkBbeProcess.addEventListener("change", (e) => {
    window.bbeParams.processEnabled = e.target.checked;
    localStorage.setItem("bbeProcessEnabled", window.bbeParams.processEnabled);
    if (window.bbeProcessNode) {
      const g = window.bbeParams.processEnabled
        ? Math.pow(10, window.bbeParams.process / 20) - 1
        : 0;
      window.bbeProcessNode.processGainNode.gain.value = g;
    }
  });

  // creamos la variable para guardar cada banda del ecualizador
  window.bands = [];

  createBarraBand();

  const createListSongs = (list) => {
    const containerSongs = document.getElementById("container-songs");
    containerSongs.innerHTML = "";

    list.forEach((item) => {
      const el = document.createElement("div");
      el.className = item.active ? "item-song active" : "item-song";
      el.innerHTML = item.active ? "&sung; " + item.file.name : item.file.name;
      el.dataset.id = item.uid;
      el.appendChild(createElementDelete(item));

      el.onclick = (e) => {
        let old = [...list];
        old = listSongs.map((s) => {
          return {
            ...s,
            active: s.uid === item.uid,
          };
        });
        listSongs = [...old];
        audioELement.src = item.baseUrl;
        audioELement.play();
        songActive = item;
        createListSongs(listSongs);
      };

      containerSongs.appendChild(el);
    });
  };

  const createElementDelete = (item) => {
    const span = document.createElement("span");

    span.innerText = "X";
    span.className = "delete-item";
    span.onclick = (e) => {
      e.stopPropagation();
      const old = listSongs.filter((s) => s.uid !== item.uid);
      listSongs = [...old];
      createListSongs(listSongs);
      if (songActive.uid === item.uid) {
        audioELement.pause();
        audioELement.src = undefined;
      }
    };

    return span;
  };

  audioELement.onended = () => {
    const el = document.querySelector(".item-song.active");
    const uid = el.dataset.id;

    const index = listSongs.findIndex((item) => item.uid === uid);

    if (!listSongs[index + 1]) return;

    const next = listSongs[index + 1];

    let old = [...listSongs];
    old = listSongs.map((s) => {
      return {
        ...s,
        active: s.uid === next.uid,
      };
    });
    listSongs = [...old];
    audioELement.src = next.baseUrl;
    audioELement.play();
    createListSongs(listSongs);
  };

  // frecuencias bajas
  frecuenciaBaja;
  if (localStorage.getItem("frecuenciaBaja")) {
    window.frecuenciaBaja = localStorage.getItem("frecuenciaBaja");
    inputFrecuenciaBaja.value = localStorage.getItem("frecuenciaBaja");
  } else {
    window.frecuenciaBaja = 85;
    inputFrecuenciaBaja.value = 85;
  }

  // ganancia de frecuencias bajas
  gananciaBaja;
  if (localStorage.getItem("gananciaBaja")) {
    window.gananciaBaja = localStorage.getItem("gananciaBaja");
    inputGananciaBaja.value = localStorage.getItem("gananciaBaja");
  } else {
    gananciaBaja = 1;
    inputFrecuenciaBaja.value = 1;
  }

  // Frecuencias Altas
  frecuenciaAlta;
  if (localStorage.getItem("frecuenciaAlta")) {
    window.frecuenciaAlta = localStorage.getItem("frecuenciaAlta");
    inputFrecuenciaAlta.value = localStorage.getItem("frecuenciaAlta");
  } else {
    window.frecuenciaAlta = 300;
    inputFrecuenciaAlta.value = 300;
  }

  // Ganancia de frecuencias altas
  gananciaAlta;
  if (localStorage.getItem("gananciaAlta")) {
    window.gananciaAlta = localStorage.getItem("gananciaAlta");
    inputGananciaAlta.value = localStorage.getItem("gananciaAlta");
  } else {
    gananciaAlta = 1;
    inputGananciaAlta.value = 1;
  }

  // mostrar el modal
  open.addEventListener("click", (e) => {
    modal.style.display = "block";
  });

  // cerrar el modal desde la "X"
  close.addEventListener("click", (e) => {
    modal.style.display = "none";
  });

  // cerrar modal desde el boton de cerrar
  btnCerrar.addEventListener("click", (e) => {
    modal.style.display = "none";
  });

  // resetear todo el ecualizador
  btnReset.addEventListener("click", (e) => {
    window.frecuencias.forEach((item, i) => {
      window.bands[i] ? (window.bands[i].gain.value = 0) : null; // reiniciando el filtro por frecuencia
      window.frecuencias[i].vol = 0; // modificando el objeto
      document.getElementById(`band-${i + 1}`).value = 0; // modificando el input para reflejar el cambio
      document.getElementById(`span-vol-${i + 1}`).innerText = `Vol: 0`; // modificando el span para reflejar que cambio el volumen
    });
  });

  btnAdd.addEventListener("click", () => {
    input.click();
  });

  input.addEventListener("change", (e) => {
    if (!e.target.files) return;
    for (let i = 0; i < e.target.files.length; i++) {
      const file = e.target.files[i];
      const obj = {
        file,
        baseUrl: URL.createObjectURL(file),
        uid: crypto.randomUUID(),
        active: false,
      };

      listSongs = [...listSongs, obj];
    }

    createListSongs(listSongs);
  });

  inputFrecuenciaBaja.addEventListener("change", (e) => {
    try {
      window.frecuenciaBaja = e.target.value;
      localStorage.setItem("frecuenciaBaja", window.frecuenciaBaja);
      mostrarFrecuenciaBaja.innerText = deleteDecimal(window.frecuenciaBaja);
      // window.lowPassFilter.frequency.value = window.frecuenciaBaja;
      lowFilter?.filters?.forEach(
        (filter) => (filter.frequency.value = window.frecuenciaBaja)
      );
    } catch (error) {
      console.log(error);
    }
  });

  inputFrecuenciaAlta.addEventListener("change", (e) => {
    try {
      window.frecuenciaAlta = e.target.value;
      localStorage.setItem("frecuenciaAlta", window.frecuenciaAlta);
      mostrarFrecuenciaAlta.innerText = deleteDecimal(window.frecuenciaAlta);
      // window.hightPassFilter.frequency.value = window.frecuenciaAlta;
      hightFilter?.filters?.forEach(
        (filter) => (filter.frequency.value = window.frecuenciaAlta)
      );
    } catch (error) {
      console.log(error);
    }
  });

  inputGananciaBaja.addEventListener("change", (e) => {
    try {
      window.gananciaBaja = e.target.value;
      localStorage.setItem("gananciaBaja", window.gananciaBaja);
      mostrarGananciaBaja.innerText = deleteDecimal(window.gananciaBaja, 2);
      window.gainLow.gain.value = window.gananciaBaja;
    } catch (error) {
      console.log(error);
    }
  });

  inputGananciaAlta.addEventListener("change", (e) => {
    try {
      window.gananciaAlta = e.target.value;
      localStorage.setItem("gananciaAlta", window.gananciaAlta);
      mostrarGananciaAlta.innerText = deleteDecimal(window.gananciaAlta, 2);
      window.gainHight.gain.value = window.gananciaAlta;
    } catch (error) {
      console.log(error);
    }
  });

  // controlando los inputs del ecualizador
  window.frecuencias.map((item, index) => {
    document
      .getElementById(`band-${index + 1}`)
      .addEventListener("change", function (e) {
        let old = [...window.frecuencias];
        old[index].vol = e.target.value;
        window.frecuencias = [...old];
        document.getElementById(
          `span-vol-${index + 1}`
        ).innerText = `Vol: ${deleteDecimal(window.frecuencias[index].vol, 2)}`;
        window.bands[index]
          ? (window.bands[index].gain.value = e.target.value)
          : null;
        localStorage.setItem(
          `vol-frecuencia-${item.frecuencia}`,
          e.target.value
        );
      });
  });

  mostrarFrecuenciaAlta.innerText = deleteDecimal(window.frecuenciaAlta);
  mostrarFrecuenciaBaja.innerText = deleteDecimal(window.frecuenciaBaja);
  mostrarGananciaBaja.innerText = deleteDecimal(window.gananciaBaja, 2);
  mostrarGananciaAlta.innerText = deleteDecimal(window.gananciaAlta, 2);

  audioELement.addEventListener("play", () => {
    const Context = window.webkitAudioContext
      ? window.webkitAudioContext
      : window.AudioContext;
    ctx = new Context();
    const mediaElement = ctx.createMediaElementSource(audioELement);

    window.frecuencias.forEach((item, index) => {
      window.bands[index] = ctx.createBiquadFilter();
      window.bands[index].type = "peaking"; // 5 || 'peaking'
      window.bands[index].frequency.value = item.frecuencia;
      window.bands[index].Q.value = 4.3;
      window.bands[index].gain.value = item.vol;
    });

    // filtro pasa bajo
    lowFilter = createFilter({
      ctx,
      filterType: "LR",
      frequency: frecuenciaBaja,
      slope: 24,
      type: "lowpass",
    });
    // lowPassFilter = ctx.createBiquadFilter();
    // lowPassFilter.frequency.value = window.frecuenciaBaja;
    // lowPassFilter.Q.value = Math.SQRT1_2;

    // filtro pasa alto
    hightFilter = createFilter({
      ctx,
      filterType: "LR",
      frequency: frecuenciaAlta,
      slope: 24,
      type: "highpass",
    });
    // hightPassFilter = ctx.createBiquadFilter();
    // hightPassFilter.type = "highpass";
    // hightPassFilter.frequency.value = window.frecuenciaAlta;
    // hightPassFilter.Q.value = Math.SQRT1_2;

    // ganacia por canal
    gainLow = ctx.createGain();
    window.gainLow.gain.value = window.gananciaBaja;

    gainHight = ctx.createGain();
    window.gainHight.gain.value = window.gananciaAlta;
    // separar los canales
    let splitter = ctx.createChannelSplitter(2);

    // unir los canales
    let merger = ctx.createChannelMerger(2);

    gainLow.connect(lowFilter.input);
    gainHight.connect(hightFilter.input);

    for (i = 1; i < frecuencias.length; i++) {
      window.bands[i - 1].connect(window.bands[i]);
    }

    // crear splitter y merge para poder separar los dos canales L y R
    // para derecha altos
    const splitterRight = ctx.createChannelSplitter(2);
    const mergeRight = ctx.createChannelMerger(2);

    // para izquierda bajos
    const splitterLeft = ctx.createChannelSplitter(2);
    const mergeLeft = ctx.createChannelMerger(2);

    // merge une los dos canales ya en mono
    const merge = ctx.createChannelMerger(2);

    // se conecta los dos separadores de canales al source
    mediaElement.connect(splitterLeft);
    mediaElement.connect(splitterRight);

    // uniendo los dos canales L y R en uno solo que sera R
    splitterRight.connect(mergeRight, 0, 1);
    splitterRight.connect(mergeRight, 0, 1);

    // uniendo los dos canales L y R en uno solo que sera L
    splitterLeft.connect(mergeLeft, 1, 0);
    splitterLeft.connect(mergeLeft, 1, 0);

    // Uniendo los canales L y R antes modificados y
    // dando un canal cada uno final
    mergeLeft.connect(merge, 0, 0);
    mergeRight.connect(merge, 0, 1);

    merge.connect(window.bands[0]);
    // asignando los filtros a cada canal
    window.bands[frecuencias.length - 1].connect(splitter);

    splitter.connect(gainLow, 0);
    splitter.connect(gainHight, 1);

    // Integración del módulo BBE Sonic Maximizer
    // Aplicamos Low Contour y Bass Boost a la banda de bajos
    window.bbeLowNode = createBBELowNode(ctx, lowFilter.output, {
      lowContourGain: window.bbeParams.lowContour,
      bassBoostGain: window.bbeParams.bassBoost,
      enabled: window.bbeParams.lowEnabled,
    });

    // Aplicamos Process (realce de armónicos) a la banda de altos
    window.bbeProcessNode = createBBEProcessNode(ctx, hightFilter.output, {
      processGain: window.bbeParams.process,
      enabled: window.bbeParams.processEnabled,
    });

    window.bbeLowNode.output.connect(merger, 0, 0);
    window.bbeProcessNode.output.connect(merger, 0, 1);

    let lowCutFilter = Array(4)
      .fill()
      .map(() => {
        const lowCut = ctx.createBiquadFilter();
        lowCut.type = "highpass";
        lowCut.frequency.value = getLowCut();
        lowCut.Q.value = 0.5;
        return lowCut;
      });

    merger.connect(lowCutFilter[0]);
    lowCutFilter.forEach((filter, index) => {
      if (index < lowCutFilter.length - 1) {
        filter.connect(lowCutFilter[index + 1]);
      }
    });
    lowCutFilter[lowCutFilter.length - 1].connect(ctx.destination);
  });
}, 1000);

function getLowCut() {
  const lowCut = localStorage.getItem("lowCutFrequency");
  if (isNaN(Number(lowCut))) {
    return 30;
  }
  return Number(lowCut);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/serviceWorker.js")
      .then((res) => console.log("service worker registered"))
      .catch((err) => console.log("service worker not registered", err));
  });
}
