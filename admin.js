let clienteActual = null;
let tarjetaBuscadaActual = null;

// ── Helpers UI ─────────────────────────────────────────────
function hideLoader() { document.getElementById('global-loader')?.classList.add('hidden-loader'); }

function setBtnLoading(btnId, textId, spinnerId, loading, label) {
    const btn = document.getElementById(btnId);
    const text = document.getElementById(textId);
    const spinner = document.getElementById(spinnerId);
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('opacity-60', loading);
    btn.classList.toggle('cursor-not-allowed', loading);
    if (text) text.textContent = loading ? '' : label;
    if (spinner) spinner.classList.toggle('hidden', !loading);
}

initDB().then(async () => {
    await initProductos();
    hideLoader();
    renderStock();
    // renderPanelProductos() se llama solo tras verificar el PIN
});

// ── PIN de acceso a Productos ──────────────────────────────
// SHA-256 del PIN del dueño. Para cambiarlo: https://emn178.github.io/online-tools/sha256.html
const OWNER_PIN_HASH = '4dea5c7cb70f50322ec9d734aa4aa078be9227c05251e18991c596f387552370';
let productosPinVerificado = false;

async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function abrirModalPin() {
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').classList.add('hidden');
    document.getElementById('modalPin').classList.remove('hidden');
    setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function cerrarModalPin() {
    document.getElementById('modalPin').classList.add('hidden');
    // Volver a Gestión si cancela
    switchTab('gestion');
}

function limpiarErrorPin() {
    document.getElementById('pinError').classList.add('hidden');
}

async function verificarPin() {
    const pin = document.getElementById('pinInput').value;
    if (!pin) return;

    // Spinner mientras hashea
    document.getElementById('pinBtnText').textContent = '';
    document.getElementById('pinBtnSpinner').classList.remove('hidden');

    const hash = await hashPin(pin);

    document.getElementById('pinBtnText').textContent = 'Ingresar';
    document.getElementById('pinBtnSpinner').classList.add('hidden');

    if (hash === OWNER_PIN_HASH) {
        productosPinVerificado = true;
        document.getElementById('modalPin').classList.add('hidden');
        // Activa la pestaña correctamente via switchTab
        switchTab('productos');
    } else {
        document.getElementById('pinInput').value = '';
        document.getElementById('pinError').classList.remove('hidden');
        document.getElementById('pinInput').focus();
        // Animación de shake
        const input = document.getElementById('pinInput');
        input.classList.add('border-rose-500/50');
        setTimeout(() => input.classList.remove('border-rose-500/50'), 1000);
    }
}

// ── Tabs ───────────────────────────────────────────────────
function switchTab(tab) {
    // Si intenta ir a Productos sin PIN verificado, pide el PIN
    if (tab === 'productos' && !productosPinVerificado) {
        abrirModalPin();
        return;
    }

    const tabs = ['gestion', 'stock', 'productos'];
    tabs.forEach(t => {
        const sec = document.getElementById(`section-${t}`);
        if (sec) {
            sec.classList.add("hidden");
            sec.style.display = '';  // limpia cualquier inline style
        }
        document.getElementById(`btn-tab-${t}`)?.classList.remove("tab-active");
        document.getElementById(`btn-tab-${t}`)?.classList.add("text-slate-500");
    });

    const secActiva = document.getElementById(`section-${tab}`);
    if (secActiva) {
        secActiva.classList.remove("hidden");
        secActiva.style.display = '';  // asegura que no quede bloqueado por inline style
    }
    document.getElementById(`btn-tab-${tab}`)?.classList.add("tab-active");
    document.getElementById(`btn-tab-${tab}`)?.classList.remove("text-slate-500");

    if (tab === 'stock') renderStock();
    if (tab === 'productos') renderPanelProductos();
}

// ── Gestión de clientes ────────────────────────────────────
async function buscarCliente() {
    const tarjeta = document.getElementById("buscarTarjeta").value;
    setBtnLoading('btnBuscar', 'btnBuscarText', 'btnBuscarSpinner', true, 'Validar Tarjeta');
    const usuario = await getUsuario(tarjeta);
    setBtnLoading('btnBuscar', 'btnBuscarText', 'btnBuscarSpinner', false, 'Validar Tarjeta');

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
        document.getElementById("panelActivacion").classList.remove("hidden");
        const num = tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');
        document.getElementById("previewNumero").innerText = num;
        document.getElementById("previewNombre").innerText = "NOMBRE CLIENTE";
        document.getElementById("nuevoNombre").value = "";
        document.getElementById("nuevoTel").value = "";
    } else {
        clienteActual = usuario;
        document.getElementById("clienteResumen").classList.remove("hidden");
        document.getElementById("clienteAcciones").classList.remove("hidden");
        renderCliente();
        populateSelects();
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
    if (!nombre || !tel) { showToast("Completá el nombre y teléfono del cliente.", "warn"); return; }

    setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', true, 'Activar Tarjeta');
    const index = usuarios.findIndex(u => u.tarjeta === tarjetaBuscadaActual);
    usuarios[index] = {
        ...usuarios[index],
        asignada: true, nombre, telefono: tel, puntos: 100,
        historial: [{ fecha: new Date().toISOString().split('T')[0], descripcion: "Bono Bienvenida", puntos: 100 }]
    };
    await updateUsuario(usuarios[index]);
    setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', false, 'Activar Tarjeta');
    showToast("¡Tarjeta activada con éxito!", "success");
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoTel").value = "";
    buscarCliente();
}

function renderCliente() {
    document.getElementById("adminNombre").innerText = clienteActual.nombre;
    document.getElementById("adminPuntos").innerText = clienteActual.puntos.toLocaleString();
    const oldInfo = document.getElementById("adminNombre").nextElementSibling;
    if (oldInfo && oldInfo.tagName === 'P') oldInfo.remove();
    document.getElementById("adminNombre").insertAdjacentHTML('afterend',
        `<p class="text-[10px] text-slate-500 font-bold mt-2 uppercase">Contacto: ${clienteActual.telefono}</p>`);
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
            </div>`;
    });
}

// ── Selects de acreditar / debitar ─────────────────────────
function populateSelects() {
    const acreditar = document.getElementById("selectProductoAgregar");
    const debitar   = document.getElementById("selectProductoRestar");
    if (!acreditar || !debitar) return;

    const categorias = [...new Set(productos.map(p => p.categoria || 'General'))];

    const buildGrouped = (lista) => {
        if (!lista.length) return '<option value="" disabled>Sin productos cargados</option>';
        let html = '<option value="">Seleccioná un producto…</option>';
        categorias.forEach(cat => {
            const grupo = lista.filter(p => (p.categoria || 'General') === cat);
            if (grupo.length) {
                html += `<optgroup label="— ${cat} —">${
                    grupo.map(p => `<option value="${p.id}">${p.nombre} — ${p.puntos} pts</option>`).join('')
                }</optgroup>`;
            }
        });
        return html;
    };

    acreditar.innerHTML = buildGrouped(productos);
    debitar.innerHTML   = buildGrouped(productos.filter(p => p.canjeable !== false));
    document.getElementById("previewPuntosAgregar")?.classList.add("hidden");
    document.getElementById("previewPuntosRestar")?.classList.add("hidden");
}

function onSelectProductoAgregar() {
    const select  = document.getElementById("selectProductoAgregar");
    const preview = document.getElementById("previewPuntosAgregar");
    const prod    = productos.find(p => p.id === select.value);
    if (prod) {
        document.getElementById("previewPuntosAgregarVal").textContent = `+${prod.puntos} pts`;
        preview.classList.remove("hidden");
    } else {
        preview.classList.add("hidden");
    }
}

function onSelectProductoRestar() {
    const select  = document.getElementById("selectProductoRestar");
    const preview = document.getElementById("previewPuntosRestar");
    const prod    = productos.find(p => p.id === select.value);
    if (prod) {
        const puede = clienteActual && prod.puntos <= clienteActual.puntos;
        document.getElementById("previewPuntosRestarVal").textContent = `-${prod.puntos} pts`;
        document.getElementById("previewPuntosRestarVal").className = `font-black text-lg ${puede ? 'text-rose-400' : 'text-amber-400'}`;
        document.getElementById("previewPuntosRestarAviso").textContent = puede ? '' : '⚠ Puntos insuficientes';
        preview.classList.remove("hidden");
    } else {
        preview.classList.add("hidden");
    }
}

async function agregarPuntos() {
    const select = document.getElementById("selectProductoAgregar");
    const prod   = productos.find(p => p.id === select.value);
    if (!prod) { showToast("Seleccioná un producto.", "warn"); return; }
    setBtnLoading('btnAgregar', 'btnAgregarText', 'btnAgregarSpinner', true, 'Acreditar');
    clienteActual.puntos += prod.puntos;
    clienteActual.historial.push({ fecha: new Date().toISOString().split('T')[0], descripcion: prod.nombre, puntos: prod.puntos });
    await updateUsuario(clienteActual);
    setBtnLoading('btnAgregar', 'btnAgregarText', 'btnAgregarSpinner', false, 'Acreditar');
    select.value = "";
    document.getElementById("previewPuntosAgregar").classList.add("hidden");
    renderCliente();
}

async function restarPuntos() {
    const select = document.getElementById("selectProductoRestar");
    const prod   = productos.find(p => p.id === select.value);
    if (!prod) { showToast("Seleccioná un premio a canjear.", "warn"); return; }
    if (prod.puntos > clienteActual.puntos) { showToast("Puntos insuficientes.", "error"); return; }
    setBtnLoading('btnRestar', 'btnRestarText', 'btnRestarSpinner', true, 'Debitar');
    clienteActual.puntos -= prod.puntos;
    clienteActual.historial.push({ fecha: new Date().toISOString().split('T')[0], descripcion: `Canje: ${prod.nombre}`, puntos: -prod.puntos });
    await updateUsuario(clienteActual);
    setBtnLoading('btnRestar', 'btnRestarText', 'btnRestarSpinner', false, 'Debitar');
    select.value = "";
    document.getElementById("previewPuntosRestar").classList.add("hidden");
    renderCliente();
}

// ── Stock de tarjetas ──────────────────────────────────────
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
    const tbody    = document.getElementById("tablaStock");
    const vacio    = document.getElementById("stockVacio");
    const contador = document.getElementById("stockContador");
    if (!tbody) return;
    tbody.innerHTML = "";
    const busqueda = (document.getElementById("stockBuscador")?.value || "").toLowerCase().trim();

    let lista = usuarios.filter(u => {
        if (filtroActual === 'libre'    && u.asignada)  return false;
        if (filtroActual === 'asignada' && !u.asignada) return false;
        if (busqueda) {
            const ok = u.tarjeta.includes(busqueda)
                || (u.nombre || "").toLowerCase().includes(busqueda)
                || (u.telefono || "").toLowerCase().includes(busqueda);
            if (!ok) return false;
        }
        return true;
    });

    if (contador) contador.innerText = `${lista.length} tarjeta${lista.length !== 1 ? 's' : ''} encontrada${lista.length !== 1 ? 's' : ''}`;
    if (lista.length === 0) { vacio?.classList.remove("hidden"); return; }
    vacio?.classList.add("hidden");

    lista.forEach(u => {
        tbody.innerHTML += `
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-all group">
                <td class="p-5">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-blue-400 tracking-widest text-sm">${u.tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2')}</span>
                        <button onclick="copiarTarjeta('${u.tarjeta}')" title="Copiar número"
                            class="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-slate-500 flex items-center justify-center text-xs border border-white/5">⎘</button>
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
                <td class="p-5">
                    <button onclick="abrirModalEditar('${u.tarjeta}')"
                        class="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 rounded-lg bg-white/5 hover:bg-blue-500/10 hover:text-blue-400 text-slate-500 text-[10px] font-bold border border-white/5 transition-all">
                        Editar
                    </button>
                </td>
            </tr>`;
    });
}

// ── Modal Editar Tarjeta ───────────────────────────────────
let tarjetaEditandoActual = null;

function abrirModalEditar(tarjeta) {
    const u = usuarios.find(x => x.tarjeta === tarjeta);
    if (!u) return;
    tarjetaEditandoActual = tarjeta;

    // Datos básicos
    document.getElementById('modalEditarNumero').textContent = tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');
    document.getElementById('editNombre').value   = u.nombre   || '';
    document.getElementById('editTelefono').value = u.telefono || '';

    // Último movimiento
    const historial = u.historial || [];
    if (historial.length > 0) {
        const ultimo = historial[historial.length - 1];
        const esSuma = ultimo.puntos > 0;

        document.getElementById('editMovDescripcion').textContent = ultimo.descripcion;
        document.getElementById('editMovFecha').textContent       = ultimo.fecha;
        document.getElementById('editMovPuntos').textContent      = `${esSuma ? '+' : ''}${ultimo.puntos}`;
        document.getElementById('editMovPuntos').className        = `font-black text-lg ${esSuma ? 'text-emerald-400' : 'text-rose-400'}`;

        const icono = document.getElementById('editMovIcono');
        icono.textContent  = esSuma ? '↑' : '↓';
        icono.className    = `w-9 h-9 rounded-full flex items-center justify-center text-sm ${esSuma ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`;

        document.getElementById('editUltimoMov').classList.remove('hidden');
        document.getElementById('editSinMov').classList.add('hidden');
    } else {
        document.getElementById('editUltimoMov').classList.add('hidden');
        document.getElementById('editSinMov').classList.remove('hidden');
    }

    document.getElementById('modalEditarTarjeta').classList.remove('hidden');
    document.getElementById('editNombre').focus();
}

function cerrarModalEditar() {
    document.getElementById('modalEditarTarjeta').classList.add('hidden');
    tarjetaEditandoActual = null;
}

async function guardarEdicionTarjeta() {
    const nombre   = document.getElementById('editNombre').value.trim();
    const telefono = document.getElementById('editTelefono').value.trim();
    if (!nombre || !telefono) { showToast('Completá nombre y teléfono.', 'warn'); return; }

    setBtnLoading('btnGuardarEdit', 'btnGuardarEditText', 'btnGuardarEditSpinner', true, 'Guardar Cambios');

    const idx = usuarios.findIndex(u => u.tarjeta === tarjetaEditandoActual);
    usuarios[idx] = { ...usuarios[idx], nombre, telefono };
    await updateUsuario(usuarios[idx]);

    setBtnLoading('btnGuardarEdit', 'btnGuardarEditText', 'btnGuardarEditSpinner', false, 'Guardar Cambios');
    showToast('Datos actualizados correctamente.', 'success');
    cerrarModalEditar();
    renderStock();
}

async function anularUltimoMovimiento() {
    const u = usuarios.find(x => x.tarjeta === tarjetaEditandoActual);
    if (!u || !u.historial || u.historial.length === 0) return;

    const ultimo = u.historial[u.historial.length - 1];

    // No permitir anular una anulación
    if (ultimo.descripcion.startsWith('Anulación:')) {
        showToast('No se puede anular una anulación.', 'warn');
        return;
    }

    if (!confirm(`¿Anular "${ultimo.descripcion}" (${ultimo.puntos > 0 ? '+' : ''}${ultimo.puntos} pts)?`)) return;

    setBtnLoading('btnAnular', 'btnAnularText', 'btnAnularSpinner', true, 'Anular');

    const puntosRevertidos = -ultimo.puntos;
    u.puntos += puntosRevertidos;
    u.historial.push({
        fecha: new Date().toISOString().split('T')[0],
        descripcion: `Anulación: ${ultimo.descripcion}`,
        puntos: puntosRevertidos
    });

    await updateUsuario(u);

    setBtnLoading('btnAnular', 'btnAnularText', 'btnAnularSpinner', false, 'Anular');
    showToast(`Movimiento anulado. Puntos ajustados a ${u.puntos}.`, 'success');
    cerrarModalEditar();
    renderStock();
}

function mostrarGenerador() { document.getElementById("generadorLote").classList.remove("hidden"); }
function ocultarGenerador() { document.getElementById("generadorLote").classList.add("hidden"); }

async function procesarGeneracion() {
    const cantidad = Number(document.getElementById("cantidadGenerar").value);
    if (!cantidad || cantidad <= 0) { showToast("Ingresá una cantidad válida.", "warn"); return; }
    setBtnLoading('btnGenerar', 'btnGenerarText', 'btnGenerarSpinner', true, 'Crear Números');

    let nuevosNumeros = [];
    for (let i = 0; i < cantidad; i++) {
        let nuevoNum, existe = true;
        while (existe) {
            nuevoNum = Math.floor(10000000 + Math.random() * 90000000).toString();
            existe = usuarios.some(u => u.tarjeta === nuevoNum);
        }
        usuarios.push({ tarjeta: nuevoNum, asignada: false, nombre: "", telefono: "", puntos: 0, historial: [] });
        nuevosNumeros.push(nuevoNum);
    }
    for (const tarjeta of nuevosNumeros) {
        await updateUsuario(usuarios.find(u => u.tarjeta === tarjeta));
    }
    showToast(`Se generaron ${cantidad} tarjetas nuevas.`, "success");
    setBtnLoading('btnGenerar', 'btnGenerarText', 'btnGenerarSpinner', false, 'Crear Números');
    ocultarGenerador();
    document.getElementById("cantidadGenerar").value = "";
    renderStock();
    descargarListaImprenta(nuevosNumeros);
}

function descargarListaImprenta(lista) {
    const contenido = "LISTA DE NÚMEROS DE TARJETAS - MÁS QUE BURGERS\n\n" + lista.join("\n");
    const blob = new Blob([contenido], { type: 'text/plain' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `lote_tarjetas_${new Date().getTime()}.txt`; a.click();
}

// ── Panel de Productos ─────────────────────────────────────
let productoEditandoId = null;

function renderPanelProductos() {
    const lista = document.getElementById("listaProductos");
    if (!lista) return;
    lista.innerHTML = "";

    if (productos.length === 0) {
        lista.innerHTML = `<div class="col-span-full p-10 text-center text-slate-500 italic text-sm">Sin productos. Agregá el primero.</div>`;
        return;
    }

    const categorias = [...new Set(productos.map(p => p.categoria || 'General'))];
    categorias.forEach(cat => {
        const grupo = productos.filter(p => (p.categoria || 'General') === cat);
        lista.innerHTML += `<div class="col-span-full text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2 pb-1 border-b border-white/5">${cat}</div>`;
        grupo.forEach(p => {
            const tieneImg = p.imagen && p.imagen.trim() !== '';
            lista.innerHTML += `
                <div class="glass rounded-2xl overflow-hidden flex flex-col group hover:bg-white/[0.04] transition-all">
                    <div class="w-full h-40 bg-slate-900 overflow-hidden flex items-center justify-center relative">
                        ${tieneImg
                            ? `<img src="${p.imagen}" alt="${p.nombre}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                   onerror="this.parentElement.innerHTML='<span class=\\'text-4xl\\'>🍔</span>'">`
                            : `<span class="text-4xl">🍔</span>`
                        }
                        <span class="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black backdrop-blur-md
                            ${p.canjeable !== false ? 'bg-rose-500/80 text-white' : 'bg-emerald-600/80 text-white'}">
                            ${p.canjeable !== false ? '⇄ Canjeable' : '+ Solo suma'}
                        </span>
                    </div>
                    <div class="p-5 flex flex-col gap-3 flex-1">
                        <div>
                            <p class="font-bold text-white text-sm leading-tight">${p.nombre}</p>
                            <p class="text-[10px] text-slate-500 mt-0.5 uppercase font-semibold">${p.categoria || 'General'}</p>
                        </div>
                        <div class="flex items-center justify-between border-t border-white/5 pt-3 mt-auto">
                            <span class="text-2xl font-black text-blue-400">${p.puntos} <span class="text-xs font-bold text-slate-500">PTS</span></span>
                            <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onclick="editarProducto('${p.id}')" class="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20">Editar</button>
                                <button onclick="confirmarEliminar('${p.id}')" class="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20">Eliminar</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
    });
    populateSelects();
}

// Preview de imagen en tiempo real
function previewImagen() {
    const url         = document.getElementById("formProdImagen").value.trim();
    const img         = document.getElementById("imgPreview");
    const placeholder = document.getElementById("imgPreviewPlaceholder");
    if (url) {
        img.src = url;
        img.classList.remove("hidden");
        placeholder.classList.add("hidden");
    } else {
        img.classList.add("hidden");
        placeholder.classList.remove("hidden");
    }
}

function abrirFormProducto() {
    productoEditandoId = null;
    document.getElementById("formProdNombre").value    = "";
    document.getElementById("formProdCategoria").value = "";
    document.getElementById("formProdPuntos").value    = "";
    document.getElementById("formProdCanjeable").value = "true";
    document.getElementById("formProdImagen").value    = "";
    document.getElementById("imgPreview").classList.add("hidden");
    document.getElementById("imgPreviewPlaceholder").classList.remove("hidden");
    document.getElementById("tituloFormProd").textContent    = "Nuevo Producto";
    document.getElementById("btnGuardarProdText").textContent = "Guardar Producto";
    document.getElementById("formProducto").classList.remove("hidden");
    document.getElementById("formProducto").scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById("formProdNombre").focus();
}

function cerrarFormProducto() {
    document.getElementById("formProducto").classList.add("hidden");
    productoEditandoId = null;
}

function editarProducto(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    productoEditandoId = id;
    document.getElementById("formProdNombre").value    = p.nombre;
    document.getElementById("formProdCategoria").value = p.categoria || "";
    document.getElementById("formProdPuntos").value    = p.puntos;
    document.getElementById("formProdCanjeable").value = p.canjeable === false ? "false" : "true";
    document.getElementById("formProdImagen").value    = p.imagen || "";
    document.getElementById("tituloFormProd").textContent    = "Editar Producto";
    document.getElementById("btnGuardarProdText").textContent = "Guardar Cambios";
    previewImagen();
    document.getElementById("formProducto").classList.remove("hidden");
    document.getElementById("formProducto").scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById("formProdNombre").focus();
}

async function guardarProducto() {
    const nombre    = document.getElementById("formProdNombre").value.trim();
    const categoria = document.getElementById("formProdCategoria").value.trim() || "General";
    const puntos    = Number(document.getElementById("formProdPuntos").value);
    const canjeable = document.getElementById("formProdCanjeable").value === "true";
    const imagen    = document.getElementById("formProdImagen").value.trim();

    if (!nombre || !puntos) { showToast("Completá nombre y puntos.", "warn"); return; }

    setBtnLoading('btnGuardarProd', 'btnGuardarProdText', 'btnGuardarProdSpinner', true, 'Guardar Producto');
    const prod = { nombre, categoria, puntos, canjeable, imagen };
    if (productoEditandoId) prod.id = productoEditandoId;

    await saveProducto(prod);
    setBtnLoading('btnGuardarProd', 'btnGuardarProdText', 'btnGuardarProdSpinner', false, 'Guardar Producto');
    showToast(`"${nombre}" guardado.`, "success");
    cerrarFormProducto();
    renderPanelProductos();
}

async function confirmarEliminar(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return;
    await deleteProducto(id);
    showToast(`"${p.nombre}" eliminado.`, "info");
    renderPanelProductos();
}
