let clienteActual = null;
let tarjetaBuscadaActual = null;

initDB().then(() => {
    renderStock();
});

function switchTab(tab) {
    const secGestion = document.getElementById("section-gestion");
    const secStock = document.getElementById("section-stock");
    const btnGestion = document.getElementById("btn-tab-gestion");
    const btnStock = document.getElementById("btn-tab-stock");

    if (tab === 'gestion') {
        secGestion.classList.remove("hidden");
        secStock.classList.add("hidden");
        btnGestion.classList.add("tab-active");
        btnStock.classList.remove("tab-active");
    } else {
        secGestion.classList.add("hidden");
        secStock.classList.remove("hidden");
        btnGestion.classList.remove("tab-active");
        btnStock.classList.add("tab-active");
        renderStock();
    }
}

async function buscarCliente() {
    const tarjeta = document.getElementById("buscarTarjeta").value;
    const usuario = await getUsuario(tarjeta);

    // Ocultar todo primero
    document.getElementById("noCliente").classList.add("hidden");
    document.getElementById("clienteResumen").classList.add("hidden");
    document.getElementById("clienteAcciones").classList.add("hidden");
    document.getElementById("panelActivacion").classList.add("hidden");

    if (!usuario) {
        showToast("Esta tarjeta no existe en el sistema.", "error");
        document.getElementById("noCliente").classList.remove("hidden");
        return;
    }

    tarjetaBuscadaActual = tarjeta;

    if (!usuario.asignada) {
        // MOSTRAR PANEL DE ACTIVACIÓN con preview
        document.getElementById("panelActivacion").classList.remove("hidden");
        // Cargar número en la preview
        const num = tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');
        document.getElementById("previewNumero").innerText = num;
        document.getElementById("previewNombre").innerText = "NOMBRE CLIENTE";
        document.getElementById("nuevoNombre").value = "";
        document.getElementById("nuevoTel").value = "";
    } else {
        // MOSTRAR GESTIÓN DE PUNTOS
        clienteActual = usuario;
        document.getElementById("clienteResumen").classList.remove("hidden");
        document.getElementById("clienteAcciones").classList.remove("hidden");
        renderCliente();
    }
}

function actualizarPreviewTarjeta() {
    const nombre = document.getElementById("nuevoNombre").value.trim();
    const preview = document.getElementById("previewNombre");
    if (preview) preview.innerText = nombre ? nombre.toUpperCase() : "NOMBRE CLIENTE";
}

async function activarTarjeta() {
    const nombre = document.getElementById("nuevoNombre").value;
    const tel = document.getElementById("nuevoTel").value;

    if (!nombre || !tel) {
        showToast("Completá el nombre y teléfono del cliente.", "warn");
        return;
    }

    const index = usuarios.findIndex(u => u.tarjeta === tarjetaBuscadaActual);
    
    usuarios[index] = {
        ...usuarios[index],
        asignada: true,
        nombre: nombre,
        telefono: tel,
        puntos: 100, // Bono de bienvenida
        historial: [{ fecha: new Date().toISOString().split('T')[0], descripcion: "Bono Bienvenida", puntos: 100 }]
    };

    await updateUsuario(usuarios[index]);
    showToast("¡Tarjeta activada con éxito!", "success");
    
    // Limpiar y recargar vista
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoTel").value = "";
    buscarCliente();
}

// En la función renderCliente del admin.js, agregalo debajo del nombre:
function renderCliente() {
    document.getElementById("adminNombre").innerText = clienteActual.nombre;
    document.getElementById("adminPuntos").innerText = clienteActual.puntos.toLocaleString();
    
    // Agregamos esto para ver el teléfono en el panel de gestión
    const infoExtra = `<p class="text-[10px] text-slate-500 font-bold mt-2 uppercase">Contacto: ${clienteActual.telefono}</p>`;
    document.getElementById("adminNombre").insertAdjacentHTML('afterend', infoExtra);

    renderHistorial();
}
function renderHistorial() {
    const cont = document.getElementById("historial");
    cont.innerHTML = "";
    if (clienteActual.historial.length === 0) {
        cont.innerHTML = `<div class="p-10 text-center text-slate-500 italic">Sin movimientos.</div>`;
        return;
    }
    [...clienteActual.historial].reverse().forEach((h, index, array) => {
        const esSuma = h.puntos > 0;
        cont.innerHTML += `
            <div class="flex justify-between items-center p-5 ${index !== array.length - 1 ? 'border-b border-white/5' : ''}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${esSuma ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                        ${esSuma ? '↑' : '↓'}
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-200">${h.descripcion}</p>
                        <p class="text-[10px] text-slate-500 uppercase font-black">${h.fecha}</p>
                    </div>
                </div>
                <span class="font-black ${esSuma ? 'text-emerald-400' : 'text-rose-400'} text-lg">
                    ${esSuma ? '+' : ''}${h.puntos}
                </span>
            </div>
        `;
    });
}

async function agregarPuntos() {
    const pts = Number(document.getElementById("puntosAgregar").value);
    const desc = document.getElementById("descripcion").value || "Compra Local";
    if (!pts) return;
    clienteActual.puntos += pts;
    clienteActual.historial.push({ fecha: new Date().toISOString().split('T')[0], descripcion: desc, puntos: pts });
    await updateUsuario(clienteActual);
    document.getElementById("puntosAgregar").value = "";
    renderCliente();
}

async function restarPuntos() {
    const pts = Number(document.getElementById("puntosRestar").value);
    if (!pts || pts > clienteActual.puntos) { showToast("Puntos insuficientes para realizar el canje.", "error"); return; }
    clienteActual.puntos -= pts;
    clienteActual.historial.push({ fecha: new Date().toISOString().split('T')[0], descripcion: "Canje", puntos: -pts });
    await updateUsuario(clienteActual);
    document.getElementById("puntosRestar").value = "";
    renderCliente();
}

let filtroActual = 'todos';

function setFiltro(f) {
    filtroActual = f;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('filtro-active'));
    document.getElementById(`filtro-${f}`).classList.add('filtro-active');
    renderStock();
}

function copiarTarjeta(num) {
    navigator.clipboard.writeText(num).then(() => {
        showToast(`Número ${num} copiado al portapapeles.`, "info", 2500);
    });
}

function renderStock() {
    const tbody = document.getElementById("tablaStock");
    const vacio = document.getElementById("stockVacio");
    const contador = document.getElementById("stockContador");
    if (!tbody) return;
    tbody.innerHTML = "";

    const busqueda = (document.getElementById("stockBuscador")?.value || "").toLowerCase().trim();

    let lista = usuarios.filter(u => {
        // Filtro estado
        if (filtroActual === 'libre' && u.asignada) return false;
        if (filtroActual === 'asignada' && !u.asignada) return false;
        // Filtro búsqueda
        if (busqueda) {
            const hayMatch = u.tarjeta.includes(busqueda)
                || (u.nombre || "").toLowerCase().includes(busqueda)
                || (u.telefono || "").toLowerCase().includes(busqueda);
            if (!hayMatch) return false;
        }
        return true;
    });

    if (contador) contador.innerText = `${lista.length} tarjeta${lista.length !== 1 ? 's' : ''} encontrada${lista.length !== 1 ? 's' : ''}`;

    if (lista.length === 0) {
        if (vacio) vacio.classList.remove("hidden");
        return;
    }
    if (vacio) vacio.classList.add("hidden");

    lista.forEach(u => {
        tbody.innerHTML += `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-all group">
                <td class="p-5">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-blue-400 tracking-widest text-sm">${u.tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2')}</span>
                        <button onclick="copiarTarjeta('${u.tarjeta}')" title="Copiar número"
                            class="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-slate-500 flex items-center justify-center text-xs border border-white/5">
                            ⎘
                        </button>
                    </div>
                </td>
                <td class="p-5">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase ${u.asignada ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-500'}">
                        ${u.asignada ? 'Asignada' : 'Libre'}
                    </span>
                </td>
                <td class="p-5 text-slate-300 font-bold text-sm">${u.nombre || '—'}</td>
                <td class="p-5 text-slate-500 font-mono text-sm">${u.telefono || '—'}</td>
                <td class="p-5 font-black text-sm">${u.puntos}</td>
            </tr>
        `;
    });
}

function importarLote() {
    const num = prompt("Ingresá los números de tarjeta separados por coma:");
    if (!num) return;
    const nuevos = num.split(",").map(n => n.trim());
    nuevos.forEach(n => {
        if(!usuarios.find(u => u.tarjeta === n)) {
            usuarios.push({ tarjeta: n, asignada: false, nombre: "", telefono: "", puntos: 0, historial: [] });
        }
    });
    renderStock();
}

function mostrarGenerador() {
    document.getElementById("generadorLote").classList.remove("hidden");
}

function ocultarGenerador() {
    document.getElementById("generadorLote").classList.add("hidden");
}

async function procesarGeneracion() {
    const cantidad = Number(document.getElementById("cantidadGenerar").value);
    if (!cantidad || cantidad <= 0) { showToast("Ingresá una cantidad válida.", "warn"); return; }

    let nuevosNumeros = [];
    
    for (let i = 0; i < cantidad; i++) {
        let nuevoNum;
        let existe = true;

        while (existe) {
            nuevoNum = Math.floor(10000000 + Math.random() * 90000000).toString();
            existe = usuarios.some(u => u.tarjeta === nuevoNum);
        }

        const nuevaTarjeta = {
            tarjeta: nuevoNum,
            asignada: false,
            nombre: "",
            telefono: "",
            puntos: 0,
            historial: []
        };

        usuarios.push(nuevaTarjeta);
        nuevosNumeros.push(nuevoNum);
    }

    // Persistir cada tarjeta nueva
    for (const tarjeta of nuevosNumeros) {
        const t = usuarios.find(u => u.tarjeta === tarjeta);
        await updateUsuario(t);
    }

    showToast(`Se generaron ${cantidad} tarjetas nuevas correctamente.`, "success");
    ocultarGenerador();
    document.getElementById("cantidadGenerar").value = "";
    renderStock();

    descargarListaImprenta(nuevosNumeros);
}

function descargarListaImprenta(lista) {
    const contenido = "LISTA DE NÚMEROS DE TARJETAS - MÁS QUE BURGERS\n\n" + lista.join("\n");
    const blob = new Blob([contenido], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lote_tarjetas_${new Date().getTime()}.txt`;
    a.click();
}