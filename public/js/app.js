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
    // 1. Cargamos los selectores de ubicación como ya lo hacías
    const ubicaciones = await apiCall('/api/ubicaciones');
    const selectCiudad = document.getElementById('filtro-ciudad');
    
    if (selectCiudad && ubicaciones) {
        selectCiudad.innerHTML = '<option value="">Todas las ciudades</option>';
        const ciudadesUnicas = [...new Set(ubicaciones.map(u => u.ciudad || u.ciudad_nombre))].filter(Boolean);
        
        ciudadesUnicas.forEach(ciudadNombre => {
            selectCiudad.innerHTML += `<option value="${ciudadNombre}">${ciudadNombre}</option>`;
        });
    }

    const contenedor = document.getElementById('contenedor-anuncios');
    todosLosAnuncios = await apiCall('/api/anuncios');
    
    if (!todosLosAnuncios || todosLosAnuncios.length === 0) {
        if (contenedor) contenedor.innerHTML = '<p class="text-slate-500 col-span-full text-center py-12">No hay habitaciones disponibles en este momento.</p>';
        return;
    }
    
    // ==========================================
    // NUEVO: INTERCEPTAR PARÁMETROS DE LA URL (SEARCH)
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const guestsUrl = parseInt(urlParams.get('guests'));

    if (guestsUrl) {
        // 1. Sincronizamos tu variable global y el contador visual del HTML
        contadorHuespedes = guestsUrl;
        const displayHuespedes = document.getElementById('display-huespedes');
        if (displayHuespedes) displayHuespedes.innerText = guestsUrl;

        // 2. Ejecutamos directamente tu función de filtrar para que limpie la pantalla de inmediato
        aplicarFiltros();
    } else {
        // Si entró directo sin buscar, renderiza todo normal
        renderizarTarjetas(todosLosAnuncios);
    }
}

async function manejarCambioCiudad() {
    const ciudadSeleccionada = document.getElementById('filtro-ciudad').value; // Ahora es un texto (ej: "Querétaro")
    const selectZona = document.getElementById('filtro-zona');
    
    if (!selectZona) return;

    if (!ciudadSeleccionada) {
        selectZona.innerHTML = '<option value="">Selecciona una ciudad primero</option>';
        selectZona.disabled = true;
        selectZona.classList.replace('bg-white', 'bg-slate-100');
        aplicarFiltros();
        return;
    }

    // Traemos todas las ubicaciones para sacar las zonas de la ciudad elegida
    const ubicaciones = await apiCall('/api/ubicaciones');
    
    if (ubicaciones) {
        // Filtramos las ubicaciones que pertenecen a la ciudad seleccionada
        const zonasFiltradas = ubicaciones.filter(u => (u.ciudad || u.ciudad_nombre) === ciudadSeleccionada);
        
        selectZona.innerHTML = '<option value="">Todas las zonas</option>';
        
        zonasFiltradas.forEach(u => {
            const zNombre = u.zona || u.zona_nombre || 'Sin Zona';
            const compNombre = u.nombre ? `${u.nombre} ` : '';
            // Guardamos el texto de la zona/complejo para comparar directo
            selectZona.innerHTML += `<option value="${zNombre}">${compNombre}(${zNombre})</option>`;
        });
        
        selectZona.disabled = false;
        selectZona.className = selectZona.className.replace('bg-slate-100 text-slate-400', 'bg-white text-slate-900');
    } else {
        selectZona.innerHTML = '<option value="">Sin zonas disponibles</option>';
        selectZona.disabled = true;
    }

    aplicarFiltros();
}

function aplicarFiltros() {
    const busqueda = document.getElementById('filtro-busqueda')?.value.toLowerCase() || '';
    const ciudad = document.getElementById('filtro-ciudad')?.value || ''; // Trae el nombre texto
    const zona = document.getElementById('filtro-zona')?.value || ''; // Trae el nombre texto
    const precioMin = parseFloat(document.getElementById('filtro-precio-min')?.value) || 0;
    const precioMax = parseFloat(document.getElementById('filtro-precio-max')?.value) || Infinity;

    const filtrados = todosLosAnuncios.filter(a => {
        const coincideBusqueda = a.titulo.toLowerCase().includes(busqueda) || 
                                 a.descripcion.toLowerCase().includes(busqueda) || 
                                 (a.zona && a.zona.toLowerCase().includes(busqueda)) ||
                                 (a.ubicacion_nombre && a.ubicacion_nombre.toLowerCase().includes(busqueda));
                                 
        // Comparamos el nombre de la ciudad directamente con lo que viene del JOIN en el anuncio
        const coincideCiudad = ciudad === "" || (a.ciudad || a.ciudad_nombre) === ciudad;
        
        // Comparamos el nombre de la zona directamente
        const coincideZona = zona === "" || (a.zona || a.zona_nombre) === zona;
        
        const coincidePrecio = a.precio >= precioMin && a.precio <= precioMax;
        const coincideHuespedes = a.capacidad_personas ? (a.capacidad_personas >= contadorHuespedes) : true;

        return coincideBusqueda && coincideCiudad && coincideZona && coincidePrecio && coincideHuespedes;
    });

    renderizarTarjetas(filtrados);
}

function renderizarTarjetas(lista) {
    const contenedor = document.getElementById('contenedor-anuncios');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    
    lista.forEach(anuncio => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative';
        
        let precioHTML = `<p class="text-xl font-black text-slate-900">$${anuncio.precio} <span class="text-xs font-normal text-slate-500">MXN / noche</span></p>`;
        let etiquetaOferta = '';

        if (anuncio.precio_descuento && parseFloat(anuncio.precio_descuento) > 0) {
            etiquetaOferta = `<span class="absolute top-6 left-6 bg-red-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm z-10">Oferta</span>`;
            precioHTML = `
                <div class="text-right">
                    <span class="text-xs text-slate-400 line-through block">$${anuncio.precio} MXN</span>
                    <p class="text-xl font-black text-red-600">$${anuncio.precio_descuento} <span class="text-xs font-normal text-slate-500">MXN / noche</span></p>
                </div>
            `;
        }

        // --- EXTRACCIÓN Y CONFIGURACIÓN DE LA PORTADA ---
        let primeraImagen = 'default.jpg';
        let origenImagenes = anuncio.imagen || anuncio.imagenes_adicionales;

        if (origenImagenes) {
            try {
                const arregloFotos = typeof origenImagenes === 'string' ? JSON.parse(origenImagenes) : origenImagenes;
                if (Array.isArray(arregloFotos) && arregloFotos.length > 0) {
                    primeraImagen = arregloFotos[0].replace(/[\[\]"']/g, '').trim();
                } else if (typeof origenImagenes === 'string' && origenImagenes.trim() !== '') {
                    primeraImagen = origenImagenes.replace(/[\[\]"']/g, '').trim();
                }
            } catch (e) {
                primeraImagen = origenImagenes.replace(/[\[\]"']/g, '').trim();
            }
        }

        // Si es una imagen local, Express requiere el prefijo /uploads/
        let srcFinal = (primeraImagen.startsWith('http') || primeraImagen.startsWith('/uploads/')) 
            ? primeraImagen 
            : `/uploads/${primeraImagen}`;

        tarjeta.innerHTML = `
            ${etiquetaOferta}
            <div>
                <img src="${srcFinal}" class="w-full h-48 object-cover rounded-xl mb-4" alt="${anuncio.titulo}" onerror="this.onerror=null; this.src='/default.jpg';">
                
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold uppercase tracking-wider text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-100">${anuncio.tipo_propiedad || 'Habitación'}</span>
                    <span class="text-xs text-slate-400 font-medium">ID: ${anuncio.id_interno || anuncio.id}</span>
                </div>
                <h3 class="font-bold text-lg text-slate-900 mb-1 line-clamp-1">${anuncio.titulo}</h3>
                <p class="text-sm text-slate-500 mb-3 flex items-center gap-1">
                    <span>${anuncio.ubicacion_nombre ? anuncio.ubicacion_nombre + ' • ' : ''}${anuncio.zona || 'Sin Zona'}, ${anuncio.ciudad || 'Sin Ciudad'}</span>
                </p>
                
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
                    ${precioHTML}
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

window.abrirModalDetalles = function(id) {
    const anuncio = todosLosAnuncios.find(a => a.id === id);
    if (!anuncio) return;

    const modal = document.getElementById('modal-detalles');
    if (!modal) return alert("Error: No se encontró la estructura de modal-detalles en el HTML.");

    let todasLasFotos = [];

    // Procesamos el campo 'imagen'
    if (anuncio.imagen) {
        try {
            const arr = typeof anuncio.imagen === 'string' ? JSON.parse(anuncio.imagen) : anuncio.imagen;
            if (Array.isArray(arr)) {
                arr.forEach(f => f && todasLasFotos.push(f.replace(/[\[\]"']/g, '').trim()));
            } else {
                todasLasFotos.push(anuncio.imagen.replace(/[\[\]"']/g, '').trim());
            }
        } catch(e) {
            todasLasFotos.push(anuncio.imagen.replace(/[\[\]"']/g, '').trim());
        }
    }

    // Procesamos el campo 'imagenes_adicionales'
    if (anuncio.imagenes_adicionales) {
        try {
            const extras = typeof anuncio.imagenes_adicionales === 'string' ? JSON.parse(anuncio.imagenes_adicionales) : anuncio.imagenes_adicionales;
            if (Array.isArray(extras)) {
                extras.forEach(foto => { 
                    if (foto) todasLasFotos.push(foto.replace(/[\[\]"']/g, '').trim()); 
                });
            }
        } catch (e) { 
            console.error("Error al parsear fotos adicionales:", e); 
        }
    }

    if (todasLasFotos.length === 0) todasLasFotos.push('default.jpg');

    // Asignar portada del modal
    const imgPortada = document.getElementById('det-imagen');
    if (imgPortada) {
        let pathPortada = (todasLasFotos[0].startsWith('http') || todasLasFotos[0].startsWith('/uploads/')) ? todasLasFotos[0] : `/uploads/${todasLasFotos[0]}`;
        imgPortada.src = pathPortada;
        imgPortada.onerror = function() { this.src = '/default.jpg'; };
    }

    // Renderizar Swiper con todas las fotos limpias
    const swiperWrapper = modal.querySelector('.swiper-wrapper');
    if (swiperWrapper) {
        swiperWrapper.innerHTML = todasLasFotos.map(foto => {
            let urlFoto = (foto.startsWith('http') || foto.startsWith('/uploads/')) ? foto : `/uploads/${foto}`;
            return `
                <div class="swiper-slide">
                    <img src="${urlFoto}" class="w-full h-72 md:h-96 object-cover rounded-2xl shadow-inner" alt="${anuncio.titulo}" onerror="this.onerror=null; this.src='/default.jpg';">
                </div>
            `;
        }).join('');

        setTimeout(() => {
            if (window.swiperGaleria && typeof window.swiperGaleria.update === 'function') {
                window.swiperGaleria.update();
                window.swiperGaleria.slideTo(0, 0);
            }
        }, 150);
    }

    // Datos del resto del modal
    document.getElementById('det-titulo').innerText = anuncio.titulo;
    document.getElementById('det-tipo').innerText = anuncio.tipo_propiedad || 'Habitación';
    document.getElementById('det-ubicacion').innerText = `${anuncio.ubicacion_nombre ? anuncio.ubicacion_nombre + ' • ' : ''}${anuncio.zona || ''}, ${anuncio.ciudad || ''}`;
    
    if (anuncio.precio_descuento && parseFloat(anuncio.precio_descuento) > 0) {
        document.getElementById('det-precio').innerHTML = `<span class="text-sm text-slate-400 line-through mr-2">$${anuncio.precio}</span> $${anuncio.precio_descuento} MXN`;
    } else {
        document.getElementById('det-precio').innerText = `$${anuncio.precio} MXN`;
    }

    document.getElementById('det-recamaras').innerText = anuncio.recamaras || 1;
    document.getElementById('det-camas').innerText = anuncio.camas || 1;
    document.getElementById('det-banos').innerText = anuncio.banos || 1;
    document.getElementById('det-personas').innerText = anuncio.capacidad_personas || 1;
    document.getElementById('det-descripcion').innerText = anuncio.descripcion || 'Sin descripción detallada.';
    document.getElementById('det-amenidades').innerText = anuncio.amenidades || 'Ninguna descrita.';
    
    const btnAirbnb = document.getElementById('det-link-airbnb');
    if(anuncio.link_airbnb) {
        const parametrosActuales = window.location.search; 
        btnAirbnb.href = `/api/redirect-airbnb/${anuncio.id}${parametrosActuales}`;
        btnAirbnb.classList.remove('hidden');
    } else {
        btnAirbnb.classList.add('hidden');
    }

    modal.classList.replace('hidden', 'flex');
};

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

window.verCalendario = async function(id) {
    const modal = document.getElementById('modal-calendario');
    if (!modal) return alert("Error: No se encontró el modal-calendario en el HTML.");
    const anuncio = todosLosAnuncios.find(a => a.id === id);
    const linkAirbnb = anuncio ? anuncio.link_airbnb : null;
    const mapaFechas = await apiCall(`/api/anuncios/${id}/calendario-capsula`);
    if (mapaFechas) {
        modal.classList.replace('hidden', 'flex');
        renderizarCalendarioVisual(mapaFechas, linkAirbnb);
    } else {
        alert("No se pudo obtener el estado de ocupación.");
    }
};

function renderizarCalendarioVisual(mapaFechas, linkAirbnb) {
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
        const fechaDia = new Date(año, mes, dia);
        hoy.setHours(0,0,0,0); 
        const esDiaPasado = fechaDia < hoy;

        let claseColor = ''; 
        let atributosExtra = '';

        if (esDiaPasado) {
            claseColor = 'bg-slate-50 text-slate-300 border-slate-100 line-through cursor-not-allowed';
        } else if (estado === 'llegada') {
            claseColor = 'marcador-llegada marcador-activo text-white font-bold cursor-not-allowed';
        } else if (estado === 'salida') {
            claseColor = 'marcador-salida marcador-activo text-white font-bold cursor-not-allowed';
        } else if (estado === 'intermedio') {
            claseColor = 'bg-slate-200 text-slate-400 dia-pasado line-through cursor-not-allowed';
        } else {
            claseColor = 'bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-500 hover:text-white font-semibold cursor-pointer shadow-xs transform hover:scale-105 transition-all';
            if (linkAirbnb) {
                atributosExtra = `onclick="window.open('${linkAirbnb}', '_blank')" title="¡Disponible! Clic para reservar en Airbnb"`;
            }
        }
        contenedor.innerHTML += `
            <div data-fecha="${formatoFechaStr}" ${atributosExtra} class="p-3 border text-center rounded-xl text-sm ${claseColor}">
                ${dia}
            </div>`;
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

// buscador de index.js
document.addEventListener('DOMContentLoaded', function () {
    const formBuscador = document.getElementById('form-buscador');

    if (formBuscador) {
        formBuscador.addEventListener('submit', function (e) {
            e.preventDefault(); 
            
            const checkInRaw = document.getElementById('checkIn').value;
            const checkOutRaw = document.getElementById('checkOut').value;

            if (checkInRaw === "Add date" || checkOutRaw === "Add date" || !checkInRaw || !checkOutRaw) {
                alert('Por favor, selecciona las fechas de Check-in y Check-out.');
                return;
            }
            
            const adultosInput = formBuscador.querySelector('input[name="adults"]');
            const niñosInput = formBuscador.querySelector('input[name="children"]');

            const adults = adultosInput ? (parseInt(adultosInput.value) || 1) : 1;
            const children = niñosInput ? (parseInt(niñosInput.value) || 0) : 0;
            const totalGuests = adults + children;

            const checkIn = formatearFechaParaAirbnb(checkInRaw);
            const checkOut = formatearFechaParaAirbnb(checkOutRaw);

            // Redireccionamos LOCALMENTE a tu página de habitaciones mandando los filtros
            // Cambia 'rooms.html' por tu ruta exacta si usas rutas limpias (ej. '/rooms')
            const urlRedireccion = `rooms.html?check_in=${checkIn}&check_out=${checkOut}&guests=${totalGuests}&adults=${adults}&children=${children}`;

            // Redirige en la misma pestaña para mantener la experiencia de usuario
            window.location.href = urlRedireccion;
        });
    }
});

function formatearFechaParaAirbnb(fechaStr) {
    if (fechaStr.includes('.')) {
        const partes = fechaStr.split('.'); 
        if (partes[2] && partes[2].length === 4) {
            return `${partes[2]}-${partes[0]}-${partes[1]}`; 
        }
    }
    if (fechaStr.includes('/')) {
        const partes = fechaStr.split('/');
        if (partes[2] && partes[2].length === 4) {
            return `${partes[2]}-${partes[0]}-${partes[1]}`;
        }
    }
    return fechaStr; 
}

// hotel rooms index.html
document.addEventListener('DOMContentLoaded', function () {
    // Buscamos las 2 estructuras de lista que dejamos listas en el HTML
    const tarjetasEstaticas = document.querySelectorAll('.item-home-dinamico');
    
    if (tarjetasEstaticas.length > 0) {
        fetch('/api/anuncios-cards')
            .then(response => {
                if (!response.ok) throw new Error('Error al obtener datos del servidor');
                return response.json();
            })
            .then(anuncios => {
                // Recorremos las dos tarjetas físicas de nuestro HTML
                tarjetasEstaticas.forEach((tarjeta, index) => {
                    const anuncio = anuncios[index]; // Asignamos el anuncio correspondiente (0 o 1)
                    
                    if (anuncio) {
                        // Inyectamos los datos reemplazando los placeholders
                        tarjeta.querySelector('.home-room-title').textContent = anuncio.titulo;
                        tarjeta.querySelector('.home-room-title').href = `room.html?id=${anuncio.id}`;
                        tarjeta.querySelector('.home-room-price').textContent = `$${anuncio.precio}`;
                        tarjeta.querySelector('.home-room-capacity').textContent = anuncio.capacidad_personas || '2';
                        tarjeta.querySelector('.home-room-beds').textContent = anuncio.camas || '1';
                        
                        // Control y visualización inteligente de imágenes
                        const imgElement = tarjeta.querySelector('.home-room-image');
                        if (imgElement && anuncio.imagen) {
                            if (anuncio.imagen.startsWith('http://') || anuncio.imagen.startsWith('https://')) {
                                imgElement.src = anuncio.imagen;
                                // Si tu plantilla usa lazyload, actualizamos el atributo data-src por si acaso
                                imgElement.setAttribute('data-src', anuncio.imagen);
                            } else {
                                imgElement.src = `/uploads/${anuncio.imagen}`;
                                imgElement.setAttribute('data-src', `/uploads/${anuncio.imagen}`);
                            }
                        }

                        // Redirección de disponibilidad de Airbnb
                        tarjeta.querySelector('.home-room-link').href = `/api/redirect-airbnb/${anuncio.id}?guests=1`;
                    }
                });
            })
            .catch(error => {
                console.error('Error cargando la información en el Home:', error);
            });
    }
});

// find suitable index.html

document.addEventListener('DOMContentLoaded', () => {
    // Verificamos si la función existe antes de llamarla para evitar errores
    if (typeof cargarAnunciosHome === 'function') {
        cargarAnunciosHome();
    }
});

async function cargarAnunciosHome() {
    // Hacemos la petición al API (que ya trae el ORDER BY RAND() desde el backend)
    const anuncios = await apiCall('/api/anuncios');
    if (!anuncios || anuncios.length === 0) return;

    // 1. Llenar los cuadros superiores de habitaciones (.item-home-dinamico)
    // Esto funcionará tanto en index.html como en about.html
    const elementosDinamicos = document.querySelectorAll('.item-home-dinamico');
    elementosDinamicos.forEach((elemento, index) => {
        const anuncio = anuncios[index];
        if (!anuncio) return;

        const img = elemento.querySelector('.home-room-image');
        if (img) img.src = `/uploads/${anuncio.imagen || 'placeholder.jpg'}`;

        const price = elemento.querySelector('.home-room-price');
        if (price) price.innerText = `$${anuncio.precio}`;

        const title = elemento.querySelector('.home-room-title');
        if (title) {
            title.innerText = anuncio.titulo;
            title.href = `rooms.html`; 
        }

        const capacity = elemento.querySelector('.home-room-capacity');
        if (capacity) capacity.innerText = anuncio.capacidad_personas || anuncio.capacidad || '2';

        const beds = elemento.querySelector('.home-room-beds');
        if (beds) beds.innerText = anuncio.camas || '1';

        const link = elemento.querySelector('.home-room-link');
        if (link) link.href = `rooms.html`;
    });

    // 2. Llenar la sección de promoción inferior (SOLO si existe en la página actual, ej. index.html)
    const promoTitulo = document.getElementById('anuncio-titulo');
    if (promoTitulo) { 
        // Si encontramos el título de la promo, significa que estamos en index.html
        // Elegimos un anuncio completamente al azar de la lista obtenida
        const anuncioPromo = anuncios[Math.floor(Math.random() * anuncios.length)];

        if (anuncioPromo) {
            const promoDescripcion = document.getElementById('anuncio-descripcion');
            const promoHabitacion = document.getElementById('anuncio-habitacion');
            const promoPrecio = document.getElementById('anuncio-precio');
            const promoEnlace = document.getElementById('anuncio-enlace');

            promoTitulo.innerText = `¡Destacado! ${anuncioPromo.titulo}`;
            if (promoDescripcion) promoDescripcion.innerText = anuncioPromo.descripcion_corta || 'Ven a conocer nuestro espacio ideal con excelentes amenidades y la comodidad que buscas.';
            if (promoHabitacion) promoHabitacion.innerText = `${anuncioPromo.tipo_propiedad || 'Habitación'} en ${anuncioPromo.zona || 'Excelente Ubicación'}`;
            if (promoPrecio) promoPrecio.innerText = `$${anuncioPromo.precio}`;
            if (promoEnlace) promoEnlace.href = `rooms.html`;
        }
    }
}

// rooms.html filtrado
document.addEventListener('DOMContentLoaded', function () {
    // 1. Obtener los parámetros de búsqueda de la URL actual
    const urlParams = new URLSearchParams(window.location.search);
    const checkIn = urlParams.get('check_in');
    const checkOut = urlParams.get('check_out');
    const guests = urlParams.get('guests');
    const adults = urlParams.get('adults');
    const children = urlParams.get('children');

    // Si existen parámetros de búsqueda, significa que el usuario usó el buscador
    if (checkIn && checkOut) {
        console.log("Filtrando anuncios para las fechas:", checkIn, "al", checkOut);
        
        // AQUÍ: Si haces fetch a tu backend para traer cuartos, puedes pasarle los datos:
        // fetch(`/api/anuncios?check_in=${checkIn}&check_out=${checkOut}...`)
        
        // 2. Modificar dinámicamente los botones de "Ver disponibilidad" / "Reservar" de cada cuarto
        // Supongamos que tus botones tienen la clase '.btn-reservar' u otra similar:
        setTimeout(() => { 
            // Usamos un pequeño timeout por si tus cuartos cargan asíncronamente desde la base de datos
            const botonesReserva = document.querySelectorAll('.media_card-btn, .btn-reservar'); 
            
            botonesReserva.forEach(boton => {
                const urlOriginal = boton.getAttribute('href');
                
                // Si el botón apunta a tu endpoint de redirección (ej: /api/redirect-airbnb/3)
                // Le concatenamos los filtros actuales de la URL
                if (urlOriginal && urlOriginal.includes('/api/redirect-airbnb/')) {
                    boton.setAttribute('href', `${urlOriginal}?check_in=${checkIn}&check_out=${checkOut}&guests=${guests}&adults=${adults}&children=${children}`);
                    // Aseguramos que se abra en pestaña nueva al hacer clic final
                    boton.setAttribute('target', '_blank');
                }
            });
        }, 500);
    }
});

//preguntas

document.addEventListener('DOMContentLoaded', () => {
    cargarPreguntasDinamicas();
});

async function cargarPreguntasDinamicas() {
    const contenedor = document.getElementById('contenedor-preguntas');
    if (!contenedor) return;

    try {
        const response = await fetch('/api/faqs');
        const preguntas = await response.json();

        // Mantenemos la tarjeta de "Preguntas" (la que trae el botón)
        const tarjetaPregunta = contenedor.querySelector('.about_faq-main_card');
        
        // Limpiamos el contenedor, pero conservamos la tarjeta original al final
        contenedor.innerHTML = ''; 

        preguntas.forEach((p, index) => {
            const div = document.createElement('div');
            // Esta clase es la que le da el estilo de "tarjeta" en tu plantilla
            div.className = 'accordion_component-item';
            
            // Esta estructura es la que usa Bootstrap y tu plantilla Hosteller para los acordeones
            div.innerHTML = `
                <div class="item-wrapper d-flex flex-column justify-content-between">
                    <h4 class="accordion_component-item_header d-flex justify-content-between align-items-center ${index !== 0 ? 'collapsed' : ''}"
                        data-bs-toggle="collapse"
                        data-bs-target="#item-${p.id}"
                        aria-expanded="${index === 0 ? 'true' : 'false'}">
                        ${p.pregunta}
                        <span class="wrapper">
                            <i class="icon-chevron_down icon transform"></i>
                        </span>
                    </h4>
                    <div id="item-${p.id}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}">
                        <div class="accordion_component-item_body">
                            ${p.respuesta}
                        </div>
                    </div>
                </div>
            `;
            contenedor.appendChild(div);
        });

        // Volvemos a añadir la tarjeta de contacto original
        if (tarjetaPregunta) {
            contenedor.appendChild(tarjetaPregunta);
        }
        
    } catch (error) {
        console.error('Error cargando las preguntas:', error);
    }
}

// CARGAR DATOS (HEADER Y FOOTER) 
async function cargarHeaderDinamico() {
    try {
        const response = await fetch('/api/header-completo');
        if (!response.ok) throw new Error('No se pudo obtener la configuración global');
        const data = await response.json();

        const { config, paginas, redes } = data;

        // ========================================================
        // 1. ACTUALIZAR EL LOGO Y NOMBRE DE LA MARCA EN TODOS LADOS
        // ========================================================
        if (config) {
            // Reemplaza todos los SVG (Header, Offcanvas, Footer)
            document.querySelectorAll('.brand_logo').forEach(contenedorLogo => {
                contenedorLogo.innerHTML = config.logo_svg || '';
            });

            // Reemplaza el texto "Hosteller" en todos lados
            document.querySelectorAll('.brand_name').forEach(contenedorNombre => {
                contenedorNombre.textContent = config.nombre_marca || 'Hosteller';
            });
            
            // Asegura que todos los contenedores de marca lleven al inicio
            document.querySelectorAll('.brand').forEach(enlaceMarca => {
                enlaceMarca.setAttribute('href', '/');
            });
        }

        // ========================================================
        // 2. RENDERIZAR LAS PÁGINAS DEL MENÚ (ARRIBA Y ABAJO)
        // ========================================================
        if (paginas) {
            // A) Construir e inyectar en el Header
            const navList = document.querySelector('.header_nav-list');
            if (navList) {
                navList.innerHTML = ''; 
                paginas.forEach(item => {
                    const esActiva = window.location.pathname === item.url_estetica ? 'active' : '';
                    navList.innerHTML += `
                        <li class="header_nav-list_item">
                            <a class="nav-item ${esActiva}" href="${item.url_estetica}">${item.nombre_visible}</a>
                        </li>`;
                });
            }

            // B) Construir e inyectar en el Footer (Quick Links)
            const footerNav = document.querySelector('.footer_main-block_nav');
            if (footerNav) {
                footerNav.innerHTML = '';
                paginas.forEach(item => {
                    footerNav.innerHTML += `
                        <li class="list-item">
                            <a class="link underlined underlined--white nav-item" href="${item.url_estetica}">${item.nombre_visible}</a>
                        </li>`;
                });
            }
        }

        // ========================================================
        // 3. ACTUALIZAR ENLACES DE REDES SOCIALES (ARRIBA Y ABAJO)
        // ========================================================
        if (redes) {
            let redesHTML = '';
            redes.forEach(red => {
                if (red.url && red.url.trim() !== '') {
                    redesHTML += `
                        <li class="list-item">
                            <a class="link" href="${red.url}" target="_blank" rel="noopener noreferrer">
                                <i class="${red.icono}"></i>
                            </a>
                        </li>`;
                }
            });

            // Inyectar en el menú lateral desplegable (Offcanvas)
            const socialsListHeader = document.querySelector('.header_offcanvas .socials');
            if (socialsListHeader) socialsListHeader.innerHTML = redesHTML;

            // Inyectar en la sección "Follow Us" del Footer
            const socialsListFooter = document.querySelector('.footer_main-block--follow .socials');
            if (socialsListFooter) socialsListFooter.innerHTML = redesHTML;
        }

    } catch (error) {
        console.error('Error al renderizar los datos dinámicos:', error);
    }
}

// Aseguramos que la función corra automáticamente en cuanto cargue el DOM de cualquier página
document.addEventListener('DOMContentLoaded', () => {
    cargarHeaderDinamico();
});

//footer 

async function cargarFooterPublico() {
    try {
        const response = await fetch('/api/footer');
        if (!response.ok) throw new Error(`Estado de respuesta inválido: ${response.status}`);
        
        const datos = await response.json();
        if (!datos) return;

        // 1. Cambiar descripción de marca en el footer
        const descFooter = document.getElementById('public-footer-descripcion');
        if (descFooter) descFooter.innerText = datos.footer_descripcion || '';

        // 2. Cambiar título de la columna de enlaces
        const titleLinks = document.getElementById('public-footer-title-links');
        if (titleLinks) titleLinks.innerText = datos.footer_titulo_links || '';

        // 3. Cambiar título de columna contacto y líneas de dirección de forma segura
        const titleContacto = document.getElementById('public-footer-title-contacto');
        if (titleContacto) titleContacto.innerText = datos.footer_titulo_contacto || '';

        const direccionContainer = document.getElementById('public-footer-direccion');
        if (direccionContainer) {
            direccionContainer.innerHTML = `
                <span class="linebreak">${datos.footer_direccion_linea1 || ''}</span>
                <span class="linebreak">${datos.footer_direccion_linea2 || ''}</span>
            `;
        }

        // 4. Cambiar teléfonos con etiquetas <a> manteniendo estilos correctos
        const telefonosContainer = document.getElementById('public-footer-telefonos');
        if (telefonosContainer) {
            telefonosContainer.innerHTML = '';
            if (datos.footer_telefono1 && datos.footer_telefono1.trim() !== '') {
                telefonosContainer.innerHTML += `<a class="link" href="tel:${datos.footer_telefono1.replace(/\s+/g, '')}">${datos.footer_telefono1}</a>`;
            }
            if (datos.footer_telefono2 && datos.footer_telefono2.trim() !== '') {
                telefonosContainer.innerHTML += `<a class="link" href="tel:${datos.footer_telefono2.replace(/\s+/g, '')}">${datos.footer_telefono2}</a>`;
            }
        }

        // 5. Cambiar título y texto del bloque de redes sociales
        const titleRedes = document.getElementById('public-footer-title-redes');
        if (titleRedes) titleRedes.innerText = datos.footer_titulo_redes || '';

        const textoRedes = document.getElementById('public-footer-texto-redes');
        if (textoRedes) textoRedes.innerText = datos.footer_texto_redes || '';

        // 6. Cambiar la estructura de Copyright manteniendo el formato original
        const copyrightContainer = document.getElementById('public-footer-copyright') || document.querySelector('.footer_copyright-text');
        if (copyrightContainer) {
            copyrightContainer.innerHTML = `
                <span class="linebreak">${datos.footer_copyright_linea1 || ''}</span>
                <span class="linebreak">${datos.footer_copyright_linea2 || ''}</span>
            `;
        }
    } catch (error) {
        console.error('Error al renderizar los componentes del footer público:', error);
    }
}

// Lo ejecutas automáticamente cuando cargue la página web
document.addEventListener('DOMContentLoaded', () => {
    cargarFooterPublico();
});