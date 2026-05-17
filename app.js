let usuarioActual = null;
let messageTimeout;

// ── Sistema de Avisos Integrado ──
function showInlineMessage(message, type = 'error') {
    const msgDiv = document.getElementById('loginMessage');
    if (!msgDiv) return;
    
    // Limpiamos clases anteriores y el timeout
    msgDiv.classList.remove('hidden', 'bg-rose-500/10', 'border-rose-500/30', 'text-rose-400', 'bg-amber-500/10', 'border-amber-500/30', 'text-amber-400', 'bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-400');
    clearTimeout(messageTimeout);
    
    // Asignamos colores según el tipo de aviso
    if (type === 'error') {
        msgDiv.classList.add('bg-rose-500/10', 'border-rose-500/30', 'text-rose-400');
    } else if (type === 'warn') {
        msgDiv.classList.add('bg-amber-500/10', 'border-amber-500/30', 'text-amber-400');
    } else if (type === 'success') {
        msgDiv.classList.add('bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-400');
    }
    
    msgDiv.textContent = message;
    
    // Lo ocultamos a los 4 segundos
    messageTimeout = setTimeout(() => {
        msgDiv.classList.add('hidden');
    }, 4000);
}

// ── Helpers de UI ──────────────────────────────────────────
function showLoader()  { document.getElementById('global-loader')?.classList.remove('hidden-loader'); }
function hideLoader()  { document.getElementById('global-loader')?.classList.add('hidden-loader'); }

function setLoginLoading(loading) {
    const btn     = document.getElementById('loginBtn');
    const text    = document.getElementById('loginBtnText');
    const arrow   = document.getElementById('loginBtnArrow');
    const spinner = document.getElementById('loginBtnSpinner');
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('opacity-60', loading);
    btn.classList.toggle('cursor-not-allowed', loading);
    text?.classList.toggle('hidden', loading);
    arrow?.classList.toggle('hidden', loading);
    spinner?.classList.toggle('hidden', !loading);
    if (loading) text.textContent = '';
    else text.textContent = 'Ingresar';
}

// Configuración de premios — se carga dinámicamente desde Firebase
// (colección "productos" con canjeable: true)
let premios = [];

// Al cargar la página iniciamos base de datos y sesión
window.onload = async () => {
    try {
        await initDB();
        await initProductos();

        // Premios = solo productos que se pueden canjear, ordenados por costo de canje asc
        premios = productos
            .filter(p => p.aparece === 'canje' || p.aparece === 'ambos' || (p.aparece === undefined && p.canjeable !== false))
            .sort((a, b) => (a.puntosCanje ?? a.puntos ?? 0) - (b.puntosCanje ?? b.puntos ?? 0));
        
        // Buscamos si ya hay un PIN guardado de una sesión anterior
        const pinGuardado = localStorage.getItem('puntos_user_pin');
        if (pinGuardado) {
            await iniciarConPin(pinGuardado);
        }
    } catch (e) {
        console.error("Error al conectar con Firebase.", e);
    }

    hideLoader();

    if (typeof iniciarEfecto3D === 'function') {
        iniciarEfecto3D();
    }
};

async function login() {
    // Tomamos el PIN del input
    const pin = document.getElementById("tarjetaInput").value.trim();
    if (pin.length === 0) return;
    
    setLoginLoading(true);
    await iniciarConPin(pin);
    setLoginLoading(false);
}

async function iniciarConPin(pin) {
    // Usamos la nueva función para ir a buscar al usuario por su PIN
    const user = await getUsuarioByPin(pin);

    if (user) {
        // Verificamos que la tarjeta ya haya sido activada por el admin
        if (!user.asignada) {
            showInlineMessage("Esta cuenta no está activa.", "warn");
            return;
        }

        usuarioActual = user;
        // Guardamos el PIN en la memoria del navegador para no pedirlo de nuevo
        localStorage.setItem('puntos_user_pin', pin);
        
        document.getElementById("loginSection").classList.add("hidden");
        document.getElementById("appSection").classList.remove("hidden");
        
        renderAll();

        // Verificar si ya aceptó los TyC; si no, mostrar el modal
        const tyc = await getTycStatus(user.tarjeta);
        if (!tyc || !tyc.aceptado) {
            if (typeof abrirTyc === 'function') abrirTyc();
        }
    } else {
        showInlineMessage("El PIN ingresado es incorrecto o no existe.", "error");
    }
}

function logout() {
    // Mostramos el loader con mensaje de cierre de sesión
    const loaderText = document.getElementById('loaderText');
    if (loaderText) loaderText.textContent = 'Cerrando sesión';
    showLoader();
    // Borramos el PIN de la memoria al salir
    localStorage.removeItem('puntos_user_pin');
    setTimeout(() => location.reload(), 800);
}

function renderAll() {
    document.getElementById("userName").innerText = usuarioActual.nombre;
    document.getElementById("userPoints").innerText = usuarioActual.puntos.toLocaleString();
    
    // Seguimos mostrando el número de tarjeta virtual como parte de la estética de la credencial
    document.getElementById("cardNumberDisplay").innerText = usuarioActual.tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');

    renderProgreso();
    renderPremios();
    renderHistorial();
}

function renderProgreso() {
    const costoProximo = p => p.puntosCanje ?? p.puntos ?? 0;
    const proximo = premios.find(p => costoProximo(p) > usuarioActual.puntos) || premios[premios.length - 1];
    const objetivo = costoProximo(proximo);
    const faltan = Math.max(objetivo - usuarioActual.puntos, 0);
    const porcentaje = Math.min((usuarioActual.puntos / objetivo) * 100, 100);

    document.getElementById("barraProgreso").style.width = `${porcentaje}%`;
    document.getElementById("porcentajeTexto").innerText = `${Math.round(porcentaje)}%`;
    
    document.getElementById("progresoTexto").innerHTML = faltan > 0 
        ? `Te faltan <b class="text-white">${faltan} pts</b> para tu <b>${proximo.nombre}</b>`
        : `<span class="text-blue-400 font-bold">¡Ya podés canjear todos los premios!</span>`;
}

function renderPremios() {
    const container = document.getElementById("premiosContainer");
    container.innerHTML = "";

    if (premios.length === 0) {
        container.innerHTML = `
            <div class="col-span-full glass p-10 rounded-3xl text-center text-slate-500 italic text-sm">
                Próximamente habrá premios disponibles para canjear 🍔
            </div>`;
        return;
    }

    premios.forEach(p => {
        const costoCanje = p.puntosCanje ?? p.puntos ?? 0;
        const puede = usuarioActual.puntos >= costoCanje;
        const tieneImagen = p.imagen && p.imagen.trim() !== '';
        container.innerHTML += `
            <div class="glass p-6 rounded-3xl flex flex-col justify-between gap-6 transition-all hover:bg-white/[0.05]">
                <div class="flex gap-4">
                    <div class="w-20 h-20 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-800 flex items-center justify-center">
                        ${tieneImagen
                            ? `<img src="${p.imagen}" alt="${p.nombre}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span class=\\'text-3xl\\'>🍔</span>'">`
                            : `<span class="text-3xl">🍔</span>`
                        }
                    </div>
                    <div>
                        <h4 class="font-bold text-lg text-white leading-tight">${p.nombre}</h4>
                        <p class="text-[11px] text-slate-500 mt-1 uppercase font-semibold">${p.categoria || ''}</p>
                    </div>
                </div>
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <span class="text-blue-400 font-black tracking-tighter text-lg">${costoCanje} PTS</span>
                    <button disabled
                        class="px-6 py-2 rounded-xl font-bold text-xs uppercase transition-all ${
                        puede
                        ? "bg-blue-600 shadow-lg shadow-blue-600/20 text-white"
                        : "bg-slate-800 text-slate-500 opacity-40 cursor-not-allowed"
                    }">
                        ${puede ? "¡Podés canjear!" : "Te faltan pts"}
                    </button>
                </div>
            </div>
        `;
    });
}

function renderHistorial() {
    const container = document.getElementById("historialContainer");
    container.innerHTML = "";

    const logs = [...usuarioActual.historial].reverse().slice(0, 5);
    window.historialActual = logs; // Guardamos la referencia para el comprobante

    logs.forEach((h, index) => {
        const esSuma = h.puntos > 0;
        container.innerHTML += `
            <div onclick="abrirComprobante(${index})" class="flex justify-between items-center p-5 ${index !== logs.length - 1 ? 'border-b border-white/5' : ''} cursor-pointer hover:bg-white/[0.04] transition-colors active:scale-[0.98]">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${esSuma ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                        ${esSuma ? '↑' : '↓'}
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-200">${h.descripcion}</p>
                        <p class="text-[10px] text-slate-500 uppercase font-black">${h.fecha}</p>
                    </div>
                </div>
                <span class="font-black ${esSuma ? 'text-emerald-400' : 'text-rose-400'}">
                    ${esSuma ? '+' : ''}${h.puntos}
                </span>
            </div>
        `;
    });
}

// ── SISTEMA DE COMPROBANTES ─────────────────────────────────

function abrirComprobante(index) {
    if (!window.historialActual || !window.historialActual[index]) return;
    const h = window.historialActual[index];
    const esSuma = h.puntos > 0;
    
    // Rellenamos los datos del modal
    document.getElementById('compNombre').innerText = usuarioActual.nombre;
    document.getElementById('compOperacion').innerText = h.descripcion;
    document.getElementById('compFecha').innerText = h.fecha;
    document.getElementById('compPuntos').innerText = (esSuma ? '+' : '') + h.puntos;
    document.getElementById('compPuntos').className = `text-3xl font-black ${esSuma ? 'text-emerald-400' : 'text-rose-400'}`;
    
    // Si el historial viejo no tiene idTx generado, mostramos uno temporal para que no quede en blanco
    document.getElementById('compTx').innerText = h.idTx || 'MQB-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // Ocultamos mensajes anteriores
    document.getElementById('compMensaje').classList.add('hidden');
    
    document.getElementById('comprobanteOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function cerrarComprobante() {
    document.getElementById('comprobanteOverlay').classList.remove('open');
    // Solo restauramos el scroll si la pestaña de "Actividad" no sigue abierta de fondo
    if (!document.getElementById('actividadOverlay').classList.contains('open')) {
        document.body.style.overflow = '';
    }
}

async function copiarComprobante() {
    const btn = document.getElementById('btnCopiarComprobante');
    const textSpan = document.getElementById('btnCopiarComprobanteText');
    const originalText = textSpan.innerText;
    const msgDiv = document.getElementById('compMensaje');
    
    textSpan.innerText = 'Generando...';
    btn.disabled = true;
    msgDiv.classList.add('hidden');

    try {
        const captureDiv = document.getElementById('comprobanteCaptura');
        const canvas = await html2canvas(captureDiv, {
            backgroundColor: '#0f172a', // Color de fondo base para que no quede transparente
            scale: 3, // Alta calidad
            useCORS: true // Para que pueda procesar la imagen del logo
        });
        
        canvas.toBlob(async (blob) => {
            try {
                // Si el dispositivo/navegador soporta la API Share nativa (WhatsApp, Mail, etc)
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'comprobante.png', { type: 'image/png' })] })) {
                    const file = new File([blob], 'comprobante.png', { type: 'image/png' });
                    await navigator.share({
                        title: 'Comprobante Más que Burgers',
                        files: [file]
                    });
                    msgDiv.innerHTML = '<span class="text-emerald-400">¡Compartido con éxito!</span>';
                } else {
                    // Fallback para PC o navegadores donde se copia directo al portapapeles
                    const item = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([item]);
                    msgDiv.innerHTML = '<span class="text-emerald-400">¡Imagen copiada al portapapeles!</span>';
                }
            } catch (err) {
                console.error('Error al compartir/copiar:', err);
                if (err.name !== 'AbortError') { // Ignora si el usuario canceló el menú nativo de compartir
                    msgDiv.innerHTML = '<span class="text-rose-400">No se pudo compartir. Tu dispositivo no lo soporta.</span>';
                }
            } finally {
                if(msgDiv.innerHTML !== '') msgDiv.classList.remove('hidden');
                textSpan.innerText = '¡Listo!';
                setTimeout(() => {
                    textSpan.innerText = originalText;
                    btn.disabled = false;
                    setTimeout(() => msgDiv.classList.add('hidden'), 2000);
                }, 2500);
            }
        }, 'image/png');
    } catch (error) {
        console.error('Error html2canvas:', error);
        msgDiv.innerHTML = '<span class="text-rose-400">Error al generar la imagen.</span>';
        msgDiv.classList.remove('hidden');
        textSpan.innerText = originalText;
        btn.disabled = false;
        setTimeout(() => msgDiv.classList.add('hidden'), 3000);
    }
}
