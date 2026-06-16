// app.js - Central de Comunicación con el Servidor

const API_BASE = ''; 
async function apiCall(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error(`Error ${response.status} en ${endpoint}`);
        return await response.json();
    } catch (error) {
        console.error("Error en API:", error);
        return null;
    }
}

window.verCalendario = async function(id) {
    const modal = document.getElementById('modal-calendario');
    if (!modal) return alert("Error: El modal no está configurado en el HTML.");
    console.log("Consultando fechas para el anuncio:", id);
    
    const mapaFechas = await apiCall(`/api/anuncios/${id}/calendario-capsula`);
    
    if (mapaFechas) {
        modal.classList.remove('hidden');
        renderizarCalendarioVisual(mapaFechas);
    } else {
        alert("No se pudo cargar la disponibilidad. Intenta más tarde.");
    }
};


window.verDetalles = function(id) {
    window.location.href = `detalle.html?id=${id}`;
};

function renderizarCalendarioVisual(mapaFechas) {
    console.log("Pintando calendario con:", mapaFechas);
}