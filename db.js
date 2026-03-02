let usuarios = [];

// cargar datos locales
async function initDB() {
  const res = await fetch("usuarios.json");
  usuarios = await res.json();
}

// obtener usuario
async function getUsuario(tarjeta) {
  return usuarios.find(u => u.tarjeta === tarjeta);
}

// actualizar usuario
async function updateUsuario(usuarioActualizado) {
  const index = usuarios.findIndex(
    u => u.tarjeta === usuarioActualizado.tarjeta
  );

  usuarios[index] = usuarioActualizado;

  console.log("Simulación guardado OK");
}