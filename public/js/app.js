let todosLosAnuncios = [];
let contadorHuespedes = 1;


function obtenerRutaImagen(ruta) {
    if (!ruta) return '/uploads/placeholder.jpg'; // Imagen por defecto si está vacío
    
    // Si ya es una URL completa (ej. si vuelves a usar Cloudinary o enlaces externos)
    if (ruta.startsWith('http://') || ruta.startsWith('https://')) {
        return ruta;
    }
    
    // ¡CANDADO AQUÍ!: Si la cadena ya empieza con /uploads/, la dejamos intacta
    if (ruta.startsWith('/uploads/')) {
        return ruta;
    }
    
    // Si solo viene el nombre limpio del archivo suelto, le añade el prefijo
    return `/uploads/${ruta}`;
}

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
    console.log("Iniciando carga de componentes...");
    
    try {
        const configRaw = await apiCall('/api/configuracion'); // Asegúrate que este endpoint exista
        if (!configRaw) {
            console.warn("No se pudo obtener la configuración de la API.");
            return;
        }

        // SALVAVIDAS: Si la respuesta es un arreglo, tomamos el primer elemento automáticamente
        const config = Array.isArray(configRaw) ? configRaw[0] : configRaw;
        console.log("Datos de configuración cargados con éxito:", config);

        if (config && config.favicon) {
            aplicarFavicon(config.favicon);
        }

        // Función auxiliar mejorada para manejar logos y nombres de marca de forma condicional
        const inyectarLogo = (idElemento, archivoLogo) => {
            const elemento = document.getElementById(idElemento);
            if (!elemento) {
                console.warn(`Elemento #${idElemento} no encontrado en el DOM de esta página.`);
                return;
            }

            // Buscamos el contenedor principal (.brand) y el elemento de texto (.brand_name) antes de alterar el DOM
            const contenedorBrand = elemento.closest('.brand');
            const textoMarca = contenedorBrand ? contenedorBrand.querySelector('.brand_name') : null;

            // Expresión regular para detectar formatos de imagen de forma segura (sin importar mayúsculas)
            const esImagenValida = archivoLogo && (
                archivoLogo.startsWith('http') || 
                /\.(jpg|jpeg|png|webp|svg|gif)$/i.test(archivoLogo)
            );

            if (esImagenValida) {
                // Validamos si existe obtenerRutaImagen para evitar errores si no está definida
                const srcFinal = typeof obtenerRutaImagen === 'function' ? obtenerRutaImagen(archivoLogo) : archivoLogo;
                
                elemento.outerHTML = `
                    <img 
                        id="${idElemento}" 
                        src="${srcFinal}" 
                        alt="Logotipo" 
                        style="width: 120px; height: 40px; object-fit: contain; background: transparent; display: inline-block; vertical-align: middle;"
                    />`;

                // CONDICIONAL: Al tener un logo en imagen personalizado, ocultamos el texto de la marca
                if (textoMarca) {
                    textoMarca.style.display = 'none';
                }
            } 
            // Si es código SVG directo insertado en la BD
            else if (archivoLogo && archivoLogo.includes('<svg')) {
                elemento.outerHTML = archivoLogo;

                // CONDICIONAL: Al tener un logo en SVG personalizado, ocultamos el texto de la marca
                if (textoMarca) {
                    textoMarca.style.display = 'none';
                }
            } 
            // Si NO se tiene un logo cargado (vacío, nulo o indefinido)
            else {
                if (typeof svgPorDefecto !== 'undefined') {
                    elemento.outerHTML = svgPorDefecto.replace('<svg ', `<svg id="${idElemento}" `);
                } else {
                    console.warn(`No hay logo asignado para #${idElemento} y tampoco se encontró 'svgPorDefecto'.`);
                }

                // CONDICIONAL: Si no hay logo personalizado, mostramos el nombre de marca dinámico desde la BD
                if (textoMarca) {
                    textoMarca.style.display = 'inline-block';
                    textoMarca.textContent = config.nombre_marca || 'Hosteller'; // Fallback por si la BD está vacía
                }
            }
        };

        // 2. Inyectar el Logo del Header (Barra principal y menú desplegable lateral)
        inyectarLogo('brandHeader', config.header_logo);
        inyectarLogo('brandOffset', config.header_logo);

        // 3. Inyectar el Logo del Footer de manera independiente
        inyectarLogo('brandFooter', config.footer_logo);
        
        // 4. Asegurar que todos los contenedores de marca lleven al inicio
        document.querySelectorAll('.brand').forEach(enlaceMarca => {
            enlaceMarca.setAttribute('href', '/');
        });

    } catch (err) {
        console.error("Error crítico en inicializarPagina:", err);
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

function extraerArregloImagenes(campo) {
    if (!campo) return [];
    if (Array.isArray(campo)) return campo.map(f => String(f).trim()).filter(Boolean);
    
    try {
        // Si viene como string de un arreglo JSON: '["foto1.jpg", "foto2.jpg"]'
        if (typeof campo === 'string' && (campo.startsWith('[') || campo.includes('"') || campo.includes("'"))) {
            const parsed = JSON.parse(campo);
            if (Array.isArray(parsed)) {
                return parsed.map(f => String(f).trim()).filter(Boolean);
            }
        }
    } catch (e) {
        // Si falla el JSON.parse, continuará con la limpieza limpia por comas
    }

    // Si viene como string separado por comas o un solo archivo
    return campo.replace(/[\[\]"']/g, '').split(',').map(f => f.trim()).filter(Boolean);
}

function renderizarAnunciosPublicos(anuncios) {
    const contenedor = document.getElementById('contenedor-anuncios');
    
    if (!anuncios || anuncios.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-500 col-span-full text-center py-8">No hay habitaciones disponibles en este momento.</p>';
        return;
    }

    contenedor.innerHTML = ''; // Limpiamos por completo el mensaje de "Cargando..."

    anuncios.forEach(anuncio => {
        try {
            // 1. ===============================================
            // PARSEO SEGURO DE IMÁGENES HACIA /UPLOADS/
            // ===============================================
            let fotoPortada = 'placeholder.jpg';
            
            // Evaluamos si trae imagen única principal
            if (anuncio.imagen && anuncio.imagen.trim() !== '') {
                fotoPortada = anuncio.imagen.trim();
            } else if (anuncio.imagenes_adicionales) {
                // Si por alguna razón la imagen está en el JSON adicional
                try {
                    const arrayFotos = typeof anuncio.imagenes_adicionales === 'string' 
                        ? JSON.parse(anuncio.imagenes_adicionales) 
                        : anuncio.imagenes_adicionales;
                    
                    if (Array.isArray(arrayFotos) && arrayFotos.length > 0) {
                        fotoPortada = arrayFotos[0].trim();
                    }
                } catch (e) {
                    console.warn(`Error parseando imágenes extra en anuncio ${anuncio.id}`);
                }
            }

            // Normalizamos para no sobreescribir si ya trae HTTP
            const rutaImagen = (fotoPortada.startsWith('http') || fotoPortada.startsWith('/uploads/')) 
                ? fotoPortada 
                : `/uploads/${fotoPortada}`;

            // 2. ===============================================
            // ETIQUETAS DE PRECIO Y OFERTA
            // ===============================================
            let precioHTML = `<p class="text-xl font-black text-slate-900">$${anuncio.precio || 0} <span class="text-xs font-normal text-slate-500">MXN / noche</span></p>`;
            let etiquetaOferta = '';

            if (anuncio.precio_descuento && parseFloat(anuncio.precio_descuento) > 0) {
                etiquetaOferta = `<span class="absolute top-6 left-6 bg-red-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm z-10">Oferta</span>`;
                precioHTML = `
                    <div class="text-right">
                        <span class="text-xs text-slate-400 line-through block">$${anuncio.precio || 0} MXN</span>
                        <p class="text-xl font-black text-red-600">$${anuncio.precio_descuento} <span class="text-xs font-normal text-slate-500">MXN / noche</span></p>
                    </div>
                `;
            }

            // 3. ===============================================
            // ARMADO Y CREACIÓN DE LA TARJETA
            // ===============================================
            const tarjeta = document.createElement('div');
            tarjeta.className = "bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative";
            
            const textoUbicacion = anuncio.ubicacion_nombre || 'Ubicación no especificada';

            tarjeta.innerHTML = `
                ${etiquetaOferta}
                <div>
                    <div class="w-full h-48 rounded-xl overflow-hidden mb-4 bg-slate-100 border border-slate-200">
                        <img src="${rutaImagen}" class="w-full h-full object-cover transition-transform duration-300 hover:scale-105" alt="${anuncio.titulo || 'Habitación'}" onerror="this.onerror=null; this.src='/uploads/placeholder.jpg';">
                    </div>
                    
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold uppercase tracking-wider text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-md border border-cyan-100">
                            ${anuncio.tipo_propiedad || 'Habitación'}
                        </span>
                        <span class="text-xs text-slate-400 font-medium">ID: ${anuncio.id_interno || anuncio.id}</span>
                    </div>
                    
                    <h3 class="font-bold text-lg text-slate-900 mb-1 line-clamp-1">${anuncio.titulo || 'Sin título'}</h3>
                    <p class="text-sm text-slate-500 mb-3 flex items-center gap-1">
                        <span>${textoUbicacion}</span>
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
                        <button onclick="verCalendario(${anuncio.id})" class="w-full text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">
                            Calendario
                        </button>
                        <button onclick="abrirModalDetalles(${anuncio.id})" class="w-full text-center bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">
                            Ver Detalles
                        </button>
                    </div>
                </div>
            `;
            
            contenedor.appendChild(tarjeta);

        } catch (errorTarjeta) {
            console.error(`Error al procesar la tarjeta individual del anuncio ID ${anuncio.id}:`, errorTarjeta);
        }
    });
}

window.abrirModalDetalles = function(id) {
    const anuncio = todosLosAnuncios.find(a => a.id === id);
    if (!anuncio) return;

    const modal = document.getElementById('modal-detalles');
    if (!modal) return alert("Error: No se encontró la estructura de modal-detalles en el HTML.");

    // Unificamos todas las fotos disponibles del anuncio en una sola lista limpia
    let todasLasFotos = [
        ...extraerArregloImagenes(anuncio.imagen),
        ...extraerArregloImagenes(anuncio.imagenes_adicionales)
    ];

    if (todasLasFotos.length === 0) todasLasFotos.push('default.jpg');

    // 1. ASIGNAR PORTADA PRINCIPAL DEL MODAL (La primera del arreglo)
    const imgPortada = document.getElementById('det-imagen');
    if (imgPortada) {
        let pathPortada = (todasLasFotos[0].startsWith('http') || todasLasFotos[0].startsWith('/uploads/')) ? todasLasFotos[0] : `/uploads/${todasLasFotos[0]}`;
        imgPortada.src = pathPortada;
        imgPortada.onerror = function() { this.src = '/uploads/default.jpg'; };
    }

    // 2. RENDERIZAR EN EL SWIPER ÚNICAMENTE "LAS DEMÁS IMÁGENES"
    const swiperWrapper = modal.querySelector('.swiper-wrapper');
    if (swiperWrapper) {
        let fotosRestantes = todasLasFotos.slice(1);

        if (fotosRestantes.length === 0) {
            fotosRestantes = [todasLasFotos[0]];
        }

        swiperWrapper.innerHTML = fotosRestantes.map(foto => {
            let urlFoto = (foto.startsWith('http') || foto.startsWith('/uploads/')) ? foto : `/uploads/${foto}`;
            return `
                <div class="swiper-slide">
                    <img src="${urlFoto}" class="w-full h-72 md:h-96 object-cover rounded-2xl shadow-inner" alt="${anuncio.titulo}" onerror="this.onerror=null; this.src='/uploads/default.jpg';">
                </div>
            `;
        }).join('');

        // ==========================================================
        // REEMPLAZA TU TIMEOUT POR ESTE BLOQUE:
        // ==========================================================
        setTimeout(() => {
            // 1. Si ya existía un carrusel abierto antes, lo destruimos por completo
            if (window.swiperGaleria && typeof window.swiperGaleria.destroy === 'function') {
                window.swiperGaleria.destroy(true, true);
            }

            // 2. Inicializamos el nuevo Swiper de forma limpia para estas fotos
            window.swiperGaleria = new Swiper('.swiper-galeria-modal', {
                loop: false,
                spaceBetween: 10,
                slidesPerView: 1, 
                navigation: {
                    nextEl: '.swiper-button-next',
                    prevEl: '.swiper-button-prev',
                },
                pagination: {
                    el: '.swiper-pagination',
                    clickable: true,
                },
            });
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

        // config actuará como el contenedor de tus "visuales"
        const { config, paginas, redes } = data;

        // ========================================================
        // 1. ACTUALIZAR EL LOGO Y NOMBRE DE LA MARCA EN TODOS LADOS
        // ========================================================
        if (config) {
            const svgPorDefecto = `
                <svg width="22" height="23" viewBox="0 0 22 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M7.03198 3.80281V7.07652L3.86083 9.75137L0.689673 12.4263L0.667474 6.56503C0.655304 3.34138 0.663875 0.654206 0.686587 0.593579C0.71907 0.506918 1.4043 0.488223 3.87994 0.506219L7.03198 0.529106V3.80281ZM21.645 4.36419V5.88433L17.0383 9.76316C14.5046 11.8966 11.2263 14.6552 9.75318 15.8934L7.07484 18.145V20.3225V22.5H3.85988H0.64502L0.667303 18.768L0.689673 15.036L2.56785 13.4609C3.60088 12.5946 6.85989 9.85244 9.81009 7.36726L15.1741 2.84867L18.4096 2.8464L21.645 2.84413V4.36419ZM21.645 15.5549V22.5H18.431H15.217V18.2638V14.0274L15.4805 13.7882C15.8061 13.4924 21.5939 8.61606 21.6236 8.61248C21.6353 8.61099 21.645 11.7351 21.645 15.5549Z" fill="currentColor"/>
                </svg>
            `;

            // 1. Renderizar el nombre dinámico (se mantiene como respaldo)
            document.querySelectorAll('.brand_name, .nombre-marca-dinamico').forEach(el => {
                el.innerText = config.nombre_marca || 'Hosteller';
            });

            // FUNCIÓN AUXILIAR MEJORADA: Ahora acepta tamaño personalizado y remueve el texto extra
            const inyectarLogo = (idSvg, archivoLogo, altoDeseado = '40px') => {
                const elementoSvg = document.getElementById(idSvg);
                if (!elementoSvg) return;

                const contenedorPadre = elementoSvg.parentElement; // Captura el <span class="logo-svg-dinamico">
                if (!contenedorPadre) return;

                // Buscamos el texto de la marca (.brand_name) que está justo después en este mismo bloque
                const contenedorEnlace = contenedorPadre.closest('.brand') || contenedorPadre.parentElement;
                const textoMarca = contenedorEnlace ? contenedorEnlace.querySelector('.brand_name, .nombre-marca-dinamico') : null;

                // Si hay una imagen guardada en la Base de Datos
                if (archivoLogo && (archivoLogo.includes('.') || archivoLogo.startsWith('http'))) {
                    
                    // SOLUCIÓN: Si hay logo en imagen, ocultamos el texto de después para que no se encimen
                    if (textoMarca) {
                        textoMarca.style.display = 'none';
                    }

                    contenedorPadre.innerHTML = `
                        <img 
                            src="${obtenerRutaImagen(archivoLogo)}" 
                            alt="Logotipo" 
                            style="max-height: ${altoDeseado}; width: auto; object-fit: contain; background: transparent; display: inline-block; vertical-align: middle;"
                            onerror="this.onerror=null; this.src='/uploads/placeholder.jpg';"
                        />`;
                } else {
                    // Si no hay imagen, dejamos el SVG y volvemos a mostrar el texto original
                    contenedorPadre.innerHTML = svgPorDefecto;
                    if (textoMarca) {
                        textoMarca.style.display = 'inline-block';
                    }
                }
            };

            // ========================================================
            // 2. AJUSTA LOS TAMAÑOS AQUÍ (Hacerlos más grandes o chicos)
            // ========================================================
            // El tercer parámetro controla el alto máximo del logo en píxeles. ¡Cámbialo a tu gusto!
            inyectarLogo('brandHeader', config.header_logo, '45px'); // Desktop Header
            inyectarLogo('brandOffset', config.header_logo, '40px'); // Mobile/Sidebar Header
            inyectarLogo('brandFooter', config.footer_logo, '60px'); // El del Footer (¡Más grande!)

            // 4. Asegurar enlaces al inicio
            document.querySelectorAll('.brand').forEach(enlaceMarca => {
                enlaceMarca.setAttribute('href', 'index.html');
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

            // ========================================================
            // NUEVO: ACTUALIZAR MIGAS DE PAN Y TÍTULO DE LA PÁGINA ACTUAL
            // ========================================================
            // 1. Buscamos el nombre dinámico asignado a la página de Inicio (Home/Index)
            const paginaInicio = paginas.find(p => p.url_estetica === '/' || p.url_estetica === '/index.html');
            const elBreadcrumbHome = document.getElementById('breadcrumb-home');
            if (elBreadcrumbHome && paginaInicio) {
                elBreadcrumbHome.innerText = paginaInicio.nombre_visible;
            }

            // 2. Detectamos en qué ruta limpia estamos actualmente
            const rutaActual = window.location.pathname;

            // 3. Buscamos si la ruta actual coincide con alguna de las registradas en la Base de Datos
            const paginaActual = paginas.find(item => 
                rutaActual === item.url_estetica || 
                rutaActual.endsWith(item.url_estetica)
            );

            // 4. Si la encuentra, inyectamos el nombre que editaste desde el panel de administración
            if (paginaActual) {
                const elBreadcrumbCurrent = document.getElementById('breadcrumb-current');
                const elPageTitleCurrent = document.getElementById('page-title-current');

                if (elBreadcrumbCurrent) {
                    elBreadcrumbCurrent.innerText = paginaActual.nombre_visible;
                }
                if (elPageTitleCurrent) {
                    elPageTitleCurrent.innerText = paginaActual.nombre_visible;
                }
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

// Aseguramos que la función corra automáticamente en cuanto cargue el DOM de cualquier página
document.addEventListener('DOMContentLoaded', () => {
    cargarHeaderDinamico();
});


// Lo ejecutas automáticamente cuando cargue la página web
document.addEventListener('DOMContentLoaded', () => {
    cargarFooterPublico();
});

//FAVICON
async function subirFavicon() {
    const fileInput = document.getElementById('input-favicon');
    const file = fileInput.files[0];
    if (!file) return alert("Selecciona una imagen");

    const formData = new FormData();
    formData.append('image', file);

    // 1. Subir a la nube
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json(); 

    if (data.url) { // <--- AQUÍ ESTÁ EL CAMBIO: ahora usamos data.url
        // 2. Guardar la URL completa en la BD
        await fetch('/api/config/favicon', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoFavicon: data.url }) // Guardamos la URL
        });
        alert("Favicon actualizado con éxito");
    } else {
        alert("Error al subir la imagen");
    }
}

// =========================================================================
// RENDERIZADO DEL HERO EN INDEX.HTML
// =========================================================================

function obtenerRutaImagen(ruta) {
    if (!ruta) return '';
    if (ruta.startsWith('/') || ruta.startsWith('http')) return ruta;
    return `/uploads/${ruta}`;
}


async function renderizarHeroPublico() {

    const tituloHero = document.getElementById('render-hero-titulo');
    if (!tituloHero) return; 

    try {
        const response = await fetch('/api/cms/home');
        if (!response.ok) return;
        const datos = await response.json();

        if (datos) {

            tituloHero.innerText = datos.hero_titulo || 'Hosteller';
            if (document.getElementById('render-hero-descripcion')) {
                document.getElementById('render-hero-descripcion').innerText = datos.hero_descripcion || '';
            }


            const imgHero = document.querySelector('.hero_media img');
            const sourceHero = document.querySelector('.hero_media source');
            if (imgHero && datos.hero_imagen) {
                const rutaLimpia = obtenerRutaImagen(datos.hero_imagen);
                
                imgHero.src = rutaLimpia;
                imgHero.setAttribute('data-src', rutaLimpia);
                if (sourceHero) {
                    sourceHero.srcset = rutaLimpia;
                    sourceHero.setAttribute('data-srcset', rutaLimpia);
                }
            }


            if (document.getElementById('render-lbl-checkin')) {
                document.getElementById('render-lbl-checkin').innerHTML = `<i class="icon-calendar icon"></i>${datos.lbl_checkin || 'Check-in'}`;
            }
            if (document.getElementById('render-lbl-checkout')) {
                document.getElementById('render-lbl-checkout').innerHTML = `<i class="icon-calendar icon"></i>${datos.lbl_checkout || 'Check-out'}`;
            }
            if (document.getElementById('render-lbl-guests')) {
                document.getElementById('render-lbl-guests').innerText = datos.lbl_guests || 'Guests';
            }
            

            const lblAdults = document.querySelector('label[for="adults"]');
            if (lblAdults) lblAdults.innerText = datos.lbl_adults || 'Adults';
            
            const lblChildren = document.querySelector('label[for="children"]');
            if (lblChildren) lblChildren.innerText = datos.lbl_children || 'Children';


            if (document.getElementById('checkIn')) document.getElementById('checkIn').placeholder = datos.lbl_checkin || 'Add date';
            if (document.getElementById('checkOut')) document.getElementById('checkOut').placeholder = datos.lbl_checkout || 'Add date';


            if (document.getElementById('render-btn-search')) {
                document.getElementById('render-btn-search').innerText = datos.btn_search || 'Search';
            }
        }
    } catch (error) {
        console.error('Error al renderizar los datos del CMS en el Hero Público:', error);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    renderizarHeroPublico();
});


//================================================================
// ROOMS SECTION HOME
//================================================================


async function cargarRoomsSectionHome() {
    try {
        const response = await fetch('/api/home');
        if (!response.ok) throw new Error("Error al obtener la configuración del Home");
        const data = await response.json();
        
        if (!data) return;


        const h2Titulo = document.getElementById('rooms-header-title');
        if (h2Titulo && data.rooms_titulo) {
            h2Titulo.textContent = data.rooms_titulo;
        }
        const btnVerMas = document.getElementById('rooms-btn-ver-mas');
        if (btnVerMas && data.rooms_btn_ver_mas) {
            btnVerMas.textContent = data.rooms_btn_ver_mas;
        }


        const anunciosDinamicos = document.querySelectorAll('.item-home-dinamico');
        anunciosDinamicos.forEach(item => {
            

            const labelPricing = item.querySelector('.media_label--pricing');
            if (labelPricing && data.rooms_lbl_precio_noche) {
                const precioSpan = labelPricing.querySelector('.home-room-price');
                if (precioSpan) {
                    labelPricing.innerHTML = ''; 
                    labelPricing.appendChild(precioSpan); 
                    labelPricing.appendChild(document.createTextNode(' ' + data.rooms_lbl_precio_noche)); 
                }
            }


            const itemsAmenidades = item.querySelectorAll('.main_amenities-item');
            if (itemsAmenidades && itemsAmenidades.length >= 2) {
                

                const capSpan = itemsAmenidades[0].querySelector('.home-room-capacity');
                const iconoUser = itemsAmenidades[0].querySelector('.icon-user');
                if (capSpan && iconoUser && data.rooms_lbl_sleeps) {
                    itemsAmenidades[0].innerHTML = '';
                    itemsAmenidades[0].appendChild(iconoUser);
                    itemsAmenidades[0].appendChild(capSpan);
                    itemsAmenidades[0].appendChild(document.createTextNode(' ' + data.rooms_lbl_sleeps));
                }
                

                const camasSpan = itemsAmenidades[1].querySelector('.home-room-beds');
                const iconoCama = itemsAmenidades[1].querySelector('.icon-twin_bed, .icon-bunk_bed, .icon');
                if (camasSpan && iconoCama && data.rooms_lbl_beds) {
                    itemsAmenidades[1].innerHTML = '';
                    itemsAmenidades[1].appendChild(iconoCama);
                    itemsAmenidades[1].appendChild(camasSpan);
                    itemsAmenidades[1].appendChild(document.createTextNode(' ' + data.rooms_lbl_beds));
                }
            }


            const enlaceLink = item.querySelector('.home-room-link');
            if (enlaceLink && data.rooms_lbl_disponibilidad) {
                const iconoFlecha = enlaceLink.querySelector('.icon-arrow_right');
                enlaceLink.innerHTML = data.rooms_lbl_disponibilidad + ' ';
                if (iconoFlecha) enlaceLink.appendChild(iconoFlecha);
            }
        });

        const item3Title = document.getElementById('rooms-card-titulo');
        if (item3Title && data.rooms_card_titulo) item3Title.textContent = data.rooms_card_titulo;

        const item3Sub = document.getElementById('rooms-card-subtitulo');
        if (item3Sub && data.rooms_card_subtitulo) item3Sub.textContent = data.rooms_card_subtitulo;

        const item3L1 = document.getElementById('rooms-card-linea1');
        if (item3L1 && data.rooms_card_linea1) item3L1.innerHTML = data.rooms_card_linea1;

        const item3L2 = document.getElementById('rooms-card-linea2');
        if (item3L2 && data.rooms_card_linea2) item3L2.innerHTML = data.rooms_card_linea2;

        const item3Btn = document.getElementById('rooms-card-btn');
        if (item3Btn && data.rooms_card_btn) item3Btn.textContent = data.rooms_card_btn;

    } catch (error) {
        console.warn('Advertencia al renderizar dinámicamente Rooms Section:', error);
    }
}

//================================================================
// ABOUT SECTION HOME
//================================================================

function obtenerEmbedYouTube(url) {
    if (!url) return '';
    if (url.length === 11) {
        return `https://www.youtube.com/embed/${url}?autoplay=1&mute=1&loop=1&playlist=${url}`;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
        const videoId = match[2];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`;
    }
    if (url.includes('youtube.com/embed/')) return url;
    return '';
}

async function cargarAboutPublico() {
    try {
        const res = await fetch('/api/home/about');
        const datos = await res.json();
        if (!datos) return;

        const mapeoTextos = {
            'public-about-titulo': datos.about_titulo,
            'public-about-descripcion': datos.about_descripcion,
            'public-about-item1': datos.about_item1_text,
            'public-about-item2': datos.about_item2_text,
            'public-about-item3': datos.about_item3_text,
            'public-about-item4': datos.about_item4_text,
            'public-about-btn1': datos.about_btn1_text,
            'public-about-btn2': datos.about_btn2_text
        };


        for (const [id, valor] of Object.entries(mapeoTextos)) {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.textContent = valor || '';
            }
        }

        const iframeVideo = document.getElementById('public-about-video');
        const contenedorMensaje = document.getElementById('no-video-message');

        if (datos.about_video_url) {
            const urlFormateada = obtenerEmbedYouTube(datos.about_video_url);
            if (iframeVideo) {
                iframeVideo.src = urlFormateada;
                iframeVideo.style.display = 'block';
            }
            if (contenedorMensaje) contenedorMensaje.style.display = 'none';
        } else {
            if (iframeVideo) iframeVideo.style.display = 'none';
            if (contenedorMensaje) contenedorMensaje.style.display = 'block';
        }
    } catch (err) {
        console.error("Error al renderizar la sección About público:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('public-about-video') || document.getElementById('public-about-titulo')) {
        cargarAboutPublico();
    }
});

//================================================================
// RAITING SECTION HOME
//================================================================


async function cargarRatingPublico() {

    const contenedorRating = document.getElementById('public-rating-section');
    if (!contenedorRating) return;

    try {
        const res = await fetch('/api/home');
        if (!res.ok) throw new Error("No se pudo obtener la configuración pública del Rating.");
        const datos = await res.json();

        if (datos) {

            if(document.getElementById('public-rating-num1')) document.getElementById('public-rating-num1').innerText = datos.rating_item1_num || '';
            if(document.getElementById('public-rating-text1')) document.getElementById('public-rating-text1').innerText = datos.rating_item1_text || '';
            

            if(document.getElementById('public-rating-logo1') && datos.rating_item1_logo) {
                document.getElementById('public-rating-logo1').src = obtenerRutaImagen(datos.rating_item1_logo);
            }

            if(document.getElementById('public-rating-num2')) document.getElementById('public-rating-num2').innerText = datos.rating_item2_num || '';
            if(document.getElementById('public-rating-text2')) document.getElementById('public-rating-text2').innerText = datos.rating_item2_text || '';
            

            if(document.getElementById('public-rating-logo2') && datos.rating_item2_logo) {
                document.getElementById('public-rating-logo2').src = obtenerRutaImagen(datos.rating_item2_logo);
            }

            if(document.getElementById('public-rating-num3')) document.getElementById('public-rating-num3').innerText = datos.rating_item3_num || '';
            if(document.getElementById('public-rating-text3')) document.getElementById('public-rating-text3').innerText = datos.rating_item3_text || '';
            

            if(document.getElementById('public-rating-logo3') && datos.rating_item3_logo) {
                document.getElementById('public-rating-logo3').src = obtenerRutaImagen(datos.rating_item3_logo);
            }


            if (datos.rating_animacion) {
                contenedorRating.className = `raiting ${datos.rating_animacion}`; 
            }
        }
    } catch (err) {
        console.error("Error al renderizar la sección pública de Ratings:", err);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('public-rating-section')) {
        cargarRatingPublico();
    }
});

//================================================================
// REVIEWS SECTION HOME
//================================================================

async function cargarReviewsPublico() {

    const mediaWrapper = document.getElementById('public-reviews-media-wrapper');
    const contentWrapper = document.getElementById('public-reviews-content-wrapper');
    if (!mediaWrapper || !contentWrapper) return;

    try {
        const response = await fetch('/api/home/reviews');
        if (!response.ok) throw new Error("No se pudieron obtener las reseñas.");
        const data = await response.json();

        const txtTitulo = document.getElementById('public-reviews-titulo');
        if (txtTitulo) txtTitulo.textContent = data?.reviews_titulo || 'What our guests say';

        if (!data || !data.comentarios || !Array.isArray(data.comentarios) || data.comentarios.length === 0) {
            console.warn("No hay reseñas configuradas en la base de datos.");
            return;
        }

        let htmlMedia = '';
        let htmlContent = '';

        data.comentarios.forEach(review => {
            let estrellasHtml = '';
            const totalStars = parseInt(review.stars) || 0;
            for (let i = 0; i < totalStars; i++) {
                estrellasHtml += `<i class="icon-star icon"></i>`;
            }

            htmlMedia += `
                <div class="swiper-slide">
                    <picture>
                        <source data-srcset="${obtenerRutaImagen(review.bg_image)}" srcset="${obtenerRutaImagen(review.bg_image)}" />
                        <img class="lazy" data-src="${obtenerRutaImagen(review.bg_image)}" src="${obtenerRutaImagen(review.bg_image)}" alt="media" />
                    </picture>
                </div>
            `;

            htmlContent += `
                <div class="reviews_slider-slide d-flex flex-column justify-content-between swiper-slide">
                    <div class="reviews_slider-slide_stars d-flex align-items-center">
                        ${estrellasHtml}
                    </div>
                    <span class="reviews_slider-slide_date">
                        <span class="h4">Date of stay:</span>
                        ${review.date_text || ''}
                    </span>
                    <div class="reviews_slider-slide_main">
                        <h4 class="title">${review.title || ''}</h4>
                        <p class="text">${review.text || ''}</p>
                    </div>
                    <span class="reviews_slider-slide_guest d-flex align-items-center">
                        <span class="avatar">
                            <picture>
                                <source data-srcset="${obtenerRutaImagen(review.avatar)}" srcset="${obtenerRutaImagen(review.avatar)}" />
                                <img class="lazy" data-src="${obtenerRutaImagen(review.avatar)}" src="${obtenerRutaImagen(review.avatar)}" alt="guest avatar" />
                            </picture>
                        </span>
                        <span class="name h6">${review.name || ''}</span>
                    </span>
                </div>
            `;
        });

        mediaWrapper.innerHTML = htmlMedia;
        contentWrapper.innerHTML = htmlContent;
        
        const mediaSliderEl = document.querySelector('.reviews_slider--media');
        const mainSliderEl = document.querySelector('.reviews_slider--main');
        
        if (mediaSliderEl?.swiper) mediaSliderEl.swiper.destroy(true, true);
        if (mainSliderEl?.swiper) mainSliderEl.swiper.destroy(true, true);

        if (typeof Swiper !== 'undefined') {
            const activarLoop = data.comentarios.length > 1;

            // 1. Inicializar slider de imágenes de fondo
            const mediaSwiper = new Swiper('.reviews_slider--media', {
                speed: 600,
                effect: 'fade',
                allowTouchMove: false,
                loop: activarLoop
            });

            // 2. Inicializar slider de contenido
            const mainSwiper = new Swiper('.reviews_slider--main', {
                speed: 600,
                loop: activarLoop,
                autoplay: {
                    delay: 5000,
                    disableOnInteraction: false,
                }
            });

            // 3. ESTRATEGIA DE SINCRONIZACIÓN MÁS SEGURA:
            // Escuchamos el cambio de diapositiva y forzamos al de atrás a ir al índice real exacto.
            // Esto elimina fallos con el "loop: true".
            mainSwiper.on('slideChange', () => {
                if (!mediaSwiper.destroyed) {
                    mediaSwiper.slideToLoop(mainSwiper.realIndex);
                }
            });

            // 4. CONTROL MANUAL DE TUS NUEVOS BOTONES PERSONALIZADOS
            const btnPrev = document.querySelector('.review-btn-prev');
            const btnNext = document.querySelector('.review-btn-next');

            if (btnPrev && btnNext) {
                btnPrev.onclick = function () {
                    if (mainSwiper && !mainSwiper.destroyed) {
                        mainSwiper.slidePrev();
                    }
                };

                btnNext.onclick = function () {
                    if (mainSwiper && !mainSwiper.destroyed) {
                        mainSwiper.slideNext();
                    }
                };
            }
        }

    } catch (error) {
        console.error("Error al renderizar la sección de reseñas públicas:", error);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('public-reviews-titulo')) {
        cargarReviewsPublico();
    }
});

//================================================================
// PROMO SECTION HOME
//================================================================

async function cargarPromoPublico() {

    if (!document.getElementById('public-promo-titulo') && !document.getElementById('public-promo-img')) return;

    try {
        const response = await fetch('/api/home/promo');
        if (!response.ok) throw new Error("No se pudo obtener la sección promocional.");
        const datos = await response.json();

        if (datos) {

            const txtTitulo = document.getElementById('public-promo-titulo');
            if (txtTitulo) txtTitulo.textContent = datos.promo_titulo || '';

            const txtDescripcion = document.getElementById('public-promo-descripcion');
            if (txtDescripcion) txtDescripcion.textContent = datos.promo_descripcion || '';

            const txtItem1Title = document.getElementById('public-promo-item1-title');
            if (txtItem1Title) txtItem1Title.textContent = datos.promo_item1_title || '';

            const txtItem1Text = document.getElementById('public-promo-item1-text');
            if (txtItem1Text) txtItem1Text.textContent = datos.promo_item1_text || '';

            const txtItem2Title = document.getElementById('public-promo-item2-title');
            if (txtItem2Title) txtItem2Title.textContent = datos.promo_item2_title || '';

            const txtItem2Text = document.getElementById('public-promo-item2-text');
            if (txtItem2Text) txtItem2Text.textContent = datos.promo_item2_text || '';

            const txtReviewText = document.getElementById('public-promo-review-text');
            if (txtReviewText) txtReviewText.textContent = datos.promo_review_text || '';

            const txtReviewName = document.getElementById('public-promo-review-name');
            if (txtReviewName) txtReviewName.textContent = datos.promo_review_name || '';


            const imgPromo = document.getElementById('public-promo-img');
            const srcPromo = document.getElementById('public-promo-src-srcset');

            if (datos.promo_imagen) {
                const rutaLimpia = obtenerRutaImagen(datos.promo_imagen);
                
                if (srcPromo) {
                    srcPromo.srcset = rutaLimpia;
                    srcPromo.setAttribute('data-srcset', rutaLimpia);
                }

                if (imgPromo) {
                    imgPromo.src = rutaLimpia;
                    imgPromo.setAttribute('data-src', rutaLimpia);
                    
                    imgPromo.classList.remove('lazy'); 
                }
            } else {
                if (imgPromo) imgPromo.src = '/uploads/placeholder.jpg';
            }
        }
    } catch (err) {
        console.error("Error al renderizar la sección Promo pública:", err);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('public-promo-titulo')) {
        cargarPromoPublico();
    }
});

//================================================================
// CONTACTS SECTION HOME
//================================================================
async function cargarContactsPublico() {
    // FILTRO DE GUARDA: Evitar llamados en páginas sin el formulario/bloque de contacto
    if (!document.getElementById('public-contacts-titulo') && !document.getElementById('public-contacts-img')) return;

    try {
        const res = await fetch('/api/home/contacts'); 
        if (!res.ok) throw new Error("No se pudo obtener la sección de contactos de la base de datos.");
        
        const datos = await res.json();
        if (!datos) return;

        // Títulos Principales
        if (document.getElementById('public-contacts-titulo')) document.getElementById('public-contacts-titulo').textContent = datos.contacts_titulo || '';
        if (document.getElementById('public-contacts-descripcion')) document.getElementById('public-contacts-descripcion').textContent = datos.contacts_descripcion || '';

        // Teléfonos y atributos href correspondientes
        if (document.getElementById('public-contacts-tel-titulo')) document.getElementById('public-contacts-tel-titulo').textContent = datos.contacts_tel_titulo || '';
        const tel1 = document.getElementById('public-contacts-tel1');
        if (tel1 && datos.contacts_tel1) { tel1.textContent = datos.contacts_tel1; tel1.href = `tel:${datos.contacts_tel1}`; }
        const tel2 = document.getElementById('public-contacts-tel2');
        if (tel2 && datos.contacts_tel2) { tel2.textContent = datos.contacts_tel2; tel2.href = `tel:${datos.contacts_tel2}`; }

        // Emails y links directos mailto
        if (document.getElementById('public-contacts-email-titulo')) document.getElementById('public-contacts-email-titulo').textContent = datos.contacts_email_titulo || '';
        const em1 = document.getElementById('public-contacts-email1');
        if (em1 && datos.contacts_email1) { em1.textContent = datos.contacts_email1; em1.href = `mailto:${datos.contacts_email1}`; }
        const em2 = document.getElementById('public-contacts-email2');
        if (em2 && datos.contacts_email2) { em2.textContent = datos.contacts_email2; em2.href = `mailto:${datos.contacts_email2}`; }

        // Ubicaciones
        if (document.getElementById('public-contacts-loc-titulo')) document.getElementById('public-contacts-loc-titulo').textContent = datos.contacts_loc_titulo || '';
        if (document.getElementById('public-contacts-loc1')) document.getElementById('public-contacts-loc1').textContent = datos.contacts_loc1 || '';
        if (document.getElementById('public-contacts-loc2')) document.getElementById('public-contacts-loc2').textContent = datos.contacts_loc2 || '';

        // Horarios laborales
        if (document.getElementById('public-contacts-work-titulo')) document.getElementById('public-contacts-work-titulo').textContent = datos.contacts_work_titulo || '';
        if (document.getElementById('public-contacts-work1')) document.getElementById('public-contacts-work1').textContent = datos.contacts_work1 || '';
        if (document.getElementById('public-contacts-work2')) document.getElementById('public-contacts-work2').textContent = datos.contacts_work2 || '';

        // Renderizado de Imagen de Cloudinary
        const imgContacts = document.getElementById('public-contacts-img');
        if (imgContacts && datos.contacts_imagen) {
            imgContacts.src = datos.contacts_imagen;
        }
    } catch (err) {
        console.error("Error al renderizar la sección de Contactos:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // CORREGIDO: Filtro más seguro. Si el contenedor o el título principal de contactos existe, se ejecuta.
    if (document.getElementById('public-contacts-titulo') || document.getElementById('public-contacts-img')) {
        cargarContactsPublico();
    }
});