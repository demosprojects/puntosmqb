// Configuración de tu Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAZSoefzaOh3SCLg7Vm9Z3Yig2qPqLbLYE",
  authDomain: "puntos-mqb.firebaseapp.com",
  projectId: "puntos-mqb",
  storageBucket: "puntos-mqb.firebasestorage.app",
  messagingSenderId: "387471821744",
  appId: "1:387471821744:web:d49f681e631e6ba702a475"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Variable global para usar en toda la app
let usuarios = [];

// Cargar datos desde Firestore
async function initDB() {
  try {
    const snapshot = await db.collection("usuarios").get();
    usuarios = snapshot.docs.map(doc => ({ tarjeta: doc.id, ...doc.data() }));
    console.log("Base de datos cargada. Tarjetas totales:", usuarios.length);
  } catch (error) {
    console.error("Error cargando Firebase:", error);
  }
}

// Obtener un usuario específico directamente de la base de datos
async function getUsuario(tarjeta) {
  try {
    const docRef = db.collection("usuarios").doc(tarjeta);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      return { tarjeta: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error buscando usuario:", error);
    return null;
  }
}

// Crear o actualizar un usuario en Firestore
async function updateUsuario(usuarioActualizado) {
  try {
    await db.collection("usuarios").doc(usuarioActualizado.tarjeta).set(usuarioActualizado);
    const index = usuarios.findIndex(u => u.tarjeta === usuarioActualizado.tarjeta);
    if (index !== -1) {
      usuarios[index] = usuarioActualizado;
    } else {
      usuarios.push(usuarioActualizado);
    }
    console.log("Guardado en Firebase OK");
  } catch (error) {
    console.error("Error guardando en Firebase:", error);
  }
}

// ── PRODUCTOS ──────────────────────────────────────────────
let productos = [];

async function initProductos() {
  try {
    const snapshot = await db.collection("productos").get();
    productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("Productos cargados:", productos.length);
  } catch (error) {
    console.error("Error cargando productos:", error);
  }
}

async function saveProducto(producto) {
  try {
    if (producto.id) {
      await db.collection("productos").doc(producto.id).set(producto);
      const idx = productos.findIndex(p => p.id === producto.id);
      if (idx !== -1) productos[idx] = producto; else productos.push(producto);
    } else {
      const ref = await db.collection("productos").add(producto);
      producto.id = ref.id;
      productos.push(producto);
    }
    return producto;
  } catch (error) {
    console.error("Error guardando producto:", error);
  }
}

async function deleteProducto(id) {
  try {
    await db.collection("productos").doc(id).delete();
    productos = productos.filter(p => p.id !== id);
  } catch (error) {
    console.error("Error eliminando producto:", error);
  }
}


// ── TÉRMINOS Y CONDICIONES ─────────────────────────────────
// Obtener el estado de aceptación de TyC de un usuario
async function getTycStatus(tarjeta) {
  try {
    const docRef = db.collection("tyc_aceptaciones").doc(tarjeta);
    const docSnap = await docRef.get();
    if (docSnap.exists) return docSnap.data();
    return null;
  } catch (error) {
    console.error("Error consultando TyC:", error);
    return null;
  }
}

// Registrar la aceptación o rechazo de TyC de un usuario
async function registrarAceptacionTyc(tarjeta, aceptado, nombre) {
  try {
    const data = {
      tarjeta,
      nombre,
      aceptado,
      fecha: new Date().toISOString(),
    };
    await db.collection("tyc_aceptaciones").doc(tarjeta).set(data);
    console.log(`TyC ${aceptado ? 'aceptado' : 'rechazado'} para`, tarjeta);
  } catch (error) {
    console.error("Error registrando TyC:", error);
  }
}
async function getUsuarioByPin(pin) {
  try {
    const snapshot = await db.collection("usuarios").where("pin", "==", pin).limit(1).get();
    if (!snapshot.empty) {
      return snapshot.docs[0].data();
    }
    return null;
  } catch (error) {
    console.error("Error buscando por PIN:", error);
    return null;
  }
}

// ── PUBLICIDAD / ADS ───────────────────────────────────────
// Lee la configuración del banner desde Firestore
async function getAdConfig() {
  try {
    const docSnap = await db.collection('config').doc('publicidad').get();
    if (docSnap.exists) return docSnap.data();
    return null;
  } catch (error) {
    console.error('Error leyendo config de publicidad:', error);
    return null;
  }
}

// Guarda la configuración del banner en Firestore
async function saveAdConfig(payload) {
  try {
    await db.collection('config').doc('publicidad').set(payload);
    console.log('Config publicidad guardada OK');
  } catch (error) {
    console.error('Error guardando config de publicidad:', error);
    throw error;
  }
}
