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

// ── Guardián de autenticación ──────────────────────────────
// Espera a que Firebase confirme el estado de sesión antes de
// mostrar cualquier cosa. Si no hay usuario, redirige al login.
firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
        // Sin sesión → patear al login sin mostrar el panel
        window.location.replace('login.html');
        return;
    }
    // Sesión válida → cargar la app normalmente
    await initDB();
    await initProductos();
    hideLoader();
    renderStock();
});

// ── Cerrar sesión ──────────────────────────────────────────
function cerrarSesion() {
    firebase.auth().signOut().then(() => {
        window.location.replace('login.html');
    }).catch(() => {
        showToast('Error al cerrar sesión. Intentá de nuevo.', 'error');
    });
}

// ── PIN de acceso a Productos ──────────────────────────────
// SHA-256 del PIN del dueño. Para cambiarlo: https://emn178.github.io/online-tools/sha256.html
const OWNER_PIN_HASH = '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';
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



// ── Copiar teléfono ────────────────────────────────────────
function copiarTelefono() {
    if (!clienteActual || !clienteActual.telefono) return;
    navigator.clipboard.writeText(clienteActual.telefono).then(() => {
        const iconCopy  = document.getElementById('iconCopy');
        const iconCheck = document.getElementById('iconCheck');
        if (iconCopy)  iconCopy.classList.add('hidden');
        if (iconCheck) iconCheck.classList.remove('hidden');
        setTimeout(() => {
            if (iconCopy)  iconCopy.classList.remove('hidden');
            if (iconCheck) iconCheck.classList.add('hidden');
        }, 2000);
    }).catch(() => showToast('No se pudo copiar.', 'error'));
}

// ── Toggle PIN visible/oculto ──────────────────────────────
let pinVisible = false;
let pinRealValue = '----';

function togglePin() {
    pinVisible = !pinVisible;
    const pinEl       = document.getElementById('adminPin');
    const iconAbierto = document.getElementById('iconOjoAbierto');
    const iconCerrado = document.getElementById('iconOjoCerrado');
    if (!pinEl) return;
    pinEl.textContent = pinVisible ? pinRealValue : '••••';
    if (iconAbierto) iconAbierto.classList.toggle('hidden', !pinVisible);
    if (iconCerrado) iconCerrado.classList.toggle('hidden', pinVisible);
}

// ── Control de layout columnas ─────────────────────────────
function modoActivacion() {
    // Oculta col izquierda, expande col derecha a 12
    const izq = document.getElementById('columnaIzquierda');
    const der = document.getElementById('columnaDerecha');
    if (izq) izq.classList.add('hidden');
    if (der) {
        der.classList.remove('lg:col-span-8');
        der.classList.add('lg:col-span-12');
    }
}

function modoBusqueda() {
    // Restaura layout normal
    const izq = document.getElementById('columnaIzquierda');
    const der = document.getElementById('columnaDerecha');
    if (izq) izq.classList.remove('hidden');
    if (der) {
        der.classList.remove('lg:col-span-12');
        der.classList.add('lg:col-span-8');
    }
}

// ── Volver al estado inicial ───────────────────────────────
function volverAlInicio() {
    clienteActual = null;
    tarjetaBuscadaActual = null;
    pinVisible = false;
    pinRealValue = '----';
    document.getElementById("buscarTarjeta").value = "";
    // Restaurar layout de columnas
    modoBusqueda();
    // Panel izquierdo: mostrar buscador, ocultar info activa
    document.getElementById("buscarPanel").classList.remove("hidden");
    document.getElementById("activaPanel").classList.add("hidden");
    // Panel derecho: ocultar todo, mostrar placeholder
    document.getElementById("clienteAcciones").classList.add("hidden");
    document.getElementById("panelActivacion").classList.add("hidden");
    document.getElementById("noCliente").classList.remove("hidden");
    setTimeout(() => document.getElementById("buscarTarjeta").focus(), 50);
}

// ── Gestión de clientes ────────────────────────────────────
async function buscarCliente() {
    const inputValor = document.getElementById("buscarTarjeta").value;
    const tarjeta = inputValor.replace(/\s+/g, ''); // Limpiamos los espacios

    if (tarjeta.length === 0) return;

    setBtnLoading('btnBuscar', 'btnBuscarText', 'btnBuscarSpinner', true, 'Validar Tarjeta');
    const usuario = await getUsuario(tarjeta);
    setBtnLoading('btnBuscar', 'btnBuscarText', 'btnBuscarSpinner', false, 'Validar Tarjeta');

    document.getElementById("noCliente").classList.add("hidden");
    document.getElementById("clienteAcciones").classList.add("hidden");
    document.getElementById("panelActivacion").classList.add("hidden");

    if (!usuario) {
        showToast("Esta tarjeta no existe en el sistema.", "error");
        document.getElementById("noCliente").classList.remove("hidden");
        return;
    }

    tarjetaBuscadaActual = tarjeta;

    if (!usuario.asignada) {
        // Tarjeta libre: centrar panel de activación (col-span-12)
        modoActivacion();
        document.getElementById("buscarPanel").classList.add("hidden");
        document.getElementById("activaPanel").classList.add("hidden");
        document.getElementById("panelActivacion").classList.remove("hidden");
        const num = tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');
        document.getElementById("previewNumero").innerText = num;
        document.getElementById("previewNombre").innerText = "NOMBRE CLIENTE";
        document.getElementById("nuevoNombre").value = "";
        document.getElementById("nuevoTel").value = "";
    } else {
        // Tarjeta asignada: mostrar activaPanel con datos del cliente
        clienteActual = usuario;
        document.getElementById("buscarPanel").classList.add("hidden");
        document.getElementById("activaPanel").classList.remove("hidden");
        document.getElementById("clienteAcciones").classList.remove("hidden");
        renderCliente();
        populateSelects();
        verificarLimiteCanje();
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
    
    // 1. Generar PIN único de 4 dígitos (ej: 0492)
    let nuevoPin;
    let existePin = true;
    while (existePin) {
        nuevoPin = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        // Chequeamos que nadie más tenga este PIN
        existePin = usuarios.some(u => u.pin === nuevoPin);
    }

    // 2. Guardar en el array y Firebase
    const index = usuarios.findIndex(u => u.tarjeta === tarjetaBuscadaActual);
    usuarios[index] = {
        ...usuarios[index],
        asignada: true, nombre, telefono: tel, puntos: 100, pin: nuevoPin,
        historial: [{ fecha: new Date().toISOString().split('T')[0], descripcion: "Bono Bienvenida", puntos: 100 }]
    };
    await updateUsuario(usuarios[index]);
    
    setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', false, 'Activar Tarjeta');
    
    // 3. Abrir modal personalizado de éxito con el PIN generado
    document.getElementById('modalPinNombre').innerText = nombre;
    document.getElementById('modalPinGenerado').innerText = nuevoPin;
    document.getElementById('modalPinActivacion').classList.remove('hidden');
    
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoTel").value = "";
    // No llamamos a buscarCliente() — el modal tapa todo y al cerrarlo volverAlInicio() limpia el estado
}

function cerrarModalPinActivacion() {
    document.getElementById('modalPinActivacion').classList.add('hidden');
    volverAlInicio();
}

function renderCliente() {
    document.getElementById("adminNombre").innerText = clienteActual.nombre;
    document.getElementById("adminPuntos").innerText = clienteActual.puntos.toLocaleString();

    // Teléfono
    const telEl = document.getElementById("adminTelefono");
    if (telEl) telEl.innerText = clienteActual.telefono || '—';

    // PIN: siempre arrancar oculto al cargar un nuevo cliente
    pinRealValue = clienteActual.pin || '----';
    pinVisible = false;
    const pinEl       = document.getElementById("adminPin");
    const iconAbierto = document.getElementById("iconOjoAbierto");
    const iconCerrado = document.getElementById("iconOjoCerrado");
    if (pinEl)       pinEl.textContent = '••••';
    if (iconAbierto) iconAbierto.classList.add("hidden");
    if (iconCerrado) iconCerrado.classList.remove("hidden");

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
    verificarLimiteCanje(); // VERIFICA Y BLOQUEA AL INSTANTE
}

// ── Stock de tarjetas ──────────────────────────────────────
let filtroActual = 'todos';

function setFiltro(f) {
    filtroActual = f;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('filtro-active'));
    document.getElementById(`filtro-${f}`).classList.add('filtro-active');
    renderStock();
}

function copiarTarjeta(num, btn) {
    navigator.clipboard.writeText(num).then(() => {
        if (!btn) return;
        const iconCopy  = btn.querySelector('.icon-copy-t');
        const iconCheck = btn.querySelector('.icon-check-t');
        if (iconCopy)  iconCopy.classList.add('hidden');
        if (iconCheck) iconCheck.classList.remove('hidden');
        setTimeout(() => {
            if (iconCopy)  iconCopy.classList.remove('hidden');
            if (iconCheck) iconCheck.classList.add('hidden');
        }, 2000);
    }).catch(() => showToast('No se pudo copiar.', 'error'));
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
            // Se limpian los espacios para que coincida aunque copien el número con formato
            const ok = u.tarjeta.includes(busqueda.replace(/\s+/g, ''))
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
                        <span class="font-mono text-green-500 tracking-widest text-sm">${u.tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2')}</span>
                        <button onclick="copiarTarjeta('${u.tarjeta}', this)" title="Copiar número"
                            class="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-white/5 hover:bg-blue-500/20 border border-white/5 hover:border-blue-500/30 flex items-center justify-center transition-all flex-shrink-0 group-copy">
                            <svg class="icon-copy-t text-slate-500 group-copy-hover:text-blue-400 transition-colors" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            </svg>
                            <svg class="icon-check-t hidden text-blue-400" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="p-5">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase ${u.asignada ? 'bg-green-900/40 text-green-500' : 'bg-emerald-500/10 text-emerald-500'}">
                        ${u.asignada ? 'Asignada' : 'Libre'}
                    </span>
                    ${u.asignada && u.pin ? `<span class="block mt-2 text-[10px] text-green-400 font-mono tracking-widest font-bold">PIN: ${u.pin}</span>` : ''}
                </td>
                <td class="p-5 text-slate-300 font-bold text-sm">${u.nombre || '—'}</td>
                <td class="p-5 text-slate-500 font-mono text-sm">${u.telefono || '—'}</td>
                <td class="p-5 font-black text-sm">${u.puntos}</td>
                <td class="p-5">
                    ${u.asignada ? `
                    <div class="flex items-center gap-2">
                        <button onclick="abrirModalEditar('${u.tarjeta}')"
                            class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-blue-800/30 hover:text-blue-400 text-slate-400 text-[10px] font-bold border border-white/5 transition-all">
                            Editar
                        </button>
                        <button onclick="eliminarDesdeTabla('${u.tarjeta}')"
                            class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/10 transition-all">
                            Eliminar
                        </button>
                    </div>` : ''}
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

// ── Modal de confirmación custom ───────────────────────────
function showConfirm({ titulo, mensaje, tipo = 'danger', labelAceptar = 'Confirmar', onAceptar }) {
    const modal    = document.getElementById('modalConfirm');
    const iconoEl  = document.getElementById('modalConfirmIcono');
    const tituloEl = document.getElementById('modalConfirmTitulo');
    const mensajeEl= document.getElementById('modalConfirmMensaje');
    const btnAcep  = document.getElementById('modalConfirmAceptar');
    const btnCan   = document.getElementById('modalConfirmCancelar');

    // Ícono y colores según tipo
    if (tipo === 'danger') {
        iconoEl.className = 'w-14 h-14 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20';
        iconoEl.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        btnAcep.className = 'flex-1 bg-rose-600 hover:bg-rose-500 p-3 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all shadow-lg shadow-rose-900/30 flex items-center justify-center';
    } else if (tipo === 'warn') {
        iconoEl.className = 'w-14 h-14 rounded-2xl flex items-center justify-center bg-amber-500/10 border border-amber-500/20';
        iconoEl.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        btnAcep.className = 'flex-1 bg-amber-600 hover:bg-amber-500 p-3 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all shadow-lg shadow-amber-900/30 flex items-center justify-center';
    }

    tituloEl.textContent  = titulo;
    mensajeEl.textContent = mensaje;
    btnAcep.textContent   = labelAceptar;

    modal.classList.remove('hidden');

    // Clonar para limpiar listeners anteriores
    const newAcep = btnAcep.cloneNode(true);
    const newCan  = btnCan.cloneNode(true);
    btnAcep.parentNode.replaceChild(newAcep, btnAcep);
    btnCan.parentNode.replaceChild(newCan, btnCan);

    newAcep.textContent = labelAceptar;
    newAcep.className   = btnAcep.className || newAcep.className;

    newAcep.addEventListener('click', () => {
        modal.classList.add('hidden');
        onAceptar();
    });
    newCan.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

// ── Eliminar directamente desde la tabla sin abrir el modal de edición
async function eliminarDesdeTabla(tarjeta) {
    const u = usuarios.find(x => x.tarjeta === tarjeta);
    if (!u) return;

    showConfirm({
        titulo: 'Eliminar cliente',
        mensaje: `¿Estás seguro de eliminar a ${u.nombre}? Se borrarán sus puntos y la tarjeta/PIN quedarán libres.`,
        tipo: 'danger',
        labelAceptar: 'Eliminar',
        onAceptar: async () => {
            const idx = usuarios.findIndex(x => x.tarjeta === tarjeta);
            usuarios[idx] = { tarjeta: u.tarjeta, asignada: false, nombre: "", telefono: "", puntos: 0, historial: [] };
            await updateUsuario(usuarios[idx]);
            showToast('Cliente eliminado. Tarjeta y PIN liberados.', 'success');
            if (clienteActual && clienteActual.tarjeta === tarjeta) volverAlInicio();
            renderStock();
        }
    });
}

// Nueva función para eliminar cliente y liberar PIN/Tarjeta
async function eliminarClienteActual() {
    const u = usuarios.find(x => x.tarjeta === tarjetaEditandoActual);
    if (!u) return;

    showConfirm({
        titulo: 'Eliminar cliente',
        mensaje: `¿Estás seguro de eliminar a ${u.nombre}? Se borrarán sus puntos y la tarjeta/PIN quedarán libres.`,
        tipo: 'danger',
        labelAceptar: 'Eliminar',
        onAceptar: async () => {
            setBtnLoading('btnGuardarEdit', 'btnGuardarEditText', 'btnGuardarEditSpinner', true, 'Procesando...');
            const idx = usuarios.findIndex(x => x.tarjeta === tarjetaEditandoActual);
            usuarios[idx] = { tarjeta: u.tarjeta, asignada: false, nombre: "", telefono: "", puntos: 0, historial: [] };
            await updateUsuario(usuarios[idx]);
            setBtnLoading('btnGuardarEdit', 'btnGuardarEditText', 'btnGuardarEditSpinner', false, 'Guardar');
            showToast('Cliente eliminado. Tarjeta y PIN liberados.', 'success');
            cerrarModalEditar();
            if (clienteActual && clienteActual.tarjeta === tarjetaEditandoActual) volverAlInicio();
            renderStock();
        }
    });
}

async function anularUltimoMovimiento() {
    const u = usuarios.find(x => x.tarjeta === tarjetaEditandoActual);
    if (!u || !u.historial || u.historial.length === 0) return;

    const ultimo = u.historial[u.historial.length - 1];

    if (ultimo.descripcion.startsWith('Anulación:')) {
        showToast('No se puede anular una anulación.', 'warn');
        return;
    }

    showConfirm({
        titulo: 'Anular movimiento',
        mensaje: `¿Anular "${ultimo.descripcion}" (${ultimo.puntos > 0 ? '+' : ''}${ultimo.puntos} pts)? Esta acción no se puede deshacer.`,
        tipo: 'warn',
        labelAceptar: 'Anular',
        onAceptar: async () => {
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
            if (clienteActual && clienteActual.tarjeta === tarjetaEditandoActual) buscarCliente();
        }
    });
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
    showToast(`Se generaron ${cantidad} tarjetas virtuales nuevas.`, "success");
    setBtnLoading('btnGenerar', 'btnGenerarText', 'btnGenerarSpinner', false, 'Crear Números');
    ocultarGenerador();
    document.getElementById("cantidadGenerar").value = "";
    renderStock();
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
                            <span class="text-2xl font-black text-green-500">${p.puntos} <span class="text-xs font-bold text-slate-500">PTS</span></span>
                            <div class="flex gap-2">
                                <button onclick="editarProducto('${p.id}')" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-blue-800/30 text-slate-400 hover:text-blue-400 text-[10px] font-bold border border-white/5 transition-all">Editar</button>
                                <button onclick="confirmarEliminar('${p.id}')" class="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 border border-rose-500/10 transition-all">Eliminar</button>
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
    showConfirm({
        titulo: 'Eliminar producto',
        mensaje: `¿Estás seguro de eliminar "${p.nombre}"? Esta acción no se puede deshacer.`,
        tipo: 'danger',
        labelAceptar: 'Eliminar',
        onAceptar: async () => {
            await deleteProducto(id);
            showToast(`"${p.nombre}" eliminado.`, 'info');
            renderPanelProductos();
        }
    });
}

// ── LÓGICA DE LÍMITE DIARIO DE CANJES ─────────────────────────────
function verificarLimiteCanje() {
    if (!clienteActual) return;
    const hoy = new Date().toISOString().split('T')[0];
    
    let canjesHoy = 0;
    let anulacionesHoy = 0;
    
    // Contamos si hoy tuvo un canje (y restamos si ese canje se anuló por error del cajero)
    clienteActual.historial.forEach(h => {
        if (h.fecha === hoy) {
            if (h.descripcion.startsWith('Canje:')) canjesHoy++;
            if (h.descripcion.startsWith('Anulación: Canje:')) anulacionesHoy++;
        }
    });
    
    const yaCanjeo = (canjesHoy - anulacionesHoy) > 0;
    
    const contNormal = document.getElementById("contenedorCanjeNormal");
    const contBloqueo = document.getElementById("mensajeBloqueoCanje");
    
    if (contNormal && contBloqueo) {
        if (yaCanjeo) {
            contNormal.classList.add("hidden");
            contBloqueo.classList.remove("hidden");
        } else {
            contNormal.classList.remove("hidden");
            contBloqueo.classList.add("hidden");
            // Limpiamos los campos por las dudas
            document.getElementById("selectProductoRestar").value = "";
            document.getElementById("previewPuntosRestar").classList.add("hidden");
        }
    }
}
