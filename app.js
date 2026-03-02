let usuarios = [];
let usuarioActual = null;

// Configuración de premios (Sincronizado con la estética de Más Que Burgers)
const premios = [
    { 
        id: 1, 
        nombre: "Blue simple", 
        puntos: 500, 
        imagen: "https://res.cloudinary.com/dl2tftoum/image/upload/w_600,q_auto,f_auto/v1772409294/v87b4kjgyhqdhdrnz0dx.webp", // Pegá acá el link de la Blue Simple
        desc: "Canjea una Blue simple." 
    },
    { 
        id: 2, 
        nombre: "American doble", 
        puntos: 1500, 
        imagen: "https://res.cloudinary.com/dl2tftoum/image/upload/w_600,q_auto,f_auto/v1771375253/u676h7nh4dzokypxengm.webp", // Pegá acá el link de la American Doble
        desc: "Canjea una American doble" 
    },
    { 
        id: 3, 
        nombre: "Yankee triple", 
        puntos: 3000, 
        imagen: "https://res.cloudinary.com/dl2tftoum/image/upload/w_600,q_auto,f_auto/v1771375550/dnscdxhybleudjhrlyvp.webp", // Pegá acá el link de la Yankee Triple
        desc: "Canjea una Yankee triple" 
    }
];

// Al cargar la página iniciamos base de datos y sesión
window.onload = async () => {
    try {
        const res = await fetch("usuarios.json");
        usuarios = await res.json();
        
        const tarjetaGuardada = localStorage.getItem('puntos_user_tarjeta');
        if (tarjetaGuardada) {
            iniciarConTarjeta(tarjetaGuardada);
        }
    } catch (e) {
        console.error("Error al conectar con la base de datos local.");
    }

    // Inicializar el efecto 3D si existe el elemento en el DOM
    iniciarEfecto3D();
};

function login() {
    const tarjeta = document.getElementById("tarjetaInput").value;
    iniciarConTarjeta(tarjeta);
}

function iniciarConTarjeta(numTarjeta) {
    const user = usuarios.find(u => u.tarjeta === numTarjeta);

    if (user) {
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
    // Datos de perfil y tarjeta
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

    premios.forEach(p => {
        const puede = usuarioActual.puntos >= p.puntos;
        container.innerHTML += `
            <div class="glass p-6 rounded-3xl flex flex-col justify-between gap-6 transition-all hover:bg-white/[0.05]">
                <div class="flex gap-4">
                    <div class="w-20 h-20 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
                        <img src="${p.imagen}" 
                             alt="${p.nombre}" 
                             class="w-full h-full object-cover shadow-lg"
                             onerror="this.src='https://via.placeholder.com/150?text=Burger'">
                    </div>
                    
                    <div>
                        <h4 class="font-bold text-lg text-white leading-tight">${p.nombre}</h4>
                        <p class="text-[11px] text-slate-500 mt-1 uppercase font-semibold">${p.desc}</p>
                    </div>
                </div>
                
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <span class="text-blue-400 font-black tracking-tighter text-lg">${p.puntos} PTS</span>
                    <button ${puede ? "" : "disabled"} 
                        class="px-6 py-2 rounded-xl font-bold text-xs uppercase transition-all ${
                        puede 
                        ? "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20 active:scale-95 text-white" 
                        : "bg-slate-800 text-slate-500 opacity-40 cursor-not-allowed"
                    }">
                        ${puede ? "Canjear" : "Faltan pts"}
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