let todosLosAnuncios = [];
let contadorHuespedes = 1;

async function apiCall(endpoint) {
    try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`Error ${response.status} en ${endpoint}`);
        return await response.json();
    } catch (error) {
        console.error("Error en API:", error);
        return null;
    }
}

async function inicializarPagina() {
    // 1. Cargar las ciudades en el select de filtros
    const ciudades = await apiCall('/api/ciudades');
    const selectCiudad = document.getElementById('filtro-ciudad');
    if (selectCiudad && ciudades) {
        selectCiudad.innerHTML = '<option value="">Todas las ciudades</option>';
        ciudades.forEach(c => {
            selectCiudad.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    }

    const contenedor = document.getElementById('contenedor-anuncios');
    todosLosAnuncios = await apiCall('/api/anuncios');
    
    if (!todosLosAnuncios || todosLosAnuncios.length === 0) {
        if (contenedor) contenedor.innerHTML = '<p class="text-slate-500 col-span-full text-center py-12">No hay habitaciones disponibles en este momento.</p>';
        return;
    }
    
    renderizarTarjetas(todosLosAnuncios);
}

function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedor-anuncios');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    
    lista.forEach(anuncio => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between';
        tarjeta.innerHTML = `
            <div>
                <img src="/uploads/${anuncio.imagen || 'default.jpg'}" class="w-full h-48 object-cover rounded-xl mb-4" alt="${anuncio.titulo}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold uppercase tracking-wider text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-100">${anuncio.tipo_propiedad || 'Habitación'}</span>
                    <span class="text-xs text-slate-400 font-medium">ID: ${anuncio.id}</span>
                </div>
                <h3 class="font-bold text-lg text-slate-900 mb-1 line-clamp-1">${anuncio.titulo}</h3>
                <p class="text-sm text-slate-500 mb-2 flex items-center gap-1">
                    <span>${anuncio.ciudad || 'Sin Ciudad'}</span> • <span>${anuncio.zona || 'Sin Zona'}</span>
                </p>
                <p class="text-xs text-slate-400 line-clamp-2 mb-4">${anuncio.descripcion_corta || ''}</p>
            </div>
            <div>
                <div class="flex items-baseline justify-between border-t border-slate-100 pt-4 mb-4">
                    <span class="text-xs font-semibold text-slate-400">Precio mensual</span>
                    <p class="text-xl font-black text-slate-900">$${anuncio.precio} <span class="text-xs font-normal text-slate-500">MXN</span></p>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="verCalendario(${anuncio.id})" class="w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">Calendario</button>
                    <button onclick="verDetalles(${anuncio.id})" class="w-full text-center bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">Ver Detalles</button>
                </div>
            </div>
        `;
        contenedor.appendChild(tarjeta);
    });
}

function aplicarFiltros() {
    const busqueda = document.getElementById('filtro-busqueda')?.value.toLowerCase() || '';
    const ciudad = document.getElementById('filtro-ciudad')?.value || '';
    const precioMin = parseFloat(document.getElementById('filtro-precio-min')?.value) || 0;
    const precioMax = parseFloat(document.getElementById('filtro-precio-max')?.value) || Infinity;

    const filtrados = todosLosAnuncios.filter(a => {
        const coincideBusqueda = a.titulo.toLowerCase().includes(busqueda) || 
                                 a.descripcion.toLowerCase().includes(busqueda) || 
                                 (a.zona && a.zona.toLowerCase().includes(busqueda));
        const coincideCiudad = ciudad === "" || a.ciudad_id == ciudad;
        const coincidePrecio = a.precio >= precioMin && a.precio <= precioMax;
        const coincideHuespedes = a.capacidad_personas ? (a.capacidad_personas >= contadorHuespedes) : true;

        return coincideBusqueda && coincideCiudad && coincidePrecio && coincideHuespedes;
    });

    renderizarTarjetas(filtrados);
}

window.cambiarHuespedes = function(val) {
    contadorHuespedes = Math.max(1, contadorHuespedes + val);
    const display = document.getElementById('display-huespedes');
    if (display) display.innerText = contadorHuespedes;
    aplicarFiltros();
};

function limpiarFiltros() {
    if(document.getElementById('filtro-busqueda')) document.getElementById('filtro-busqueda').value = '';
    if(document.getElementById('filtro-precio-min')) document.getElementById('filtro-precio-min').value = '';
    if(document.getElementById('filtro-precio-max')) document.getElementById('filtro-precio-max').value = '';
    if(document.getElementById('filtro-ciudad')) document.getElementById('filtro-ciudad').value = '';
    contadorHuespedes = 1;
    if(document.getElementById('display-huespedes')) document.getElementById('display-huespedes').innerText = '1';
    renderizarTarjetas(todosLosAnuncios);
}

window.verDetalles = function(id) {
    window.location.href = `detalle.html?id=${id}`;
};

window.verCalendario = async function(id) {
    const modal = document.getElementById('modal-calendario');
    if (!modal) return alert("Error: No se encontró el modal-calendario en el HTML.");
    
    console.log("Consultando mapa de fechas iCal para el anuncio:", id);
    const mapaFechas = await apiCall(`/api/anuncios/${id}/calendario-capsula`);
    
    if (mapaFechas) {
        modal.classList.replace('hidden', 'flex'); 
        renderizarCalendarioVisual(mapaFechas);
    } else {
        alert("No se pudo obtener el estado de ocupación de este anuncio.");
    }
};

function renderizarCalendarioVisual(mapaFechas) {
    const contenedor = document.getElementById('calendario-contenido');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = hoy.getMonth();

    const primerDiaMes = new Date(año, mes, 1).getDay();
    const totalDiasMes = new Date(año, mes + 1, 0).getDate();

    for (let i = 0; i < primerDiaMes; i++) {
        contenedor.innerHTML += `<div class="p-3"></div>`;
    }

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const mm = String(mes + 1).padStart(2, '0');
        const dd = String(dia).padStart(2, '0');
        const formatoFechaStr = `${año}-${mm}-${dd}`;

        const estado = mapaFechas[formatoFechaStr];
        let claseColor = 'bg-slate-50 text-slate-800 border-slate-100 hover:bg-slate-200'; 

        if (estado === 'llegada') {
            claseColor = 'marcador-llegada marcador-activo text-white font-bold';
        } else if (estado === 'salida') {
            claseColor = 'marcador-salida marcador-activo text-white font-bold';
        } else if (estado === 'intermedio') {
            claseColor = 'bg-slate-200 text-slate-400 dia-pasado line-through';
        }

        contenedor.innerHTML += `
            <div data-fecha="${formatoFechaStr}" class="p-3 border text-center rounded-xl text-sm transition-all cursor-default ${claseColor}">
                ${dia}
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarPagina();

    document.getElementById('filtro-busqueda')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-precio-min')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-precio-max')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-ciudad')?.addEventListener('change', aplicarFiltros);
    document.getElementById('btn-limpiar')?.addEventListener('click', limpiarFiltros);
});