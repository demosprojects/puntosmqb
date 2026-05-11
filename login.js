// Apagar el loader de la pantalla cuando carga el HTML
window.onload = () => {
    setTimeout(() => {
        const loader = document.getElementById('global-loader');
        if (loader) loader.classList.add('hidden-loader');
    }, 500);
};

// ── Sistema de Avisos Integrado ──
let messageTimeout;

function showInlineMessage(message, type = 'error') {
    const msgDiv = document.getElementById('loginMessage');
    
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

// ── Botón de cargar / Mostrar y Ocultar Clave ──
function setBtnLoading(loading) {
    const btn = document.getElementById('btnLogin');
    const text = document.getElementById('btnLoginText');
    const spinner = document.getElementById('btnLoginSpinner');
    
    btn.disabled = loading;
    btn.classList.toggle('opacity-60', loading);
    btn.classList.toggle('cursor-not-allowed', loading);
    
    if (loading) {
        text.textContent = '';
        spinner.classList.remove('hidden');
    } else {
        text.textContent = 'Ingresar al Sistema';
        spinner.classList.add('hidden');
    }
}

function togglePassword() {
    const input = document.getElementById('adminPass');
    const iconAbierto = document.getElementById('iconOjoAbierto');
    const iconCerrado = document.getElementById('iconOjoCerrado');
    
    if (input.type === 'password') {
        input.type = 'text';
        iconAbierto.classList.remove('hidden');
        iconCerrado.classList.add('hidden');
    } else {
        input.type = 'password';
        iconAbierto.classList.add('hidden');
        iconCerrado.classList.remove('hidden');
    }
}

// ── Lógica de Inicio de Sesión con Firebase Auth ──
async function loginAdmin() {
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPass').value.trim();

    if (!email || !pass) {
        showInlineMessage('Por favor completá usuario y contraseña.', 'warn');
        return;
    }

    setBtnLoading(true);

    try {
        // Conexión real con Firebase Authentication
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        
        showInlineMessage('¡Acceso autorizado! Redirigiendo...', 'success');
        
        // Redirigir al panel
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
        
    } catch (error) {
        console.error("Error de login:", error);
        setBtnLoading(false);
        document.getElementById('adminPass').value = '';
        document.getElementById('adminPass').focus();

        // Traducimos los errores más comunes de Firebase
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            showInlineMessage('El usuario o la contraseña son incorrectos.', 'error');
        } else if (error.code === 'auth/invalid-email') {
            showInlineMessage('El formato del correo electrónico es inválido.', 'warn');
        } else if (error.code === 'auth/too-many-requests') {
            showInlineMessage('Demasiados intentos fallidos. Esperá unos minutos.', 'error');
        } else {
            showInlineMessage('Ocurrió un error al intentar iniciar sesión.', 'error');
        }
    }
}