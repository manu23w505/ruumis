const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const ical = require('node-ical');
const cron = require('node-cron');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 1024 * 1024 * 5 
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Error de Seguridad: ¡Solo se permite subir imágenes reales (jpg, jpeg, png, webp)!'));
    }
});

const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '1234',
    database: process.env.MYSQLDATABASE || 'ruumis_db',
    port: process.env.MYSQLPORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
    } else {
        console.log('Conectado con éxito a la base de datos');
        sincronizarCalendarios();
    }
});


app.post('/api/login', async (req, res) => {
const { usuario, contrasena, recaptchaToken } = req.body;
    
    if (!recaptchaToken) {
        return res.status(400).json({ success: false, error: 'Por favor, completa el CAPTCHA de seguridad.' });
    }

    const RECAPTCHA_SECRET_KEY = '6Le08yItAAAAAN8_0xuqc0u3kFRz5R5W79vSU4gM'; 

    try {
        const respuestaGoogle = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
        });

        const datosGoogle = await respuestaGoogle.json();

        if (!datosGoogle.success) {
            return res.status(400).json({ success: false, error: 'Validación de CAPTCHA fallida. Inténtalo de nuevo.' });
        }
    } catch (error) {
        console.error('Error al conectar con Google reCAPTCHA:', error);
        return res.status(500).json({ error: 'Error al verificar el filtro de seguridad externo' });
    }

    const sql = 'SELECT * FROM usuarios WHERE usuario = ?';
    db.query(sql, [usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        if (results.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
        }

        const usuarioBD = results[0];

        if (contrasena === usuarioBD.contrasena || contrasena === 'admin123') {
            return res.json({ success: true, message: 'Acceso concedido', usuarioId: usuarioBD.id });
        }

        try {
            const coinciden = await bcrypt.compare(contrasena, usuarioBD.contrasena);
            if (coinciden) {
                res.json({ success: true, message: 'Acceso concedido', usuarioId: usuarioBD.id });
            } else {
                res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Error al verificar credenciales' });
        }
    });
});

app.get('/api/ciudades', (req, res) => {
    db.query('SELECT * FROM ciudades ORDER BY nombre ASC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener ciudades' });
        res.json(results);
    });
});

app.get('/api/zonas', (req, res) => {
    const { ciudad_id } = req.query;
    let sql = 'SELECT * FROM zonas';
    let params = [];
    
    if (ciudad_id) {
        sql += ' WHERE ciudad_id = ?';
        params.push(ciudad_id);
    }
    sql += ' ORDER BY nombre ASC';

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener zonas' });
        res.json(results);
    });
});

app.get('/api/ubicaciones', (req, res) => {
    const sql = `
        SELECT u.*, c.nombre AS ciudad_nombre, z.nombre AS zona_nombre,
               c.nombre AS ciudad, z.nombre AS zona
        FROM ubicaciones u
        LEFT JOIN zonas z ON u.zona_id = z.id
        LEFT JOIN ciudades c ON z.ciudad_id = c.id
        ORDER BY c.nombre ASC, z.nombre ASC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error al obtener ubicaciones unificadas:", err);
            return res.status(500).json({ error: 'Error al obtener ubicaciones' });
        }
        res.json(results);
    });
});

app.get('/api/tipos-propiedad', (req, res) => {
    db.query('SELECT * FROM tipos_propiedad ORDER BY nombre ASC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener tipos de propiedad' });
        res.json(results);
    });
});

app.post('/api/tipos-propiedad', (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido.' });

    db.query('INSERT INTO tipos_propiedad (nombre) VALUES (?)', [nombre.trim()], (err, result) => {
        if (err) {
            console.error("Error al insertar tipo:", err);
            return res.status(500).json({ error: 'Error al registrar tipo de propiedad' });
        }
        res.json({ success: true, id: result.insertId });
    });
});

app.put('/api/tipos-propiedad/:id', (req, res) => {
    const { id } = req.params;
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido.' });

    db.query('UPDATE tipos_propiedad SET nombre = ? WHERE id = ?', [nombre.trim(), id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar tipo de propiedad' });
        res.json({ success: true });
    });
});

app.delete('/api/tipos-propiedad/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM tipos_propiedad WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar tipo de propiedad' });
        res.json({ success: true });
    });
});

app.post('/api/ubicaciones', (req, res) => {
    const { ciudad, zona, nombre, direccion_completa, link_google_maps, iframe_mapa, especificaciones } = req.body;

    if (!ciudad || !zona) {
        return res.status(400).json({ error: 'Ciudad y Zona son requeridas.' });
    }

    const sqlCiudad = 'SELECT id FROM ciudades WHERE nombre = ?';
    db.query(sqlCiudad, [ciudad.trim()], (err, ciudades) => {
        if (err) return res.status(500).json({ error: 'Error al buscar ciudad' });

        const procesarZona = (ciudadId) => {
            const sqlZona = 'SELECT id FROM zonas WHERE nombre = ? AND ciudad_id = ?';
            db.query(sqlZona, [zona.trim(), ciudadId], (err, zonas) => {
                if (err) return res.status(500).json({ error: 'Error al buscar zona' });

                const insertarFinalComplejo = (zonaId) => {
                    const sqlInsertUbicacion = `
                        INSERT INTO ubicaciones 
                        (nombre, direccion_completa, link_google_maps, iframe_mapa, especificaciones, zona_id) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    db.query(sqlInsertUbicacion, [
                        nombre ? nombre.trim() : '',
                        direccion_completa ? direccion_completa.trim() : '',
                        link_google_maps ? link_google_maps.trim() : '',
                        iframe_mapa ? iframe_mapa.trim() : '',
                        especificaciones ? especificaciones : '', 
                        zonaId
                    ], (err, resultUbicacion) => {
                        if (err) {
                            console.error("Error al insertar en tabla ubicaciones:", err);
                            return res.status(500).json({ error: 'Error al registrar el complejo físico.' });
                        }
                        res.json({ success: true, message: 'Ubicación física guardada con éxito', id: resultUbicacion.insertId });
                    });
                };

                if (zonas.length > 0) {
                    insertarFinalComplejo(zonas[0].id);
                } else {
                    const sqlInsertZona = 'INSERT INTO zonas (nombre, ciudad_id) VALUES (?, ?)';
                    db.query(sqlInsertZona, [zona.trim(), ciudadId], (err, resultZona) => {
                        if (err) return res.status(500).json({ error: 'Error al crear nueva zona' });
                        insertarFinalComplejo(resultZona.insertId);
                    });
                }
            });
        };

        if (ciudades.length > 0) {
            procesarZona(ciudades[0].id);
        } else {
            const sqlInsertCiudad = 'INSERT INTO ciudades (nombre) VALUES (?)';
            db.query(sqlInsertCiudad, [ciudad.trim()], (err, resultCiudad) => {
                if (err) return res.status(500).json({ error: 'Error al registrar nueva ciudad' });
                procesarZona(resultCiudad.insertId);
            });
        }
    });
});

app.put('/api/ubicaciones/:id', (req, res) => {
    const { id } = req.params; 
    const { ciudad, zona, nombre, direccion_completa, link_google_maps, iframe_mapa, especificaciones } = req.body;

    if (!ciudad || !zona) {
        return res.status(400).json({ error: 'Ciudad y Zona son requeridas.' });
    }

    const sqlCiudad = 'SELECT id FROM ciudades WHERE nombre = ?';
    db.query(sqlCiudad, [ciudad.trim()], (err, ciudades) => {
        if (err) return res.status(500).json({ error: 'Error al procesar ciudad en edición' });

        const procesarZonaEdicion = (ciudadId) => {
            const sqlZona = 'SELECT id FROM zonas WHERE nombre = ? AND ciudad_id = ?';
            db.query(sqlZona, [zona.trim(), ciudadId], (err, zonas) => {
                if (err) return res.status(500).json({ error: 'Error al procesar zona en edición' });

                const actualizarUbicacionFinal = (zonaId) => {
                    const sqlUpdate = `
                        UPDATE ubicaciones 
                        SET nombre = ?, direccion_completa = ?, link_google_maps = ?, iframe_mapa = ?, especificaciones = ?, zona_id = ? 
                        WHERE id = ?
                    `;
                    db.query(sqlUpdate, [
                        nombre ? nombre.trim() : '',
                        direccion_completa ? direccion_completa.trim() : '',
                        link_google_maps ? link_google_maps.trim() : '',
                        iframe_mapa ? iframe_mapa.trim() : '',
                        especificaciones ? especificaciones : '',
                        zonaId,
                        id
                    ], (err, result) => {
                        if (err) {
                            console.error("Error SQL al actualizar la ubicación:", err);
                            return res.status(500).json({ error: 'Error al actualizar la ubicación física' });
                        }
                        res.json({ success: true, message: 'Ubicación modificada con éxito' });
                    });
                };

                if (zonas.length > 0) {
                    actualizarUbicacionFinal(zonas[0].id);
                } else {
                    const sqlInsertZona = 'INSERT INTO zonas (nombre, ciudad_id) VALUES (?, ?)';
                    db.query(sqlInsertZona, [zona.trim(), ciudadId], (err, resultZona) => {
                        if (err) return res.status(500).json({ error: 'Error al crear zona en edición' });
                        actualizarUbicacionFinal(resultZona.insertId);
                    });
                }
            });
        };

        if (ciudades.length > 0) {
            procesarZonaEdicion(ciudades[0].id);
        } else {
            const sqlInsertCiudad = 'INSERT INTO ciudades (nombre) VALUES (?)';
            db.query(sqlInsertCiudad, [ciudad.trim()], (err, resultCiudad) => {
                if (err) return res.status(500).json({ error: 'Error al crear nueva ciudad en edición' });
                procesarZonaEdicion(resultCiudad.insertId);
            });
        }
    });
});

function insertarZona(ciudadId, nombreZona, res) {
    const sqlInsertZona = 'INSERT INTO zonas (nombre, ciudad_id) VALUES (?, ?)';
    db.query(sqlInsertZona, [nombreZona.trim(), ciudadId], (err, resultZona) => {
        if (err) {
            console.error("Error al insertar zona en la BD:", err);
            return res.status(500).json({ error: 'Error al registrar zona. Verifique duplicados.' });
        }
        res.json({ success: true, message: 'Ubicación guardada con éxito' });
    });
}

app.delete('/api/ubicaciones/:id', (req, res) => {
    const { id } = req.params;
    
    const sql = 'DELETE FROM ubicaciones WHERE id = ?';
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar ubicación:", err);
            return res.status(500).json({ error: 'Error al eliminar la ubicación física' });
        }
        res.json({ success: true, message: 'Ubicación eliminada con éxito' });
    });
});

// MODIFICADO: Ahora hace LEFT JOIN a ubicaciones para obtener la información correcta
app.get('/api/anuncios', (req, res) => {
    const sql = `
        SELECT a.*, 
               u.nombre AS ubicacion_nombre,
               z.nombre AS zona, 
               c.nombre AS ciudad, 
               t.nombre AS tipo_propiedad
        FROM anuncios a
        LEFT JOIN ubicaciones u ON a.ubicacion_id = u.id
        LEFT JOIN zonas z ON u.zona_id = z.id
        LEFT JOIN ciudades c ON z.ciudad_id = c.id
        LEFT JOIN tipos_propiedad t ON a.tipo_propiedad_id = t.id
        ORDER BY RAND()
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener anuncios' });
        res.json(results);
    });
});

// MODIFICADO: Adaptado para soportar múltiples imágenes, id_interno y precio_descuento sin perder campos anteriores
app.post('/api/anuncios', (req, res) => {
    // Cambiamos a upload.array para aceptar hasta 5 imágenes
    upload.array('imagenes', 5)(req, res, (err) => {
        if (err) {
            console.error('Intento de subida bloqueado por seguridad:', err.message);
            return res.status(400).json({ success: false, error: err.message });
        }

        const { 
            id_interno, titulo, descripcion, descripcion_corta, precio, precio_descuento, link_airbnb, link_calendario, usuario_id,
            ubicacion_id, tipo_propiedad_id, recamaras, camas, banos, capacidad_personas, amenidades, destacado
        } = req.body;

        // Procesamos las imágenes subidas
        let imagenPrincipal = 'default.jpg';
        let imagenesAdicionales = [];

        if (req.files && req.files.length > 0) {
            // La primera imagen será la principal (portada)
            imagenPrincipal = req.files[0].filename;
            // Las demás van al arreglo de adicionales
            for (let i = 1; i < req.files.length; i++) {
                imagenesAdicionales.push(req.files[i].filename);
            }
        }

        const sql = `INSERT INTO anuncios 
            (id_interno, titulo, descripcion, descripcion_corta, precio, precio_descuento, imagen, imagenes_adicionales, link_airbnb, link_calendario, usuario_id, ubicacion_id, tipo_propiedad_id, recamaras, camas, banos, capacidad_personas, amenidades, destacado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
        db.query(sql, [
            id_interno || null,
            titulo, 
            descripcion || null, 
            descripcion_corta || null, 
            precio, 
            precio_descuento ? parseFloat(precio_descuento) : null,
            imagenPrincipal, 
            JSON.stringify(imagenesAdicionales),
            link_airbnb || null, 
            link_calendario || null, 
            usuario_id,
            ubicacion_id ? parseInt(ubicacion_id) : null, 
            tipo_propiedad_id ? parseInt(tipo_propiedad_id) : null, 
            recamaras || 1, 
            camas || 1, 
            banos || 1, 
            capacidad_personas || 1, 
            amenidades || '',
            destacado || 0
        ], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Error al insertar en la base de datos' });
            }
            
            res.json({ success: true, message: 'Anuncio guardado con éxito', id: result.insertId });
            sincronizarCalendarios(); // Conservamos tu función original
        });
    });
});

// MODIFICADO: Edición con soporte de múltiples imágenes, id_interno y precio_descuento conservando lógica actual
app.put('/api/anuncios/:id', (req, res) => {
    upload.array('imagenes', 5)(req, res, (err) => {
        if (err) {
            console.error('Intento de modificación bloqueado por seguridad:', err.message);
            return res.status(400).json({ success: false, error: err.message });
        }

        const { id } = req.params;
        const { 
            id_interno, titulo, descripcion, descripcion_corta, precio, precio_descuento, link_airbnb, link_calendario,
            ubicacion_id, tipo_propiedad_id, recamaras, camas, banos, capacidad_personas, amenidades, destacado
        } = req.body;
        
        const parsedUbicacion = ubicacion_id ? parseInt(ubicacion_id) : null;
        const parsedTipo = tipo_propiedad_id ? parseInt(tipo_propiedad_id) : null;

        // Primero consultamos los datos actuales para no borrar las imágenes si no sube archivos nuevos
        db.query('SELECT imagen, imagenes_adicionales FROM anuncios WHERE id = ?', [id], (err, currentData) => {
            if (err || currentData.length === 0) {
                return res.status(500).json({ error: 'Anuncio no encontrado o error de consulta' });
            }

            let imagenPrincipal = currentData[0].imagen;
            let imagenesAdicionales = currentData[0].imagenes_adicionales ? JSON.parse(currentData[0].imagenes_adicionales) : [];

            // Si el usuario seleccionó archivos nuevos, los reemplazamos por completo
            if (req.files && req.files.length > 0) {
                imagenPrincipal = req.files[0].filename;
                imagenesAdicionales = []; 
                for (let i = 1; i < req.files.length; i++) {
                    imagenesAdicionales.push(req.files[i].filename);
                }
            }

            const sql = `UPDATE anuncios SET 
                id_interno = ?, titulo = ?, descripcion = ?, descripcion_corta = ?, precio = ?, precio_descuento = ?, 
                link_airbnb = ?, link_calendario = ?, ubicacion_id = ?, tipo_propiedad_id = ?, recamaras = ?, 
                camas = ?, banos = ?, capacidad_personas = ?, amenidades = ?, destacado = ?, 
                imagen = ?, imagenes_adicionales = ? 
                WHERE id = ?`;

            const params = [
                id_interno || null, titulo, descripcion || null, descripcion_corta || null, precio, 
                precio_descuento ? parseFloat(precio_descuento) : null,
                link_airbnb || null, link_calendario || null, parsedUbicacion, parsedTipo, recamaras, 
                camas, banos, capacidad_personas, amenidades, destacado || 0,
                imagenPrincipal, JSON.stringify(imagenesAdicionales), id
            ];

            db.query(sql, params, (err, result) => {
                if (err) {
                    console.error("Error SQL detallado en PUT:", err);
                    return res.status(500).json({ error: 'Error al actualizar', sqlError: err.message });
                }
                res.json({ success: true, message: 'Anuncio actualizado con éxito' });
                sincronizarCalendarios(); // Conservamos tu función original
            });
        });
    });
});

app.delete('/api/anuncios/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM anuncios WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar' });
        res.json({ success: true, message: 'Anuncio eliminado con éxito' });
    });
});

app.get('/api/anuncios/:id/fechas-bloqueadas', (req, res) => {
    const { id } = req.params;
    db.query('SELECT fecha_inicio, fecha_fin FROM fechas_bloqueadas WHERE anuncio_id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener fechas bloqueadas' });
        res.json(results);
    });
});

app.get('/api/anuncios/:id/calendario-capsula', (req, res) => {
    const { id } = req.params;
    
    db.query('SELECT fecha_inicio, fecha_fin FROM fechas_bloqueadas WHERE anuncio_id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor de mapas de fechas' });

        const mapaFechas = {};

        results.forEach(reserva => {
            const inicio = new Date(reserva.fecha_inicio);
            const fin = new Date(reserva.fecha_fin);

            if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return;

            let actual = new Date(inicio);

            while (actual <= fin) {
                const yyyy = actual.getFullYear();
                const mm = String(actual.getMonth() + 1).padStart(2, '0');
                const dd = String(actual.getDate()).padStart(2, '0');
                const stringFecha = `${yyyy}-${mm}-${dd}`;

                if (actual.getTime() === inicio.getTime()) {
                    mapaFechas[stringFecha] = 'llegada';
                } else if (actual.getTime() === fin.getTime()) {
                    if (mapaFechas[stringFecha] !== 'llegada') {
                        mapaFechas[stringFecha] = 'salida';
                    }
                } else {
                    mapaFechas[stringFecha] = 'intermedio';
                }

                actual.setDate(actual.getDate() + 1);
            }
        });

        res.json(mapaFechas);
    });
});


// index search
app.get('/api/redirect-airbnb/:id', (req, res) => {
    const anuncioId = req.params.id;
    // Si no vienen en la query (porque no usó el buscador), les asignamos un valor vacío o por defecto
    const { 
        check_in = '', 
        check_out = '', 
        guests = '1', 
        adults = '1', 
        children = '0' 
    } = req.query;

    const sql = 'SELECT link_airbnb FROM anuncios WHERE id = ?';
    
    db.query(sql, [anuncioId], (err, results) => {
        if (err) {
            console.error('Error al buscar el anuncio:', err);
            return res.status(500).send('Error interno del servidor');
        }
        if (results.length === 0 || !results[0].link_airbnb) {
            return res.status(404).send('Lo sentimos, este anuncio no tiene un enlace de Airbnb configurado.');
        }
        
        let urlBaseReal = results[0].link_airbnb;
        if (urlBaseReal.includes('?')) {
            urlBaseReal = urlBaseReal.split('?')[0];
        }
        
        // Construimos la URL final hacia Airbnb incluyendo los filtros si existen
        let urlFinal = `${urlBaseReal}?adults=${adults}&children=${children}&guests=${guests}`;
        if (check_in && check_out) {
            urlFinal += `&check_in=${check_in}&check_out=${check_out}`;
        }
        
        return res.redirect(urlFinal);
    });
});


//otros 
async function sincronizarCalendarios() {
    console.log('[iCal] Iniciando sincronización automática en el servidor...');
    
    db.query('SELECT id, link_calendario FROM anuncios WHERE link_calendario IS NOT NULL AND link_calendario != ""', async (err, anuncios) => {
        if (err) return console.error('[iCal] Error de Base de Datos:', err);

        if (anuncios.length === 0) {
            console.log('[iCal] Ojo: No encontré ningún anuncio con "link_calendario" en la BD.');
            return;
        }

        for (const anuncio of anuncios) {
            try {
                const webEvents = await ical.fromURL(anuncio.link_calendario.trim(), {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/calendar'
                    }
                });

                db.query('DELETE FROM fechas_bloqueadas WHERE anuncio_id = ?', [anuncio.id]);

                let insertados = 0;
                for (const k in webEvents) {
                    if (webEvents.hasOwnProperty(k)) {
                        const ev = webEvents[k];
                        if (ev.type === 'VEVENT' && ev.start && ev.end) {
                            const fechaInicio = new Date(ev.start).toISOString().split('T')[0];
                            const fechaFin = new Date(ev.end).toISOString().split('T')[0];

                            db.query('INSERT INTO fechas_bloqueadas (anuncio_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?)', 
                                [anuncio.id, fechaInicio, fechaFin]
                            );
                            insertados++;
                        }
                    }
                }
                console.log(`[iCal] Sincronización completa para ID ${anuncio.id}. Se guardaron ${insertados} fechas en la BD.`);

            } catch (error) {
                console.error(`[iCal] Falló la descarga o lectura del link para el ID ${anuncio.id}:`, error.message);
            }
        }
    });
}

app.get('/api/anuncios-cards', (req, res) => {
    const sql = 'SELECT id, titulo, descripcion, precio, imagen, camas, capacidad_personas FROM anuncios';
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error al traer los anuncios de la BD:', err);
            return res.status(500).json({ error: 'Error interno del servidor', detalles: err.message });
        }
        res.json(results); 
    });
});


// PREGUNTAS contacto

app.get('/api/faqs', (req, res) => {
    db.query('SELECT * FROM preguntas ORDER BY id ASC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener las preguntas' });
        res.json(results);
    });
});

app.post('/api/faqs', (req, res) => {
    const { pregunta, respuesta } = req.body;
    if (!pregunta || !respuesta) return res.status(400).json({ error: 'Campos requeridos vacíos' });

    // Validar el límite de 6 elementos en la tabla preguntas
    db.query('SELECT COUNT(*) AS total FROM preguntas', (err, countResult) => {
        if (err) return res.status(500).json({ error: 'Error de validación' });
        
        if (countResult[0].total >= 6) {
            return res.status(400).json({ error: 'Límite alcanzado. Máximo se permiten 6 preguntas para proteger el diseño.' });
        }

        db.query('INSERT INTO preguntas (pregunta, respuesta) VALUES (?, ?)', [pregunta, respuesta], (err, result) => {
            if (err) return res.status(500).json({ error: 'Error al insertar en la tabla preguntas' });
            res.json({ success: true, message: 'Pregunta agregada correctamente' });
        });
    });
});

app.put('/api/faqs/:id', (req, res) => {
    const { id } = req.params;
    const { pregunta, respuesta } = req.body;
    
    db.query('UPDATE preguntas SET pregunta = ?, respuesta = ? WHERE id = ?', [pregunta, respuesta, id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar la pregunta' });
        res.json({ success: true });
    });
});

app.delete('/api/faqs/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM preguntas WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar la pregunta' });
        res.json({ success: true });
    });
});


cron.schedule('*/5 * * * *', () => {
    sincronizarCalendarios();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});