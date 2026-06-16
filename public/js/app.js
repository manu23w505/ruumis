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

async function manejarCambioCiudad() {
    const ciudadId = document.getElementById('filtro-ciudad').value;
    const selectZona = document.getElementById('filtro-zona');
    
    if (!selectZona) return;

    if (!ciudadId) {
        selectZona.innerHTML = '<option value="">Selecciona una ciudad primero</option>';
        selectZona.disabled = true;
        selectZona.classList.replace('bg-white', 'bg-slate-100');
        aplicarFiltros();
        return;
    }

    const zonas = await apiCall(`/api/zonas?ciudad_id=${ciudadId}`);
    
    if (zonas && zonas.length > 0) {
        selectZona.innerHTML = '<option value="">Todas las zonas</option>';
        zonas.forEach(z => {
            selectZona.innerHTML += `<option value="${z.id}">${z.nombre}</option>`;
        });
        selectZona.disabled = false;
        selectZona.className = selectZona.className.replace('bg-slate-100 text-slate-400', 'bg-white text-slate-900');
    } else {
        selectZona.innerHTML = '<option value="">Sin zonas disponibles</option>';
        selectZona.disabled = true;
    }

    aplicarFiltros();
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
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold uppercase tracking-wider text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-100">${anuncio.tipo_propiedad || 'Habitación'}</span>
                    <span class="text-xs text-slate-400 font-medium">ID: ${anuncio.id}</span>
                </div>
                <h3 class="font-bold text-lg text-slate-900 mb-1 line-clamp-1">${anuncio.titulo}</h3>
                <p class="text-sm text-slate-500 mb-3 flex items-center gap-1">
                    <span>${anuncio.ciudad || 'Sin Ciudad'}</span> • <span>${anuncio.zona || 'Sin Zona'}</span>
                </p>
                
                <!-- Detalles de habitabilidad solicitados -->
                <div class="grid grid-cols-2 gap-y-1.5 gap-x-2 text-xs text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div class="flex items-center gap-1"><span>${anuncio.recamaras || 1} Recám.</span></div>
                    <div class="flex items-center gap-1"><span>${anuncio.camas || 1} Camas</span></div>
                    <div class="flex items-center gap-1"><span>${anuncio.banos || 1} Baños</span></div>
                    <div class="flex items-center gap-1"><span>Máx. ${anuncio.capacidad_personas || 1} pers.</span></div>
                </div>

                <p class="text-xs text-slate-400 line-clamp-2 mb-4">${anuncio.descripcion_corta || ''}</p>
            </div>
            <div>
                <div class="flex items-baseline justify-between border-t border-slate-100 pt-4 mb-4">
                    <span class="text-xs font-semibold text-slate-400">Desde</span>
                    <p class="text-xl font-black text-slate-900">$${anuncio.precio} <span class="text-xs font-normal text-slate-500">MXN / noche</span></p>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="verCalendario(${anuncio.id})" class="w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">Calendario</button>
                    <button onclick="abrirModalDetalles(${anuncio.id})" class="w-full text-center bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">Ver Detalles</button>
                </div>
            </div>
        `;
        contenedor.appendChild(tarjeta);
    });
}

function aplicarFiltros() {
    const busqueda = document.getElementById('filtro-busqueda')?.value.toLowerCase() || '';
    const ciudad = document.getElementById('filtro-ciudad')?.value || '';
    const zona = document.getElementById('filtro-zona')?.value || '';
    const precioMin = parseFloat(document.getElementById('filtro-precio-min')?.value) || 0;
    const precioMax = parseFloat(document.getElementById('filtro-precio-max')?.value) || Infinity;

    const filtrados = todosLosAnuncios.filter(a => {
        const coincideBusqueda = a.titulo.toLowerCase().includes(busqueda) || 
                                 a.descripcion.toLowerCase().includes(busqueda) || 
                                 (a.zona && a.zona.toLowerCase().includes(busqueda));
        const coincideCiudad = ciudad === "" || a.ciudad_id == ciudad;
        const coincideZona = zona === "" || a.zona_id == zona;
        const coincidePrecio = a.precio >= precioMin && a.precio <= precioMax;
        const coincideHuespedes = a.capacidad_personas ? (a.capacidad_personas >= contadorHuespedes) : true;

        return coincideBusqueda && coincideCiudad && coincideZona && coincidePrecio && coincideHuespedes;
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
    
    const selectZona = document.getElementById('filtro-zona');
    if(selectZona) {
        selectZona.innerHTML = '<option value="">Selecciona una ciudad primero</option>';
        selectZona.disabled = true;
    }

    contadorHuespedes = 1;
    if(document.getElementById('display-huespedes')) document.getElementById('display-huespedes').innerText = '1';
    renderizarTarjetas(todosLosAnuncios);
}

window.abrirModalDetalles = function(id) {
    const anuncio = todosLosAnuncios.find(a => a.id === id);
    if (!anuncio) return;

    const modal = document.getElementById('modal-detalles');
    if (!modal) return alert("Error: No se encontró la estructura de modal-detalles en el HTML.");

    document.getElementById('det-imagen').src = `/uploads/${anuncio.imagen || 'default.jpg'}`;
    document.getElementById('det-titulo').innerText = anuncio.titulo;
    document.getElementById('det-tipo').innerText = anuncio.tipo_propiedad || 'Habitación';
    document.getElementById('det-ubicacion').innerText = `${anuncio.ciudad} • ${anuncio.zona}`;
    document.getElementById('det-precio').innerText = `$${anuncio.precio} MXN`;
    document.getElementById('det-recamaras').innerText = anuncio.recamaras || 1;
    document.getElementById('det-camas').innerText = anuncio.camas || 1;
    document.getElementById('det-banos').innerText = anuncio.banos || 1;
    document.getElementById('det-personas').innerText = anuncio.capacidad_personas || 1;
    document.getElementById('det-descripcion').innerText = anuncio.descripcion || 'Sin descripción detallada.';
    document.getElementById('det-amenidades').innerText = anuncio.amenidades || 'Ninguna descrita.';
    
    const btnAirbnb = document.getElementById('det-link-airbnb');
    if(anuncio.link_airbnb) {
        btnAirbnb.href = anuncio.link_airbnb;
        btnAirbnb.classList.remove('hidden');
    } else {
        btnAirbnb.classList.add('hidden');
    }

    modal.classList.replace('hidden', 'flex');
};

window.verCalendario = async function(id) {
    const modal = document.getElementById('modal-calendario');
    if (!modal) return alert("Error: No se encontró el modal-calendario en el HTML.");
    
    const mapaFechas = await apiCall(`/api/anuncios/${id}/calendario-capsula`);
    if (mapaFechas) {
        modal.classList.replace('hidden', 'flex');
        renderizarCalendarioVisual(mapaFechas);
    } else {
        alert("No se pudo obtener el estado de ocupación.");
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

        contenedor.innerHTML += `<div data-fecha="${formatoFechaStr}" class="p-3 border text-center rounded-xl text-sm transition-all ${claseColor}">${dia}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarPagina();

    document.getElementById('filtro-busqueda')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-precio-min')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-precio-max')?.addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-ciudad')?.addEventListener('change', manejarCambioCiudad);
    document.getElementById('filtro-zona')?.addEventListener('change', aplicarFiltros);
    document.getElementById('btn-limpiar')?.addEventListener('click', limpiarFiltros);
});