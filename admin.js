let clienteActual = null;
let tarjetaBuscadaActual = null;
let esMozo = false; // true cuando el usuario logueado es mozo@masqueburgers.com

// ── Sistema de reserva de tarjetas ────────────────────────────
// Al validar una tarjeta libre se escribe un lock en Firestore al instante.
// Eso la marca como "En asignación" para todos los demás en tiempo real.
// El lock se libera al activar la tarjeta o al volver atrás.
let tarjetaReservadaActual = null;   // número de tarjeta que este dispositivo tiene reservada

// ── Listener de tiempo real para la sección stock ─────────────
let stockUnsubscribe = null;         // función para cancelar el listener de Firestore

// ── Listener de locks en tiempo real ──────────────────────────
let locksUnsubscribe = null;         // función para cancelar el listener de locks
let locksVigentesRT = new Set();     // Set actualizado en tiempo real, sin await

// ── Tarjeta oculta (no aparece en listado ni búsqueda del admin) ──
const TARJETA_OCULTA = '99441180'; // ← reemplazá con tu número real de tarjeta

// ── Emails autorizados y sus roles ────────────────────────────────
const ROLES = {
    'ludmila@masqueburgers.com': 'Ludmila - Moza',
    'elvio@masqueburgers.com': 'Elvio - Mozo',
    // Cualquier otro email autenticado se trata como admin
};

// ── Helpers UI ─────────────────────────────────────────────
function hideLoader() { document.getElementById('global-loader')?.classList.add('hidden-loader'); }

// ── Scroll lock ────────────────────────────────────────────
let _scrollLockCount = 0;
function lockScroll() {
    _scrollLockCount++;
    if (_scrollLockCount === 1) {
        const scrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top      = `-${scrollY}px`;
        document.body.style.width    = '100%';
        document.body.dataset.scrollY = scrollY;
    }
}
function unlockScroll() {
    _scrollLockCount = Math.max(0, _scrollLockCount - 1);
    if (_scrollLockCount === 0) {
        const scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top      = '';
        document.body.style.width    = '';
        window.scrollTo(0, scrollY);
    }
}

// ── Generador de ID de Transacción ────────────────────────
// Produce un código como "MQB-7A2F" único por movimiento.
// Se guarda en el historial y se muestra en el comprobante del cliente.
function generarIdTx() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O,0,1,I para evitar confusiones
    let parte = '';
    for (let i = 0; i < 4; i++) parte += chars[Math.floor(Math.random() * chars.length)];
    return `MQB-${parte}`;
}

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
        window.location.replace('login.html');
        return;
    }

    // Detectar rol según email
    // Código nuevo
esMozo = ROLES[user.email] !== undefined;

    await initDB();
    await initProductos();

    // ── Limpiar locks propios de sesiones anteriores al arrancar ──
    // Si la pestaña se cerró sin liberar el lock, este cleanup lo resuelve.
    await limpiarLocksDelUsuario(user.uid);

    hideLoader();
    renderStock();
    aplicarRol();
    iniciarListenerLocks();    // locks en tiempo real para todos
    iniciarListenerStock();    // usuarios en tiempo real para todos (admin y mozo)

    // Liberar lock propio si el usuario cierra la pestaña o el navegador
    window.addEventListener('beforeunload', () => {
        if (tarjetaReservadaActual) {
            // beforeunload no puede esperar async, usamos sendBeacon como fallback
            // pero también disparamos el delete (funciona si la conexión sigue)
            db.collection('locks_tarjetas').doc(tarjetaReservadaActual).delete().catch(() => {});
        }
    });
});

// ── Cerrar sesión ──────────────────────────────────────────
async function cerrarSesion() {
    // Liberar cualquier reserva activa antes de cerrar sesión
    if (tarjetaReservadaActual) {
        await liberarReservaTarjeta(tarjetaReservadaActual).catch(() => {});
    }
    firebase.auth().signOut().then(() => {
        window.location.replace('login.html');
    }).catch(() => {
        showToast('Error al cerrar sesión. Intentá de nuevo.', 'error');
    });
}

// ── Aplicar restricciones de rol ───────────────────────────
// Oculta tabs y adapta el layout según si es mozo o admin.
function aplicarRol() {
    if (!esMozo) return; // admin ve todo, nada que hacer

    // Ocultar tabs restringidos para el mozo
    const tabsOcultos = ['productos', 'tyc', 'ads'];
    tabsOcultos.forEach(t => {
        document.getElementById(`btn-tab-${t}`)?.classList.add('hidden');
    });

    // ── Inyectar estilos mejorados para tablet (modo mozo) ──
    const style = document.createElement('style');
    style.id = 'mozo-tablet-styles';
    style.textContent = `
        /* ── Navegación tablet ── */
        nav { padding: 0.6rem 1rem !important; min-height: 56px; }
        #nav-titulo { font-size: 0.9rem !important; }

        /* ── Botones de tab: agrupados y con buen tap target ── */
        .mozo-nav-tabs {
            display: flex !important;
            align-items: center !important;
            gap: 0.25rem !important;
            background: rgba(255,255,255,0.03) !important;
            border: 1px solid rgba(255,255,255,0.07) !important;
            border-radius: 0.75rem !important;
            padding: 0.25rem !important;
        }
        .mozo-nav-tabs button {
            padding: 0.45rem 0.9rem !important;
            border-radius: 0.5rem !important;
            font-size: 0.6rem !important;
            min-height: 36px !important;
            white-space: nowrap !important;
        }
        .mozo-nav-tabs button.tab-active {
            background: rgba(59,130,246,0.15) !important;
            border-bottom: none !important;
        }

        /* ── Botón salir compacto ── */
        .mozo-salir-btn {
            min-width: 36px !important;
            min-height: 36px !important;
            padding: 0.5rem !important;
            border-radius: 0.5rem !important;
            background: rgba(255,255,255,0.04) !important;
            border: 1px solid rgba(255,255,255,0.08) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .mozo-salir-btn span { display: none !important; }

        /* ── Main layout ── */
        main { padding: 0.75rem !important; }

        /* ── Sección gestión: columna única en tablet ── */
        #section-gestion { grid-template-columns: 1fr !important; gap: 1rem !important; }
        #columnaIzquierda { grid-column: span 1 !important; }
        #columnaDerecha   { grid-column: span 1 !important; }

        /* ── Panel buscar: inputs y botones touch-friendly ── */
        #buscarTarjeta { font-size: 2.2rem !important; padding: 1.1rem !important; }
        #btnBuscar { padding: 1.1rem !important; font-size: 0.95rem !important; min-height: 58px !important; }

        /* ── Panel activación ── */
        #nuevoNombre, #nuevoTel { padding: 1.1rem !important; font-size: 1rem !important; min-height: 56px !important; }
        #btnActivar { padding: 1.1rem !important; font-size: 0.95rem !important; min-height: 60px !important; }

        /* ── Botones cargar/canjear ── */
        #btnCargar, #btnCanjear { padding: 1rem !important; font-size: 0.9rem !important; min-height: 56px !important; }

        /* ── Card info del cliente: más compacta ── */
        #activaPanel .card-mini { padding: 1.1rem !important; }
        #adminNombre { font-size: 1.3rem !important; }
        #adminPuntos { font-size: 2.5rem !important; }

        /* ── Historial ── */
        #historial .text-sm  { font-size: 0.875rem !important; }
        #historial .text-[10px] { font-size: 0.65rem !important; }

        /* ── Sección stock: tabla más legible en tablet ── */
        #section-stock table th,
        #section-stock table td { padding: 0.75rem 0.875rem !important; font-size: 0.8rem !important; }
    `;
    document.head.appendChild(style);

    // ── Reorganizar la nav: agrupar tabs y mejorar el botón salir ──
    const navRight = document.querySelector('nav > div:last-child');
    if (navRight) {
        navRight.classList.add('mozo-nav-tabs');
        // Hacer el botón salir compacto en tablet
        const btnSalir = navRight.querySelector('button[onclick="cerrarSesion()"]');
        if (btnSalir) {
            btnSalir.classList.add('mozo-salir-btn');
        }
    }

    // Ocultar botón "Generar números" para mozos (solo admin puede crear tarjetas)
    const btnGenerar = document.querySelector('button[onclick="mostrarGenerador()"]');
    if (btnGenerar) btnGenerar.classList.add('hidden');

    // Indicador visual de modo mozo
    const titulo = document.getElementById('nav-titulo');
    if (titulo) {
        titulo.insertAdjacentHTML('afterend',
            '<span class="text-[9px] font-black uppercase tracking-widest text-emerald-500/60 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-2">Mozo</span>'
        );
    }
}

// ── Reserva de tarjeta (lock optimista) ────────────────────
// Escribe un documento en Firestore para marcar la tarjeta como "asignándose".
// Esto permite que otros dispositivos la vean en tiempo real y no la tomen.
async function reservarTarjeta(tarjeta) {
    const lockRef = db.collection('locks_tarjetas').doc(tarjeta);
    const userId  = firebase.auth().currentUser?.uid || 'desconocido';
    try {
        // Transacción atómica: solo reservar si no hay lock de OTRO dispositivo
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(lockRef);
            if (snap.exists) {
                const data = snap.data();
                // Lock propio (mismo uid): OK, renovar
                if (data.userId === userId) {
                    tx.set(lockRef, { userId, tarjeta, creadoEn: new Date().toISOString() });
                    return;
                }
                // Lock de otro uid: rechazar
                throw new Error('ya_reservada');
            }
            // Sin lock: crear
            tx.set(lockRef, { userId, tarjeta, creadoEn: new Date().toISOString() });
        });

        tarjetaReservadaActual = tarjeta;
        return true;
    } catch (err) {
        if (err.message === 'ya_reservada') return false;
        console.error('Error al reservar tarjeta:', err);
        return false;
    }
}

// Libera el lock de una tarjeta en Firestore
async function liberarReservaTarjeta(tarjeta) {
    if (!tarjeta) return;
    try {
        await db.collection('locks_tarjetas').doc(tarjeta).delete();
        if (tarjetaReservadaActual === tarjeta) tarjetaReservadaActual = null;
    } catch (e) { /* silencioso */ }
}

// Verifica si una tarjeta tiene un lock vigente de OTRO dispositivo.
// Si encuentra un lock expirado lo elimina automáticamente (cleanup oportunista).
async function tieneLockVigente(tarjeta) {
    try {
        const userId = firebase.auth().currentUser?.uid || 'desconocido';
        const snap = await db.collection('locks_tarjetas').doc(tarjeta).get();
        if (!snap.exists) return false;
        const data = snap.data();
        // Lock propio: nunca bloquear
        if (data.userId === userId) return false;
        // Lock expirado: limpiarlo y dejar pasar
        if (new Date(data.expiresAt) <= new Date()) {
            await db.collection('locks_tarjetas').doc(tarjeta).delete().catch(() => {});
            return false;
        }
        return true;
    } catch { return false; }
}

// ── Sincronización en tiempo real de la sección stock ──────
// Activa un listener de Firestore que actualiza la tabla cuando cambia algo
function iniciarListenerStock() {
    // Si ya hay un listener activo, no duplicarlo
    if (stockUnsubscribe) return;

    stockUnsubscribe = db.collection('usuarios').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const tarjeta = change.doc.id;
            const data = { tarjeta, ...change.doc.data() };

            if (change.type === 'added') {
                const existe = usuarios.some(u => u.tarjeta === tarjeta);
                if (!existe) usuarios.push(data);
            } else if (change.type === 'modified') {
                const idx = usuarios.findIndex(u => u.tarjeta === tarjeta);
                if (idx !== -1) usuarios[idx] = data;
                else usuarios.push(data);
            } else if (change.type === 'removed') {
                usuarios = usuarios.filter(u => u.tarjeta !== tarjeta);
            }
        });
        // Solo re-renderizar si la sección stock está visible
        const stockVisible = !document.getElementById('section-stock')?.classList.contains('hidden');
        if (stockVisible) renderStock();
    }, (err) => {
        console.error('Error en listener de stock:', err);
    });
}

function detenerListenerStock() {
    if (stockUnsubscribe) {
        stockUnsubscribe();
        stockUnsubscribe = null;
    }
}

// ── Listener de locks en tiempo real (para TODOS los usuarios) ─────
// Mantiene locksVigentesRT actualizado sin ningún round-trip a Firestore.
// Cuando un mozo reserva una tarjeta, todos los dispositivos reciben el cambio
// en ~100-300ms y la tarjeta aparece como "Asignándose…" al instante.
function iniciarListenerLocks() {
    if (locksUnsubscribe) return;
    locksUnsubscribe = db.collection('locks_tarjetas').onSnapshot((snapshot) => {
        // Cualquier documento en locks_tarjetas = tarjeta en asignación activa.
        // No hay expiración: el lock existe mientras el usuario está completando el formulario.
        locksVigentesRT.clear();
        snapshot.docs.forEach(doc => locksVigentesRT.add(doc.id));
        // Re-renderizar stock si está visible para que todos vean el cambio al instante
        const stockVisible = !document.getElementById('section-stock')?.classList.contains('hidden');
        if (stockVisible) renderStock();
    }, (err) => {
        console.error('Error en listener de locks:', err);
    });
}

// ── Limpieza de locks al iniciar sesión ─────────────────────
// Solo borra los locks que le pertenecen a ESTE usuario (sesión anterior colgada).
// Lee todos los docs (son 2-3 máximo) y filtra por userId en el cliente —
// sin query .where() que requeriría índice en Firestore.
// Los locks de otros dispositivos activos NO se tocan.
async function limpiarLocksDelUsuario(userId) {
    try {
        const snap = await db.collection('locks_tarjetas').get();
        if (snap.empty) return;
        const propios = snap.docs.filter(doc => doc.data().userId === userId);
        if (propios.length === 0) return;
        const batch = db.batch();
        propios.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log('Locks propios limpiados al iniciar:', propios.length);
    } catch (e) {
        console.warn('No se pudieron limpiar locks propios:', e);
    }
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
    lockScroll();
    setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function cerrarModalPin() {
    document.getElementById('modalPin').classList.add('hidden');
    unlockScroll();
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
        unlockScroll();
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
    // Mozo: bloquear acceso a tabs restringidos
    const tabsRestringidos = ['productos', 'tyc', 'ads'];
    if (esMozo && tabsRestringidos.includes(tab)) return;

    // Si intenta ir a Productos sin PIN verificado, pide el PIN
    if (tab === 'productos' && !productosPinVerificado) {
        abrirModalPin();
        return;
    }

    const tabs = ['gestion', 'stock', 'productos', 'tyc', 'ads'];
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

        if (tab === 'stock') { iniciarListenerStock(); renderStock(); }
        else { detenerListenerStock(); }
        if (tab === 'productos') renderPanelProductos();
        if (tab === 'tyc') cargarTyc();
        if (tab === 'ads') cargarAd();
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
    // Liberar reserva si había una activa
    if (tarjetaReservadaActual) {
        liberarReservaTarjeta(tarjetaReservadaActual);
    }
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
    if (tarjeta === TARJETA_OCULTA) {
        showToast("Esta tarjeta no existe en el sistema.", "error");
        return;
    }

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
        // ── Verificación rápida con el Set en memoria (sin round-trip) ──
        // Si el listener ya registró el lock de otro dispositivo, bloqueamos al instante.
        if (locksVigentesRT.has(tarjeta) && tarjetaReservadaActual !== tarjeta) {
            showToast("Esta tarjeta está siendo asignada por otro usuario.", "warn");
            document.getElementById("noCliente").classList.remove("hidden");
            return;
        }

        // ── Reserva atómica en Firestore (última línea de defensa contra race conditions) ──
        const reservaOk = await reservarTarjeta(tarjeta);
        if (!reservaOk) {
            showToast("Esta tarjeta está siendo asignada por otro usuario", "warn");
            document.getElementById("noCliente").classList.remove("hidden");
            return;
        }

        // Mostrar panel de activación
        modoActivacion();
        document.getElementById("buscarPanel").classList.add("hidden");
        document.getElementById("activaPanel").classList.add("hidden");
        document.getElementById("panelActivacion").classList.remove("hidden");
        const num = tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');
        document.getElementById("previewNumero").innerText = num;
        document.getElementById("previewNombre").innerText = "NOMBRE CLIENTE";
        document.getElementById("nuevoNombre").value = "";
        document.getElementById("nuevoTel").value = "";

        // Badge informativo: la tarjeta está bloqueada para otros mientras se completa
        const timerElViejo = document.getElementById('reserva-timer-badge');
        if (timerElViejo) timerElViejo.remove();
        const panelAct = document.getElementById('panelActivacion');
        if (panelAct) {
            panelAct.insertAdjacentHTML('afterbegin',
                `<div id="reserva-timer-badge" class="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0"></span>
                    <p class="text-[10px] font-black uppercase tracking-widest text-amber-400">En asignación — bloqueada para otros dispositivos</p>
                </div>`
            );
        }
    } else {
        // Tarjeta asignada: mostrar activaPanel con datos del cliente
        clienteActual = usuario;
        document.getElementById("buscarPanel").classList.add("hidden");
        document.getElementById("activaPanel").classList.remove("hidden");
        // Mozos: solo ven la info del cliente, sin botones de cargar/canjear
        if (!esMozo) {
            document.getElementById("clienteAcciones").classList.remove("hidden");
            populateSelects();
            verificarLimiteCanje();
        }
        renderCliente();
    }
}

function actualizarPreviewTarjeta() {
    const nombre = document.getElementById("nuevoNombre").value.trim();
    const preview = document.getElementById("previewNombre");
    if (preview) preview.innerText = nombre ? nombre.toUpperCase() : "NOMBRE CLIENTE";
}

async function activarTarjeta() {
    const nombre = document.getElementById("nuevoNombre").value.trim();
    const tel    = document.getElementById("nuevoTel").value.trim();
    if (!nombre || !tel) { showToast("Completá el nombre y teléfono del cliente.", "warn"); return; }

    setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', true, 'Activar Tarjeta');

    // 1. Generar PIN único de 4 dígitos fuera de la transacción
    let nuevoPin;
    let existePin = true;
    while (existePin) {
        nuevoPin = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        existePin = usuarios.some(u => u.pin === nuevoPin);
    }

    const docRef = db.collection('usuarios').doc(tarjetaBuscadaActual);
    const datosNuevos = {
        asignada: true, nombre, telefono: tel, puntos: 100, pin: nuevoPin, pinCambiado: false,
        historial: [{ idTx: generarIdTx(), fecha: new Date().toISOString().split('T')[0], descripcion: "Bono Bienvenida", puntos: 100 }]
    };

    try {
        // 2. Transacción atómica: verifica que siga libre antes de escribir.
        //    Si otro mozo activó la misma tarjeta al mismo tiempo, esto falla limpio.
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            if (!snap.exists) throw new Error('no_existe');
            if (snap.data().asignada === true) throw new Error('ya_activada');
            tx.update(docRef, datosNuevos);
        });
    } catch (err) {
        setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', false, 'Activar Tarjeta');
        if (err.message === 'ya_activada') {
            showToast('Esta tarjeta ya fue activada por otro mozo. Buscá otro número.', 'error');
        } else if (err.message === 'no_existe') {
            showToast('Tarjeta no encontrada en el sistema.', 'error');
        } else {
            showToast('Error al activar. Intentá de nuevo.', 'error');
        }
        volverAlInicio();
        return;
    }

    // 3. Sync cache local + liberar reserva
    const index = usuarios.findIndex(u => u.tarjeta === tarjetaBuscadaActual);
    if (index !== -1) usuarios[index] = { ...usuarios[index], ...datosNuevos };
    await liberarReservaTarjeta(tarjetaBuscadaActual);

    setBtnLoading('btnActivar', 'btnActivarText', 'btnActivarSpinner', false, 'Activar Tarjeta');

    // 4. Abrir modal de éxito con QR
    document.getElementById('modalPinNombre').innerText = nombre;
    const urlQR = `https://masqueburgers.com.ar/pin.html?pin=${nuevoPin}`;
    const qrContainer = document.getElementById('qrActivacionContainer');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: urlQR, width: 180, height: 180,
        colorDark: '#ffffff', colorLight: '#0a0a10',
        correctLevel: QRCode.CorrectLevel.M
    });

    document.getElementById('modalPinActivacion').classList.remove('hidden');
    const pinTextoEl = document.getElementById('pinActivacionTexto');
    if (pinTextoEl) pinTextoEl.textContent = nuevoPin;
    lockScroll();

    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoTel").value = "";
}

function cerrarModalPinActivacion() {
    document.getElementById('modalPinActivacion').classList.add('hidden');
    unlockScroll();
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
    const btnAnular = document.getElementById("btnAnularGestion");
    cont.innerHTML = "";

    if (clienteActual.historial.length === 0) {
        cont.innerHTML = `<div class="p-10 text-center text-slate-500 italic">Sin movimientos.</div>`;
        if (btnAnular) btnAnular.classList.add("hidden");
        return;
    }

    const historialRev = [...clienteActual.historial].reverse();
    const ultimo = clienteActual.historial[clienteActual.historial.length - 1];
    const puedeAnular = ultimo && !ultimo.descripcion.startsWith('Anulación:');
    if (btnAnular) btnAnular.classList.toggle("hidden", !puedeAnular);

    historialRev.forEach((h, index, array) => {
        const esSuma  = h.puntos > 0;
        const esUltimo = index === 0 && puedeAnular;
        
        // Verificamos si tiene ID (los movimientos viejos antes de esta actualización no tendrán)
        const txIdText = h.idTx ? `<span class="ml-2 text-blue-400/80 font-mono tracking-widest bg-blue-500/10 px-1.5 py-0.5 rounded text-[8px]">ID: ${h.idTx}</span>` : '';

        cont.innerHTML += `
            <div class="flex justify-between items-center p-5 ${index !== array.length - 1 ? 'border-b border-white/5' : ''} ${esUltimo ? 'bg-amber-500/[0.04] border-l-2 border-l-amber-500/30' : ''}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${esSuma ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                        ${esSuma ? '↑' : '↓'}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <p class="text-sm font-bold text-slate-200">${h.descripcion}</p>
                            ${esUltimo ? `<span class="text-[9px] font-black uppercase tracking-widest text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded-full">Último</span>` : ''}
                        </div>
                        <div class="flex items-center mt-0.5">
                            <p class="text-[10px] text-slate-500 uppercase font-black">${h.fecha}</p>
                            ${txIdText}
                        </div>
                    </div>
                </div>
                <span class="font-black ${esSuma ? 'text-emerald-400' : 'text-rose-400'} text-lg">
                    ${esSuma ? '+' : ''}${h.puntos}
                </span>
            </div>`;
    });
}
// Anular directamente desde la pantalla de gestión sin abrir modales intermedios
function anularDesdeGestion() {
    if (!clienteActual || !clienteActual.historial || clienteActual.historial.length === 0) return;

    const ultimo = clienteActual.historial[clienteActual.historial.length - 1];

    if (ultimo.descripcion.startsWith('Anulación:')) {
        showToast('No se puede anular una anulación.', 'warn');
        return;
    }

    showConfirm({
        titulo: 'Anular movimiento',
        mensaje: `¿Anular "${ultimo.descripcion}" (${ultimo.puntos > 0 ? '+' : ''}${ultimo.puntos} pts)?`,
        tipo: 'warn',
        labelAceptar: 'Anular',
        onAceptar: async () => {
            const puntosRevertidos = -ultimo.puntos;
            clienteActual.puntos += puntosRevertidos;
            clienteActual.historial.push({
                idTx: generarIdTx(),
                fecha: new Date().toISOString().split('T')[0],
                descripcion: `Anulación: ${ultimo.descripcion}`,
                puntos: puntosRevertidos
            });
            await updateUsuario(clienteActual);
            // Sync local cache
            const idx = usuarios.findIndex(u => u.tarjeta === clienteActual.tarjeta);
            if (idx !== -1) usuarios[idx] = clienteActual;
            renderCliente();
            verificarLimiteCanje();
            showToast(`Anulado. Puntos ajustados a ${clienteActual.puntos}.`, 'success');
        }
    });
}
function populateSelects() {
    const acreditar = document.getElementById("selectProductoAgregar");
    const debitar   = document.getElementById("selectProductoRestar");
    if (!acreditar || !debitar) return;

    const categorias = [...new Set(productos.map(p => p.categoria || 'General'))];

    const buildGrouped = (lista, camtoPuntos) => {
        if (!lista.length) return '<option value="" disabled>Sin productos cargados</option>';
        let html = '<option value="">Seleccioná un producto…</option>';
        categorias.forEach(cat => {
            const grupo = lista.filter(p => (p.categoria || 'General') === cat);
            if (grupo.length) {
                html += `<optgroup label="— ${cat} —">${
                    grupo.map(p => {
                        const pts = p[camtoPuntos] ?? p.puntos ?? 0;
                        return `<option value="${p.id}">${p.nombre} — ${pts} pts</option>`;
                    }).join('')
                }</optgroup>`;
            }
        });
        return html;
    };

    // En cargar: productos con aparece 'carga' o 'ambos' (o sin campo aparece y canjeable cualquier cosa)
    const prodCargar = productos.filter(p => {
        const ap = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
        return ap === 'carga' || ap === 'ambos';
    });
    // En canje: productos con aparece 'canje' o 'ambos'
    const prodCanje = productos.filter(p => {
        const ap = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
        return ap === 'canje' || ap === 'ambos';
    });

    acreditar.innerHTML = buildGrouped(prodCargar, 'puntosCargar');
    debitar.innerHTML   = buildGrouped(prodCanje,  'puntosCanje');
    document.getElementById("previewPuntosAgregar")?.classList.add("hidden");
    document.getElementById("previewPuntosRestar")?.classList.add("hidden");
}

// ── MODAL SELECTOR DE PRODUCTOS ───────────────────────────────────
let modalModoActual = null;   // 'carga' | 'canje'
let productoSeleccionado = null;

function abrirModalProductos(modo) {
    if (esMozo) return; // mozos no pueden cargar ni canjear
    modalModoActual = modo;
    productoSeleccionado = null;
    document.getElementById('modalProdBuscador').value = '';

    const esCarga = modo === 'carga';
    const icono   = esCarga
        ? `<div class="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#34d399" stroke-width="2.5" stroke-linecap="round"/></svg></div>`
        : `<div class="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 4l-4 4 4 4" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8h14a4 4 0 014 4v1" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/><path d="M17 20l4-4-4-4" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 16H7a4 4 0 01-4-4v-1" stroke="#fb7185" stroke-width="2.5" stroke-linecap="round"/></svg></div>`;

    document.getElementById('modalProdIcono').innerHTML    = icono;
    document.getElementById('modalProdTitulo').textContent = esCarga ? 'Cargar Compra' : 'Registrar Canje';
    document.getElementById('modalProdSubtitulo').textContent = esCarga ? 'Seleccioná el producto consumido' : 'Seleccioná el premio a canjear';

    renderModalGrid('');
    document.getElementById('modalProductos').classList.remove('hidden');
    lockScroll();
    setTimeout(() => document.getElementById('modalProdBuscador').focus(), 150);
}

function cerrarModalProductos() {
    document.getElementById('modalProductos').classList.add('hidden');
    document.getElementById('modalConfirmOp').classList.add('hidden');
    unlockScroll();
    modalModoActual = null;
    productoSeleccionado = null;
}

function filtrarModalProductos() {
    const q = document.getElementById('modalProdBuscador').value;
    renderModalGrid(q);
}

function renderModalGrid(query) {
    const grid  = document.getElementById('modalProdGrid');
    const vacio = document.getElementById('modalProdVacio');
    const q     = query.toLowerCase().trim();
    const esCarga = modalModoActual === 'carga';

    const lista = productos.filter(p => {
        const ap = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
        const ok = esCarga ? (ap === 'carga' || ap === 'ambos') : (ap === 'canje' || ap === 'ambos');
        if (!ok) return false;
        if (q) return p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q);
        return true;
    });

    if (!lista.length) {
        grid.innerHTML = '';
        vacio.classList.remove('hidden');
        return;
    }
    vacio.classList.add('hidden');

    // Agrupar por categoría
    const cats = [...new Set(lista.map(p => p.categoria || 'General'))];
    let html = '';
    cats.forEach(cat => {
        const grupo = lista.filter(p => (p.categoria || 'General') === cat);
        html += `<p class="text-[9px] uppercase font-black tracking-widest mb-2 mt-4 first:mt-0" style="color:#475569">${cat}</p>`;
        html += `<div class="grid grid-cols-2 gap-3">`;
        grupo.forEach(p => {
            const pts     = esCarga ? (p.puntosCargar ?? p.puntos ?? 0) : (p.puntosCanje ?? p.puntos ?? 0);
            const color   = esCarga ? '#34d399' : '#fb7185';
            const prefix  = esCarga ? '+' : '-';
            const tieneImg = p.imagen && p.imagen.trim() !== '';
            html += `
                <button onclick="seleccionarProductoModal('${p.id}')"
                    class="rounded-2xl overflow-hidden border border-white/6 hover:border-white/20 transition-all active:scale-95 text-left flex flex-col"
                    style="background:rgba(255,255,255,0.03);">
                    <div class="w-full h-24 bg-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                        ${tieneImg
                            ? `<img src="${p.imagen}" alt="${p.nombre}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span style=\\'font-size:2rem\\'>🍔</span>'">`
                            : `<span style="font-size:2rem">🍔</span>`}
                    </div>
                    <div class="p-3 flex flex-col gap-1 flex-1">
                        <p class="text-[11px] font-bold text-white leading-tight">${p.nombre}</p>
                        <p class="text-[10px] font-black mt-auto" style="color:${color}">${prefix}${pts} pts</p>
                    </div>
                </button>`;
        });
        html += `</div>`;
    });
    grid.innerHTML = html;
}

function seleccionarProductoModal(id) {
    const prod = productos.find(p => p.id === id);
    if (!prod) return;
    productoSeleccionado = prod;

    const esCarga = modalModoActual === 'carga';
    const pts     = esCarga ? (prod.puntosCargar ?? prod.puntos ?? 0) : (prod.puntosCanje ?? prod.puntos ?? 0);
    const puede   = !esCarga ? (clienteActual && pts <= clienteActual.puntos) : true;

    // Imagen
    const imgWrap = document.getElementById('confirmOpImgWrap');
    const img     = document.getElementById('confirmOpImg');
    if (prod.imagen && prod.imagen.trim()) {
        img.src = prod.imagen;
        imgWrap.classList.remove('hidden');
    } else {
        imgWrap.classList.add('hidden');
    }

    // Textos
    document.getElementById('confirmOpEtiqueta').textContent  = esCarga ? '✦ Cargando producto' : '⇄ Canjeando premio';
    document.getElementById('confirmOpEtiqueta').style.color  = esCarga ? '#34d399' : '#fb7185';
    document.getElementById('confirmOpNombre').textContent    = prod.nombre;
    document.getElementById('confirmOpCategoria').textContent = prod.categoria || 'General';

    // Puntos
    const box = document.getElementById('confirmOpPuntosBox');
    box.style.background = esCarga ? 'rgba(52,211,153,0.06)' : 'rgba(251,113,133,0.06)';
    box.style.border     = esCarga ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(251,113,133,0.2)';
    document.getElementById('confirmOpPuntosLabel').textContent = esCarga ? 'Puntos a acreditar' : 'Puntos a descontar';
    document.getElementById('confirmOpPuntosLabel').style.color = esCarga ? '#34d399' : '#fb7185';
    document.getElementById('confirmOpPuntosVal').textContent   = `${esCarga ? '+' : '-'}${pts}`;
    document.getElementById('confirmOpPuntosVal').style.color   = esCarga ? '#34d399' : (puede ? '#fb7185' : '#fbbf24');

    const aviso = document.getElementById('confirmOpAviso');
    if (!esCarga && !puede) {
        aviso.textContent = '⚠ Puntos insuficientes para este canje';
        aviso.style.color = '#fbbf24';
        aviso.classList.remove('hidden');
    } else {
        aviso.classList.add('hidden');
    }

    // Botón confirmar
    const btn = document.getElementById('confirmOpBtn');
    document.getElementById('confirmOpBtnText').textContent = esCarga ? 'Acreditar' : 'Canjear';
    btn.disabled = !puede && !esCarga;
    if (esCarga) {
        btn.className = 'flex-2 flex-grow py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30';
    } else if (puede) {
        btn.className = 'flex-2 flex-grow py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30';
    } else {
        btn.className = 'flex-2 flex-grow py-3.5 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-slate-700 text-slate-400 cursor-not-allowed opacity-60';
    }

    document.getElementById('modalProductos').classList.add('hidden');
    document.getElementById('modalConfirmOp').classList.remove('hidden');
}

function volverAModalProductos() {
    document.getElementById('modalConfirmOp').classList.add('hidden');
    document.getElementById('modalProductos').classList.remove('hidden');
}

async function confirmarOperacion() {
    if (!productoSeleccionado || !modalModoActual) return;
    const esCarga = modalModoActual === 'carga';
    const pts     = esCarga
        ? (productoSeleccionado.puntosCargar ?? productoSeleccionado.puntos ?? 0)
        : (productoSeleccionado.puntosCanje  ?? productoSeleccionado.puntos ?? 0);

    if (!esCarga && pts > clienteActual.puntos) { showToast('Puntos insuficientes.', 'error'); return; }

    const btnText    = document.getElementById('confirmOpBtnText');
    const btnSpinner = document.getElementById('confirmOpSpinner');
    const btn        = document.getElementById('confirmOpBtn');
    btn.disabled = true; btnText.textContent = ''; btnSpinner.classList.remove('hidden');

    if (esCarga) {
        clienteActual.puntos += pts;
        clienteActual.historial.push({ idTx: generarIdTx(), fecha: new Date().toISOString().split('T')[0], descripcion: productoSeleccionado.nombre, puntos: pts });
    } else {
        clienteActual.puntos -= pts;
        clienteActual.historial.push({ idTx: generarIdTx(), fecha: new Date().toISOString().split('T')[0], descripcion: `Canje: ${productoSeleccionado.nombre}`, puntos: -pts });
    }

    await updateUsuario(clienteActual);

    btn.disabled = false; btnText.textContent = esCarga ? 'Acreditar' : 'Canjear'; btnSpinner.classList.add('hidden');

    cerrarModalProductos();
    renderCliente();
    if (esCarga) verificarLimiteCanje();

    showToast(
        esCarga
            ? `✓ +${pts} pts — ${productoSeleccionado.nombre}`
            : `✓ Canje registrado — ${productoSeleccionado.nombre}`,
        'success'
    );
}

// Mantener funciones legacy para compatibilidad interna (populateSelects las usa internamente)
function onSelectProductoAgregar() {}
function onSelectProductoRestar() {}

async function agregarPuntos() {}
async function restarPuntos() {}

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

    // Usar el Set en memoria mantenido por el listener en tiempo real (sin round-trip a Firestore)
    const locksVigentes = locksVigentesRT;

    let lista = usuarios.filter(u => {
        if (u.tarjeta === TARJETA_OCULTA) return false; // tarjeta oculta
        const enLockFiltro = locksVigentesRT.has(u.tarjeta);
        if (filtroActual === 'libre'    && u.asignada) return false;
        if (filtroActual === 'asignada' && !u.asignada && !enLockFiltro) return false;
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
        const enLock = !u.asignada && locksVigentes.has(u.tarjeta);
        const estadoBadge = u.asignada
            ? `<span class="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-green-900/40 text-green-500">Asignada</span>
               ${u.pin ? `<span class="block mt-2 text-[10px] text-green-400 font-mono tracking-widest font-bold">PIN: ${u.pin}</span>` : ''}`
            : enLock
                ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                       <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                       Asignándose…
                   </span>`
                : `<span class="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500">Libre</span>`;

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
                <td class="p-5">${estadoBadge}</td>
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
                        ${!esMozo ? `
                        <button onclick="resetearPuntosDesdeTabla('${u.tarjeta}')" 
                            class="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/10 transition-all">
                            Resetear
                        </button>
                        <button onclick="eliminarDesdeTabla('${u.tarjeta}')" 
                            class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/10 transition-all">
                            Eliminar
                        </button>
                        ` : ''}
                    </div>` : enLock && !esMozo ? `
                    <button onclick="liberarLockDesdeTabla('${u.tarjeta}')" 
                        class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/10 transition-all flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                        Liberar
                    </button>` : enLock ? `<span class="text-[10px] text-amber-400/60 font-bold italic">En proceso…</span>` : ''}
                </td>
            </tr>`;

            }); // cierra el forEach

} // cierra renderStock()

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
    lockScroll();
    document.getElementById('editNombre').focus();
}

function cerrarModalEditar() {
    document.getElementById('modalEditarTarjeta').classList.add('hidden');
    unlockScroll();
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
    lockScroll();

    // Clonar para limpiar listeners anteriores
    const newAcep = btnAcep.cloneNode(true);
    const newCan  = btnCan.cloneNode(true);
    btnAcep.parentNode.replaceChild(newAcep, btnAcep);
    btnCan.parentNode.replaceChild(newCan, btnCan);

    newAcep.textContent = labelAceptar;
    newAcep.className   = btnAcep.className || newAcep.className;

    newAcep.addEventListener('click', () => {
        modal.classList.add('hidden');
        unlockScroll();
        onAceptar();
    });
    newCan.addEventListener('click', () => {
        modal.classList.add('hidden');
        unlockScroll();
    });
}

// ── Eliminar directamente desde la tabla sin abrir el modal de edición
async function liberarLockDesdeTabla(tarjeta) {
    showConfirm({
        titulo: 'Liberar tarjeta',
        mensaje: `¿Liberar la tarjeta ${tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2')} que quedó en estado "Asignándose"? Quedará disponible nuevamente.`,
        tipo: 'warn',
        labelAceptar: 'Liberar',
        onAceptar: async () => {
            try {
                await db.collection('locks_tarjetas').doc(tarjeta).delete();
                showToast('Tarjeta liberada correctamente.', 'success');
            } catch(e) {
                showToast('Error al liberar la tarjeta.', 'error');
            }
        }
    });
}

async function resetearPuntosDesdeTabla(tarjeta) {
    const u = usuarios.find(x => x.tarjeta === tarjeta);
    if (!u) return;

    if (u.puntos === 0) {
        showToast('El cliente ya tiene 0 puntos.', 'warn');
        return;
    }

    showConfirm({
        titulo: 'Resetear puntos',
        mensaje: `¿Resetear los puntos de ${u.nombre}? Sus ${u.puntos} puntos quedarán en 0. El cliente y su historial se conservan.`,
        tipo: 'warn',
        labelAceptar: 'Resetear',
        onAceptar: async () => {
            const puntosAnteriores = u.puntos;
            u.historial.push({
                idTx: generarIdTx(),
                fecha: new Date().toISOString().split('T')[0],
                descripcion: `Reset manual (−${puntosAnteriores} pts)`,
                puntos: -puntosAnteriores
            });
            u.puntos = 0;
            await updateUsuario(u);
            showToast(`Puntos de ${u.nombre} reseteados a 0.`, 'success');
            if (clienteActual && clienteActual.tarjeta === tarjeta) buscarCliente();
            renderStock();
        }
    });
}

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
            // Eliminar también el registro de TyC del cliente
            await db.collection("tyc_aceptaciones").doc(tarjeta).delete().catch(() => {});
            // Limpiar del cache local de TyC para que no reaparezca sin recargar
            tycData = tycData.filter(r => r.tarjeta !== tarjeta);
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
            // Eliminar también el registro de TyC del cliente
            await db.collection("tyc_aceptaciones").doc(tarjetaEditandoActual).delete().catch(() => {});
            // Limpiar del cache local de TyC para que no reaparezca sin recargar
            tycData = tycData.filter(r => r.tarjeta !== tarjetaEditandoActual);
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
                idTx: generarIdTx(),
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

// ── Selector visual de dónde aparece el producto ───────────
function setAparece(valor) {
    document.getElementById('formProdAparece').value = valor;

    // Reset todos los botones
    document.querySelectorAll('.aparece-btn').forEach(b => {
        b.classList.remove('border-emerald-500', 'text-emerald-400', 'bg-emerald-500/10',
                           'border-rose-500',    'text-rose-400',    'bg-rose-500/10',
                           'border-blue-500',    'text-blue-400',    'bg-blue-500/10',
                           'border-slate-400',   'text-slate-300',   'bg-slate-700/40');
        b.classList.add('border-slate-700', 'bg-slate-900', 'text-slate-400');
    });

    // Resaltar el elegido
    const colores = {
        carga: ['border-emerald-500', 'text-emerald-400', 'bg-emerald-500/10'],
        canje: ['border-rose-500',    'text-rose-400',    'bg-rose-500/10'],
        ambos: ['border-blue-500',    'text-blue-400',    'bg-blue-500/10'],
        otro:  ['border-slate-400',   'text-slate-300',   'bg-slate-700/40'],
    };
    const btn = document.getElementById(`btn-aparece-${valor}`);
    if (btn) {
        btn.classList.remove('border-slate-700', 'bg-slate-900', 'text-slate-400');
        colores[valor].forEach(c => btn.classList.add(c));
    }

    // Mostrar/ocultar bloques de puntos
    const bc = document.getElementById('bloquePuntosCargar');
    const bj = document.getElementById('bloquePuntosCanje');
    bc.classList.toggle('hidden', valor === 'canje' || valor === 'otro');
    bj.classList.toggle('hidden', valor === 'carga' || valor === 'otro');
}

// Estado del filtro de productos
let prodFiltroActivo = 'todos';

function setProdFiltro(filtro) {
    prodFiltroActivo = filtro;
    const ids = ['todos', 'carga', 'canje', 'ambos', 'otro'];
    ids.forEach(id => {
        const btn = document.getElementById(`pfiltro-${id}`);
        if (!btn) return;
        btn.classList.toggle('filtro-active', id === filtro);
        if (id === filtro) btn.classList.remove('filtro-btn');
        else btn.classList.add('filtro-btn');
    });
    renderPanelProductos();
}

function renderPanelProductos() {
    const lista = document.getElementById("listaProductos");
    const vacio = document.getElementById("prodVacio");
    const contador = document.getElementById("prodContador");
    if (!lista) return;
    lista.innerHTML = "";

    const q = (document.getElementById('prodBuscador')?.value || '').toLowerCase().trim();

    let filtrados = productos.filter(p => {
        const aparece = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
        const matchFiltro = prodFiltroActivo === 'todos' || aparece === prodFiltroActivo;
        const matchBusca = !q ||
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.categoria || '').toLowerCase().includes(q);
        return matchFiltro && matchBusca;
    });

    // Contador
    if (contador) {
        contador.textContent = `${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''} · ${productos.length} en total`;
    }

    if (filtrados.length === 0) {
        lista.innerHTML = '';
        if (vacio) vacio.classList.remove('hidden');
        populateSelects();
        return;
    }
    if (vacio) vacio.classList.add('hidden');

    const categorias = [...new Set(filtrados.map(p => p.categoria || 'General'))];
    categorias.forEach(cat => {
        const grupo = filtrados.filter(p => (p.categoria || 'General') === cat);
        lista.innerHTML += `<div class="col-span-full text-[10px] font-black uppercase tracking-widest text-slate-500 pt-2 pb-1 border-b border-white/5">${cat}</div>`;
        grupo.forEach(p => {
            const tieneImg = p.imagen && p.imagen.trim() !== '';
            const aparece = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
            const badgeInfo = {
                carga: ['bg-emerald-600/80', '＋ Carga'],
                canje: ['bg-rose-500/80',    '⇄ Canje'],
                ambos: ['bg-blue-600/80',    '✦ Ambos'],
                otro:  ['bg-slate-600/80',   '○ Oculto'],
            }[aparece] || ['bg-slate-600/80', '○ Oculto'];
            lista.innerHTML += `
                <div class="glass rounded-2xl overflow-hidden flex flex-col group hover:bg-white/[0.04] transition-all">
                    <div class="w-full h-40 bg-slate-900 overflow-hidden flex items-center justify-center relative">
                        ${tieneImg
                            ? `<img src="${p.imagen}" alt="${p.nombre}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                   onerror="this.parentElement.innerHTML='<span class=\\'text-4xl\\'>🍔</span>'">`
                            : `<span class="text-4xl">🍔</span>`
                        }
                        <span class="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[9px] font-black backdrop-blur-md text-white ${badgeInfo[0]}">
                            ${badgeInfo[1]}
                        </span>
                    </div>
                    <div class="p-5 flex flex-col gap-3 flex-1">
                        <div>
                            <p class="font-bold text-white text-sm leading-tight">${p.nombre}</p>
                            <p class="text-[10px] text-slate-500 mt-0.5 uppercase font-semibold">${p.categoria || 'General'}</p>
                        </div>
                        <div class="flex flex-col gap-2 border-t border-white/5 pt-3 mt-auto">
                            <div class="flex items-center justify-between">
                                ${(aparece === 'carga' || aparece === 'ambos') ? `<span class="text-sm font-black text-emerald-400">+${p.puntosCargar ?? p.puntos ?? 0} <span class="text-[10px] font-bold text-slate-500">al cargar</span></span>` : ''}
                                ${(aparece === 'canje' || aparece === 'ambos') ? `<span class="text-sm font-black text-rose-400">-${p.puntosCanje ?? p.puntos ?? 0} <span class="text-[10px] font-bold text-slate-500">al canjear</span></span>` : ''}
                                ${aparece === 'otro' ? `<span class="text-xs text-slate-600 italic font-bold">Sin puntos definidos</span>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editarProducto('${p.id}')" class="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-blue-800/30 text-slate-400 hover:text-blue-400 text-[10px] font-bold border border-white/5 transition-all">Editar</button>
                                <button onclick="confirmarEliminar('${p.id}')" class="flex-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 border border-rose-500/10 transition-all">Eliminar</button>
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
    document.getElementById("formProdPuntosCargar").value = "";
    document.getElementById("formProdPuntosCanje").value  = "";
    document.getElementById("formProdAparece").value   = "";
    document.getElementById("formProdImagen").value    = "";
    document.getElementById("imgPreview").classList.add("hidden");
    document.getElementById("imgPreviewPlaceholder").classList.remove("hidden");
    document.getElementById("tituloFormProd").textContent    = "Nuevo Producto";
    document.getElementById("btnGuardarProdText").textContent = "Guardar Producto";
    // Reset visual botones aparece
    document.querySelectorAll('.aparece-btn').forEach(b => {
        b.classList.remove('border-emerald-500','text-emerald-400','bg-emerald-500/10',
                           'border-rose-500','text-rose-400','bg-rose-500/10',
                           'border-blue-500','text-blue-400','bg-blue-500/10',
                           'border-slate-400','text-slate-300','bg-slate-700/40');
        b.classList.add('border-slate-700','bg-slate-900','text-slate-400');
    });
    document.getElementById('bloquePuntosCargar').classList.add('hidden');
    document.getElementById('bloquePuntosCanje').classList.add('hidden');
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
    // Compatibilidad con registros viejos
    const aparece = p.aparece || (p.canjeable === false ? 'carga' : 'ambos');
    document.getElementById("formProdNombre").value    = p.nombre;
    document.getElementById("formProdCategoria").value = p.categoria || "";
    document.getElementById("formProdPuntosCargar").value = p.puntosCargar ?? p.puntos ?? "";
    document.getElementById("formProdPuntosCanje").value  = p.puntosCanje  ?? p.puntos ?? "";
    document.getElementById("formProdImagen").value    = p.imagen || "";
    document.getElementById("tituloFormProd").textContent    = "Editar Producto";
    document.getElementById("btnGuardarProdText").textContent = "Guardar Cambios";
    setAparece(aparece);
    previewImagen();
    document.getElementById("formProducto").classList.remove("hidden");
    document.getElementById("formProdNombre").focus();
}

async function guardarProducto() {
    const nombre    = document.getElementById("formProdNombre").value.trim();
    const categoria = document.getElementById("formProdCategoria").value.trim() || "General";
    const aparece   = document.getElementById("formProdAparece").value;
    const imagen    = document.getElementById("formProdImagen").value.trim();

    if (!nombre) { showToast("Completá el nombre del producto.", "warn"); return; }
    if (!aparece) { showToast("Elegí dónde aparece el producto.", "warn"); return; }

    const puntosCargar = Number(document.getElementById("formProdPuntosCargar").value) || 0;
    const puntosCanje  = Number(document.getElementById("formProdPuntosCanje").value)  || 0;

    if ((aparece === 'carga' || aparece === 'ambos') && !puntosCargar) {
        showToast("Ingresá los puntos que suma al cargar.", "warn"); return;
    }
    if ((aparece === 'canje' || aparece === 'ambos') && !puntosCanje) {
        showToast("Ingresá los puntos que cuesta el canje.", "warn"); return;
    }

    // Campo legacy 'puntos' y 'canjeable' para compatibilidad con otros módulos
    const canjeable = aparece === 'canje' || aparece === 'ambos';
    const puntos    = aparece === 'carga' ? puntosCargar : (aparece === 'canje' ? puntosCanje : puntosCargar);

    setBtnLoading('btnGuardarProd', 'btnGuardarProdText', 'btnGuardarProdSpinner', true, 'Guardar Producto');
    const prod = { nombre, categoria, aparece, puntosCargar, puntosCanje, puntos, canjeable, imagen };
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

// ── LÓGICA DE LÍMITE DIARIO DE CARGA ──────────────────────────────
function verificarLimiteCanje() {
    if (!clienteActual) return;
    const hoy = new Date().toISOString().split('T')[0];

    let cargasHoy = 0;
    let anulacionesHoy = 0;

    // Contamos cargas del día (movimientos positivos que NO son el bono de bienvenida)
    clienteActual.historial.forEach(h => {
        if (h.fecha === hoy) {
            if (h.puntos > 0 && !h.descripcion.startsWith('Bono') && !h.descripcion.startsWith('Anulación:')) cargasHoy++;
            if (h.descripcion.startsWith('Anulación:') && h.puntos < 0) anulacionesHoy++;
        }
    });

    const yaCargoHoy = (cargasHoy - anulacionesHoy) > 0;

    const contNormal  = document.getElementById("contenedorCargarNormal");
    const contBloqueo = document.getElementById("mensajeBloqueoCargar");

    if (contNormal && contBloqueo) {
        if (yaCargoHoy) {
            contNormal.classList.add("hidden");
            contBloqueo.classList.remove("hidden");
        } else {
            contNormal.classList.remove("hidden");
            contBloqueo.classList.add("hidden");
        }
    }
}

// ── Términos y Condiciones ──────────────────────────────────
let tycData = [];
let tycCargado = false;

async function cargarTyc() {
    if (tycCargado) { renderTyc(); return; }
    document.getElementById('tycSkeleton')?.classList.remove('hidden');
    document.getElementById('tablaTyc').innerHTML = '';
    document.getElementById('tycVacio')?.classList.add('hidden');

    try {
        const snapshot = await db.collection("tyc_aceptaciones").get();
        tycData = snapshot.docs.map(doc => doc.data());
        tycCargado = true;
    } catch (e) {
        console.error("Error cargando TyC:", e);
        showToast('Error al cargar las aceptaciones.', 'error');
    }

    document.getElementById('tycSkeleton')?.classList.add('hidden');
    renderTyc();
}

function recargarTyc() {
    tycCargado = false;
    tycData = [];
    // Spin the icon
    const icon = document.getElementById('iconRecargarTyc');
    if (icon) { icon.style.transition = 'transform 0.6s'; icon.style.transform = 'rotate(360deg)'; setTimeout(() => { icon.style.transform = ''; }, 700); }
    cargarTyc();
}

function renderTyc() {
    const q = (document.getElementById('tycBuscador')?.value || '').toLowerCase().trim();
    const dataVisible = tycData.filter(r => r.tarjeta !== TARJETA_OCULTA); // ocultar cuenta fantasma
    const filtrados = dataVisible.filter(r =>
        (r.nombre || '').toLowerCase().includes(q) ||
        (r.tarjeta || '').toLowerCase().includes(q)
    );

    const tbody = document.getElementById('tablaTyc');
    const vacio = document.getElementById('tycVacio');
    const contador = document.getElementById('tycContador');

    const aceptados = dataVisible.filter(r => r.aceptado).length;
    contador.textContent = `${aceptados} aceptación${aceptados !== 1 ? 'es' : ''} · ${dataVisible.length} registro${dataVisible.length !== 1 ? 's' : ''} totales`;

    if (filtrados.length === 0) {
        tbody.innerHTML = '';
        vacio?.classList.remove('hidden');
        return;
    }
    vacio?.classList.add('hidden');

    tbody.innerHTML = filtrados
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .map((r, i) => {
            const tarjetaFmt = (r.tarjeta || '').replace(/(\d{4})(\d{4})/, '$1 $2');
            const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const esPar = i % 2 === 0;
            return `
            <tr class="${esPar ? '' : 'bg-white/[0.015]'} border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                <td class="p-5">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <span class="text-xs font-black text-blue-400">${(r.nombre || '?')[0].toUpperCase()}</span>
                        </div>
                        <span class="text-sm font-bold text-white">${r.nombre || '—'}</span>
                    </div>
                </td>
                <td class="p-5">
                    <span class="font-mono text-sm text-blue-300/70 tracking-[0.15em]">${tarjetaFmt || '—'}</span>
                </td>
                <td class="p-5">
                    ${r.aceptado
                        ? `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                               <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                               Aceptó
                           </span>`
                        : `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20">
                               <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
                               Rechazó
                           </span>`
                    }
                </td>
                <td class="p-5">
                    <span class="text-xs text-slate-500 font-semibold">${fecha}</span>
                </td>
            </tr>`;
        }).join('');
}

// ══════════════════════════════════════════════════════════════
// MÓDULO ADS — Gestión del banner publicitario en la app cliente
// ══════════════════════════════════════════════════════════════

let adActivoActual = false; // estado local del toggle

// Carga la config de publicidad desde Firebase y llena el formulario
async function cargarAd() {
    try {
        const docSnap = await db.collection('config').doc('publicidad').get();
        if (docSnap.exists) {
            const d = docSnap.data();
            document.getElementById('adTag').value       = d.tag       || '';
            document.getElementById('adTitulo').value    = d.titulo    || '';
            document.getElementById('adSubtitulo').value = d.subtitulo || '';
            document.getElementById('adImagen').value    = d.imagen    || '';
            adActivoActual = !!d.activa;
            actualizarEstadoFirebase(d);
        } else {
            adActivoActual = false;
            actualizarEstadoFirebase(null);
        }
        aplicarToggleUI(adActivoActual);
        actualizarPreviewAd();
    } catch (e) {
        console.error('Error cargando publicidad:', e);
        showToast('No se pudo cargar la configuración de publicidad.', 'error');
    }
}

// Guarda la config en Firebase
async function guardarAd() {
    const titulo  = document.getElementById('adTitulo').value.trim();
    const imagen  = document.getElementById('adImagen').value.trim();
    const tag     = document.getElementById('adTag').value.trim();
    const sub     = document.getElementById('adSubtitulo').value.trim();

    if (!titulo || !imagen) {
        showToast('El título y la URL de imagen son obligatorios.', 'warn');
        return;
    }

    setBtnLoading('btnGuardarAd', 'btnGuardarAdText', 'btnGuardarAdSpinner', true, 'Guardar');

    try {
        const payload = {
            activa:    adActivoActual,
            titulo,
            subtitulo: sub,
            tag:       tag || 'Promo activa',
            imagen,
            updatedAt: new Date().toISOString()
        };
        await db.collection('config').doc('publicidad').set(payload);
        actualizarEstadoFirebase(payload);
        showToast(adActivoActual ? '¡Banner guardado y activo!' : 'Banner guardado (inactivo).', 'success');
    } catch (e) {
        console.error('Error guardando publicidad:', e);
        showToast('Error al guardar. Revisá la consola.', 'error');
    } finally {
        setBtnLoading('btnGuardarAd', 'btnGuardarAdText', 'btnGuardarAdSpinner', false, 'Guardar');
    }
}

// Alterna activo/inactivo
function toggleAdActivo() {
    adActivoActual = !adActivoActual;
    aplicarToggleUI(adActivoActual);
}

function aplicarToggleUI(activo) {
    const thumb = document.getElementById('adToggleThumb');
    const btn   = document.getElementById('adToggleBtn');
    const label = document.getElementById('adToggleLabel');
    if (activo) {
        thumb.style.transform    = 'translateX(20px)';
        thumb.style.background   = '#2563eb';
        btn.style.background     = 'rgba(37,99,235,0.25)';
        btn.style.borderColor    = 'rgba(37,99,235,0.4)';
        label.textContent        = 'Activo';
        label.className          = 'text-[10px] font-black uppercase tracking-widest text-blue-400';
    } else {
        thumb.style.transform    = 'translateX(0)';
        thumb.style.background   = '#475569';
        btn.style.background     = '';
        btn.style.borderColor    = '';
        label.textContent        = 'Inactivo';
        label.className          = 'text-[10px] font-black uppercase tracking-widest text-slate-600';
    }
}

// Actualiza la preview en tiempo real mientras el admin escribe
function actualizarPreviewAd() {
    const tag   = document.getElementById('adTag').value.trim()    || 'Promo activa';
    const titulo= document.getElementById('adTitulo').value.trim() || 'Tu título aparecerá acá';
    const sub   = document.getElementById('adSubtitulo').value.trim();
    const img   = document.getElementById('adImagen').value.trim();

    document.getElementById('adPreviewTag').textContent    = tag;
    document.getElementById('adPreviewTitulo').textContent = titulo;

    const subEl = document.getElementById('adPreviewSub');
    if (sub) {
        subEl.textContent = sub;
        subEl.classList.remove('hidden');
    } else {
        subEl.classList.add('hidden');
    }

    const previewImg  = document.getElementById('adPreviewImg');
    const placeholder = document.getElementById('adPreviewImgPlaceholder');
    if (img) {
        previewImg.src = img;
        previewImg.classList.remove('hidden');
        placeholder.classList.add('hidden');
        previewImg.onerror = () => {
            previewImg.classList.add('hidden');
            placeholder.classList.remove('hidden');
        };
    } else {
        previewImg.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
}

// Refleja los datos guardados en Firebase en el panel de estado
function actualizarEstadoFirebase(d) {
    const activa = d && d.activa;
    const elActivo = document.getElementById('adEstActivo');
    elActivo.textContent = activa ? 'Activo' : 'Inactivo';
    elActivo.className = activa ? 'text-xs font-black text-emerald-400' : 'text-xs font-black text-slate-500';
    document.getElementById('adEstTitulo').textContent = d && d.titulo ? d.titulo : '-';
    document.getElementById('adEstTag').textContent = d && d.tag ? d.tag : '-';
    var imgText = '-';
    if (d && d.imagen) { imgText = '+ ' + d.imagen.replace(/^https?:\/\//, '').substring(0, 40) + '...'; }
    document.getElementById('adEstImagen').textContent = imgText;
}
