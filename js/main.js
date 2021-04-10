window.onload = function () { 
    window.frecuencias =  [
        { frecuencia: 32, vol: 0 },
        { frecuencia: 63, vol: 0 },
        { frecuencia: 125, vol: 0 },
        { frecuencia: 250, vol: 0 },
        { frecuencia: 500, vol: 0 },
        { frecuencia: 1000, vol: 0 },
        { frecuencia: 2000, vol: 0 },
        { frecuencia: 4000, vol: 0 },
        { frecuencia: 8000, vol: 0 },
        { frecuencia: 16000, vol: 0 }
    ];
}

window.addEventListener('beforeunload', (e) => {
    localStorage.setItem('lista-frecuencias', JSON.stringify(window.frecuencias));
});

setTimeout(() => {
    const audioELement = document.querySelector('audio');
    const input = document.getElementById('musica');
    // Bajas frecuencias controles 
    const inputFrecuenciaBaja = document.getElementById('frecuenciaBaja');
    const inputGananciaBaja = document.getElementById('gananciaBaja');
    const mostrarFrecuenciaBaja = document.getElementById('verFrecuenciaBaja');
    const mostrarGananciaBaja = document.getElementById('verGananciaBaja');

    // Altas frecuencias controles 
    const inputFrecuenciaAlta = document.getElementById('frecuenciaAlta');
    const mostrarFrecuenciaAlta = document.getElementById('verFrecuenciaAlta');
    const inputGananciaAlta = document.getElementById('gananciaAlta');
    const mostrarGananciaAlta = document.getElementById('verGananciaAlta');
    // container del modal 
    const modal = document.querySelector('.modal-container');
    const close = document.querySelector('.close');
    const open = document.querySelector('.iconEq');
    const btnCerrar = document.querySelector('#btn-cerrar');
    const btnReset = document.querySelector('#btn-reset');
    // funcion para quitar decimales 
    const deleteDecimal = (number, numDecimal = 0) => {
        if (number % 1 == 0) {
            return Number(number);
        } else {
            return Number(number).toFixed(numDecimal);
        }
    }

    // creamos la variable para guardar cada banda del ecualizador 
    window.bands = [];

    /**
     * Funcion que crea las barras de cada frecuencia 
     * definida en el array anterior 
     */
    let createBarraBand = () => {
        let contenedorFrecuencias = document.querySelector(".contenido");
        let html = ``;
        frecuencias.forEach((item, i) => {
            html += `
            <div class="bar">
                <span style="text-align: center; width: 80px; position: relative;left: -13px;" id="span-vol-${i + 1}">Vol: ${deleteDecimal(item.vol, 2)}</span>
                <input 
                    type="range" 
                    min="-30" 
                    max="30" 
                    step="0.00001" 
                    class="range-vertical"
                    value=${item.vol}
                    id="band-${i + 1}"
                >
                <span>${item.frecuencia}Hz</span>
              </div>
        `;
        });
        contenedorFrecuencias.innerHTML = html;
    }
    createBarraBand();

    // frecuencias bajas 
    frecuenciaBaja;
    if (localStorage.getItem('frecuenciaBaja')) {
        window.frecuenciaBaja = localStorage.getItem('frecuenciaBaja');
        inputFrecuenciaBaja.value = localStorage.getItem('frecuenciaBaja');
    } else {
        window.frecuenciaBaja = 85;
        inputFrecuenciaBaja.value = 85;
    }

    // ganancia de frecuencias bajas 
    gananciaBaja;
    if (localStorage.getItem('gananciaBaja')) {
        window.gananciaBaja = localStorage.getItem('gananciaBaja');
        inputGananciaBaja.value = localStorage.getItem('gananciaBaja');
    } else {
        gananciaBaja = 1;
        inputFrecuenciaBaja.value = 1;
    }

    // Frecuencias Altas
    frecuenciaAlta;
    if (localStorage.getItem('frecuenciaAlta')) {
        window.frecuenciaAlta = localStorage.getItem('frecuenciaAlta');
        inputFrecuenciaAlta.value = localStorage.getItem('frecuenciaAlta');
    } else {
        window.frecuenciaAlta = 300;
        inputFrecuenciaAlta.value = 300;
    }

    // Ganancia de frecuencias altas
    gananciaAlta;
    if (localStorage.getItem('gananciaAlta')) {
        window.gananciaAlta = localStorage.getItem('gananciaAlta');
        inputGananciaAlta.value = localStorage.getItem('gananciaAlta');
    } else {
        gananciaAlta = 1;
        inputGananciaAlta.value = 1;
    }

    // mostrar el modal 
    open.addEventListener('click', (e) => {
        modal.style.display = 'block';
    });

    // cerrar el modal desde la "X"
    close.addEventListener('click', (e) => { 
        modal.style.display = 'none';
    });

    // cerrar modal desde el boton de cerrar
    btnCerrar.addEventListener('click', (e) => {
        modal.style.display = 'none';
    });

    // resetear todo el ecualizador 
    btnReset.addEventListener('click', (e) => {
        window.frecuencias.forEach((item, i) => {
            window.bands[i] ? window.bands[i].gain.value = 0 : null; // reiniciando el filtro por frecuencia 
            window.frecuencias[i].vol = 0; // modificando el objeto 
            document.getElementById(`band-${i + 1}`).value = 0; // modificando el input para reflejar el cambio 
            document.getElementById(`span-vol-${i + 1}`).innerText = `Vol: 0`; // modificando el span para reflejar que cambio el volumen 
        });
    });

    input.addEventListener('change', (e) => {
        audioELement.src = URL.createObjectURL(e.target.files[0]);
    });

    inputFrecuenciaBaja.addEventListener('change', (e) => {
        try {
            window.frecuenciaBaja = e.target.value;
            localStorage.setItem('frecuenciaBaja', window.frecuenciaBaja);
            mostrarFrecuenciaBaja.innerText = deleteDecimal(window.frecuenciaBaja);
            window.lowPassFilter.frequency.value = window.frecuenciaBaja;
        } catch (error) {
            console.log(error);
        }
    });

    inputFrecuenciaAlta.addEventListener('change', (e) => {
        try {
            window.frecuenciaAlta = e.target.value;
            localStorage.setItem('frecuenciaAlta', window.frecuenciaAlta);
            mostrarFrecuenciaAlta.innerText = deleteDecimal(window.frecuenciaAlta);
            window.hightPassFilter.frequency.value = window.frecuenciaAlta;
        } catch (error) {
            console.log(error);
        }
    });

    inputGananciaBaja.addEventListener('change', (e) => {
        try {
            window.gananciaBaja = e.target.value;
            localStorage.setItem('gananciaBaja', window.gananciaBaja);
            mostrarGananciaBaja.innerText = deleteDecimal(window.gananciaBaja, 2);
            window.gainLow.gain.value = window.gananciaBaja;
        } catch (error) {
            console.log(error);
        }
    });

    inputGananciaAlta.addEventListener('change', (e) => {
        try {
            window.gananciaAlta = e.target.value;
            localStorage.setItem('gananciaAlta', window.gananciaAlta);
            mostrarGananciaAlta.innerText = deleteDecimal(window.gananciaAlta, 2);
            window.gainHight.gain.value = window.gananciaAlta;
        } catch (error) {
            console.log(error);
        }
    });

    // controlando los inputs del ecualizador 
    window.frecuencias.map((item, index) => {
        document.getElementById(`band-${index + 1}`)
        .addEventListener('change', function(e) {
            let old = [... window.frecuencias];
            old[index].vol = e.target.value;
            window.frecuencias = [...old];
            document.getElementById(`span-vol-${index + 1}`).innerText = `Vol: ${deleteDecimal(frecuencias[index].vol, 2)}`;
            window.bands[index] ? window.bands[index].gain.value = e.target.value : null;
        });
    })


    mostrarFrecuenciaAlta.innerText = deleteDecimal(window.frecuenciaAlta);
    mostrarFrecuenciaBaja.innerText = deleteDecimal(window.frecuenciaBaja);
    mostrarGananciaBaja.innerText = deleteDecimal(window.gananciaBaja, 2);
    mostrarGananciaAlta.innerText = deleteDecimal(window.gananciaAlta, 2);

    audioELement.addEventListener('play', () => {
        const Context = window.webkitAudioContext ? window.webkitAudioContext : window.AudioContext;
        ctx = new Context();
        const mediaElement = ctx.createMediaElementSource(audioELement);

        window.frecuencias.forEach((item, index) => {
            window.bands[index] = ctx.createBiquadFilter();
            window.bands[index].type = 'peaking'; // 5 || 'peaking'
            window.bands[index].frequency.value = item.frecuencia;
            window.bands[index].Q.value = 1.4;
            window.bands[index].gain.value = item.vol;
        })

        // filtro pasa bajo 
        lowPassFilter = ctx.createBiquadFilter();
        lowPassFilter.frequency.value = window.frecuenciaBaja;

        // filtro pasa alto
        hightPassFilter = ctx.createBiquadFilter();
        hightPassFilter.type = 'highpass';
        hightPassFilter.frequency.value = window.frecuenciaAlta;

        // ganacia por canal 
        gainLow = ctx.createGain();
        window.gainLow.gain.value = window.gananciaBaja;

        gainHight = ctx.createGain();
        window.gainHight.gain.value = window.gananciaAlta;
        // separar los canales 
        let spliter = ctx.createChannelSplitter(2);

        // unir los canales 
        let merger = ctx.createChannelMerger(2);

        gainLow.connect(lowPassFilter);
        gainHight.connect(hightPassFilter);
       
        for (i = 1; i < 10; i ++) {
            window.bands[i-1].connect(window.bands[i]);
        }

        mediaElement.connect(window.bands[0]);
        // asignando los filtros a cada canal 
        window.bands[9].connect(spliter);
        spliter.connect(gainLow, 0);
        spliter.connect(gainHight, 1);

        lowPassFilter.connect(merger, 0, 0);
        hightPassFilter.connect(merger, 0, 1);

        merger.connect(ctx.destination);
        
    });


}, 1000);

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker
            .register("/serviceWorker.js")
            .then(res => console.log("service worker registered"))
            .catch(err => console.log("service worker not registered", err));
    });
}