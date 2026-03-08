let usuarioActual = null;

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
    else text.textContent = 'Ver mis beneficios';
}

// Configuración de premios — se carga dinámicamente desde Firebase
// (colección "productos" con canjeable: true)
let premios = [];

// Al cargar la página iniciamos base de datos y sesión
window.onload = async () => {
    try {
        await initDB();
        await initProductos();

        // Premios = productos canjeables, ordenados por puntos asc
        premios = productos
            .filter(p => p.canjeable !== false)
            .sort((a, b) => a.puntos - b.puntos);
        
        const tarjetaGuardada = localStorage.getItem('puntos_user_tarjeta');
        if (tarjetaGuardada) {
            await iniciarConTarjeta(tarjetaGuardada);
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
    const tarjeta = document.getElementById("tarjetaInput").value.replace(/\s+/g, '');
    if (tarjeta.length === 0) return;
    setLoginLoading(true);
    await iniciarConTarjeta(tarjeta);
    setLoginLoading(false);
}

async function iniciarConTarjeta(numTarjeta) {
    // Usamos getUsuario() para ir a buscar la tarjeta DIRECTO a Firebase
    const user = await getUsuario(numTarjeta);

    if (user) {
        // Verificamos que la tarjeta ya haya sido activada por el admin
        if (!user.asignada) {
            showToast("Esta tarjeta es válida pero aún no fue activada en el local.", "warn");
            return;
        }

        usuarioActual = user;
        localStorage.setItem('puntos_user_tarjeta', numTarjeta);
        
        document.getElementById("loginSection").classList.add("hidden");
        document.getElementById("appSection").classList.remove("hidden");
        
        renderAll();
    } else {
        showToast("La tarjeta ingresada no existe.", "error");
    }
}

function logout() {
    localStorage.removeItem('puntos_user_tarjeta');
    location.reload();
}

function renderAll() {
    document.getElementById("userName").innerText = usuarioActual.nombre;
    document.getElementById("userPoints").innerText = usuarioActual.puntos.toLocaleString();
    document.getElementById("cardNumberDisplay").innerText = usuarioActual.tarjeta.replace(/(\d{4})(\d{4})/, '$1 $2');

    renderProgreso();
    renderPremios();
    renderHistorial();
}

function renderProgreso() {
    const proximo = premios.find(p => p.puntos > usuarioActual.puntos) || premios[premios.length - 1];
    const objetivo = proximo.puntos;
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
        const puede = usuarioActual.puntos >= p.puntos;
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
                    <span class="text-blue-400 font-black tracking-tighter text-lg">${p.puntos} PTS</span>
                    <button disabled
                        class="px-6 py-2 rounded-xl font-bold text-xs uppercase transition-all ${
                        puede
                        ? "bg-blue-600 shadow-lg shadow-blue-600/20 text-white"
                        : "bg-slate-800 text-slate-500 opacity-40 cursor-not-allowed"
                    }">
                        ${puede ? "¡Podés canjear!" : "Faltan pts"}
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

    logs.forEach((h, index) => {
        const esSuma = h.puntos > 0;
        container.innerHTML += `
            <div class="flex justify-between items-center p-5 ${index !== logs.length - 1 ? 'border-b border-white/5' : ''}">
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
