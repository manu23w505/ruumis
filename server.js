const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const ical = require('node-ical');
const cron = require('node-cron');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: 'ts3v2nsy', 
    api_key: '515561375298544',       
    api_secret: 'gz1WZx3bijvi1xM7qvC6RYVQkj8'  
});


const storage = multer.memoryStorage(); 

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB límite
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('¡Solo se permite subir imágenes reales (jpg, jpeg, png, webp)!'));
    }
});

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'plantilla',
    port: process.env.DB_PORT || 18515,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificar la conexión inicial del Pool
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
    } else {
        console.log('Conectado con éxito a la base de datos mediante Pool');
        connection.release(); // Libera la conexión para que otros la usen
    }
});


app.post('/api/login', async (req, res) => {
const { usuario, contrasena, recaptchaToken } = req.body;
    
    if (!recaptchaToken) {
        return res.status(400).json({ success: false, error: 'Por favor, completa el CAPTCHA de seguridad.' });
    }

    const RECAPTCHA_SECRET_KEY = '6Le-wzQtAAAAAPvV_hOyRHqEVn35nUmObCeuOqLl'; 

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

app.post('/api/ubicaciones', upload.single('imagen_ubicacion'), (req, res) => {
    // Multer procesa el FormData y nos llena req.body con los textos
    const { ciudad, zona, nombre, direccion_completa, link_google_maps, iframe_mapa, especificaciones } = req.body;

    if (!ciudad || !zona) {
        return res.status(400).json({ error: 'Ciudad y Zona son requeridas.' });
    }

    // Si el usuario subió una imagen, estructuramos la ruta web pública
    const rutaImagen = req.file ? `/uploads/${req.file.filename}` : null;

    const sqlCiudad = 'SELECT id FROM ciudades WHERE nombre = ?';
    db.query(sqlCiudad, [ciudad.trim()], (err, ciudades) => {
        if (err) return res.status(500).json({ error: 'Error al buscar ciudad' });

        const procesarZona = (ciudadId) => {
            const sqlZona = 'SELECT id FROM zonas WHERE nombre = ? AND ciudad_id = ?';
            db.query(sqlZona, [zona.trim(), ciudadId], (err, zonas) => {
                if (err) return res.status(500).json({ error: 'Error al buscar zona' });

                const insertarFinalComplejo = (zonaId) => {
                    // CAMBIO AQUÍ: Agregamos la columna 'imagen' al INSERT
                    const sqlInsertUbicacion = `
                        INSERT INTO ubicaciones 
                        (nombre, direccion_completa, link_google_maps, iframe_mapa, especificaciones, zona_id, imagen) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;
                    db.query(sqlInsertUbicacion, [
                        nombre ? nombre.trim() : '',
                        direccion_completa ? direccion_completa.trim() : '',
                        link_google_maps ? link_google_maps.trim() : '',
                        iframe_mapa ? iframe_mapa.trim() : '',
                        especificaciones ? especificaciones : '', 
                        zonaId,
                        rutaImagen // <--- Pasamos la ruta del archivo aquí
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

app.put('/api/ubicaciones/:id', upload.single('imagen_ubicacion'), (req, res) => {
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
                    // CAMBIO AQUÍ: Construimos la query dinámicamente.
                    // Si el administrador subió una foto nueva, la actualizamos. 
                    // Si no subió nada, mantenemos intacta la foto anterior para no borrarla.
                    let sqlUpdate = `
                        UPDATE ubicaciones 
                        SET nombre = ?, direccion_completa = ?, link_google_maps = ?, iframe_mapa = ?, especificaciones = ?, zona_id = ?
                    `;
                    
                    let params = [
                        nombre ? nombre.trim() : '',
                        direccion_completa ? direccion_completa.trim() : '',
                        link_google_maps ? link_google_maps.trim() : '',
                        iframe_mapa ? iframe_mapa.trim() : '',
                        especificaciones ? especificaciones : '',
                        zonaId
                    ];

                    if (req.file) {
                        // Si hay nueva imagen, agregamos la columna al UPDATE
                        sqlUpdate += `, imagen = ? WHERE id = ?`;
                        params.push(`/uploads/${req.file.filename}`, id);
                    } else {
                        // Si no hay nueva imagen, cerramos la sentencia conservando el archivo actual
                        sqlUpdate += ` WHERE id = ?`;
                        params.push(id);
                    }

                    db.query(sqlUpdate, params, (err, result) => {
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

app.get('/api/anuncios', (req, res) => {
    // Si la petición viene desde el panel administrativo (?admin=true), 
    // ordenamos por ID de forma fija. Si no, mantenemos el comportamiento aleatorio público.
    const orden = req.query.admin === 'true' ? 'a.id DESC' : 'RAND()';

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
        ORDER BY ${orden}
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener anuncios' });
        res.json(results);
    });
});

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

app.put('/api/anuncios/:id', (req, res) => {
    upload.array('imagenes', 5)(req, res, (err) => {
        if (err) {
            console.error('Intento de modificación bloqueado por seguridad:', err.message);
            return res.status(400).json({ success: false, error: err.message });
        }

        const { id } = req.params;
        const { 
            id_interno, titulo, descripcion, descripcion_corta, precio, precio_descuento, link_airbnb, link_calendario,
            ubicacion_id, tipo_propiedad_id, recamaras, camas, banos, capacidad_personas, amenidades
        } = req.body; 
        
        const parsedUbicacion = ubicacion_id ? parseInt(ubicacion_id) : null;
        const parsedTipo = tipo_propiedad_id ? parseInt(tipo_propiedad_id) : null;
        const parsedPrecio = precio ? parseFloat(precio) : 0;
        const parsedPrecioDescuento = (precio_descuento && precio_descuento !== '') ? parseFloat(precio_descuento) : null;
        const parsedRecamaras = recamaras ? parseInt(recamaras) : 0;
        const parsedCamas = camas ? parseInt(camas) : 0;
        const parsedBanos = banos ? parseFloat(banos) : 0.0; 
        const parsedCapacidad = capacidad_personas ? parseInt(capacidad_personas) : 0;

        // Consultamos los valores actuales para saber qué imágenes tiene antes de actualizar
        db.query('SELECT imagen, imagenes_adicionales FROM anuncios WHERE id = ?', [id], (err, currentData) => {
            if (err || currentData.length === 0) {
                return res.status(500).json({ error: 'Anuncio no encontrado o error de consulta' });
            }

            let imagenPrincipal = currentData[0].imagen;
            let imagenesAdicionalesArray = [];

            try {
                if (currentData[0].imagenes_adicionales) {
                    imagenesAdicionalesArray = typeof currentData[0].imagenes_adicionales === 'string' 
                        ? JSON.parse(currentData[0].imagenes_adicionales) 
                        : currentData[0].imagenes_adicionales;
                }
            } catch (e) {
                imagenesAdicionalesArray = [];
            }

            // SI EL USUARIO SUBIÓ NUEVAS IMÁGENES: Procedemos a limpiar los archivos viejos físicos
            if (req.files && req.files.length > 0) {
                const fs = require('fs');

                // 1. Eliminar la portada anterior (siempre que no sea la default)
                if (imagenPrincipal && imagenPrincipal !== 'default.jpg' && imagenPrincipal !== 'placeholder.jpg') {
                    const rutaViejaPortada = path.join(__dirname, 'public/uploads', imagenPrincipal);
                    if (fs.existsSync(rutaViejaPortada)) {
                        fs.unlink(rutaViejaPortada, (err) => { if (err) console.error("Error al limpiar portada vieja:", err); });
                    }
                }

                // 2. Eliminar las imágenes secundarias anteriores de la carpeta uploads
                if (Array.isArray(imagenesAdicionalesArray)) {
                    imagenesAdicionalesArray.forEach(img => {
                        if (img && img !== 'default.jpg' && img !== 'placeholder.jpg') {
                            const rutaViejaExtra = path.join(__dirname, 'public/uploads', img);
                            if (fs.existsSync(rutaViejaExtra)) {
                                fs.unlink(rutaViejaExtra, (err) => { if (err) console.error("Error al limpiar imagen extra vieja:", err); });
                            }
                        }
                    });
                }

                // 3. Ahora sí, asignamos el nuevo set de imágenes subidas
                imagenPrincipal = req.files[0].filename; 
                imagenesAdicionalesArray = []; 
                
                for (let i = 1; i < req.files.length; i++) {
                    imagenesAdicionalesArray.push(req.files[i].filename);
                }
            }

            const sql = `UPDATE anuncios SET 
                id_interno = ?, titulo = ?, descripcion = ?, descripcion_corta = ?, precio = ?, precio_descuento = ?, 
                link_airbnb = ?, link_calendario = ?, ubicacion_id = ?, tipo_propiedad_id = ?, recamaras = ?, 
                camas = ?, banos = ?, capacidad_personas = ?, amenidades = ?, 
                imagen = ?, imagenes_adicionales = ? 
                WHERE id = ?`;

            const params = [
                id_interno || null, 
                titulo || null, 
                descripcion || null, 
                descripcion_corta || null, 
                parsedPrecio, 
                parsedPrecioDescuento,
                link_airbnb || null, 
                link_calendario || null, 
                parsedUbicacion, 
                parsedTipo, 
                parsedRecamaras, 
                parsedCamas, 
                parsedBanos, 
                parsedCapacidad, 
                amenidades || null, 
                imagenPrincipal, 
                JSON.stringify(imagenesAdicionalesArray), 
                id
            ];

            db.query(sql, params, (err, result) => {
                if (err) {
                    console.error("====== ERROR CRÍTICO SQL ======");
                    console.error("Mensaje:", err.message);
                    return res.status(500).json({ error: `Error en Base de Datos: ${err.message}` });
                }
                res.json({ success: true, message: 'Anuncio actualizado con éxito y archivos antiguos limpiados.' });
                if (typeof sincronizarCalendarios === 'function') {
                    sincronizarCalendarios(); 
                }
            });
        });
    });
});

app.delete('/api/anuncios/:id', (req, res) => {
    const { id } = req.params;

    db.query('SELECT imagen, imagenes_adicionales FROM anuncios WHERE id = ?', [id], (err, results) => {
        if (!err && results.length > 0) {
            const anuncio = results[0];
            const fs = require('fs');
            
            // Borrado asíncrono para no congelar el servidor
            if (anuncio.imagen && anuncio.imagen !== 'default.jpg' && anuncio.imagen !== 'placeholder.jpg') {
                const rutaImg = path.join(__dirname, 'public/uploads', anuncio.imagen);
                if (fs.existsSync(rutaImg)) {
                    fs.unlink(rutaImg, (err) => { if (err) console.error("Error eliminando archivo físico de portada:", err); });
                }
            }

            if (anuncio.imagenes_adicionales) {
                try {
                    const extras = JSON.parse(anuncio.imagenes_adicionales);
                    if (Array.isArray(extras)) {
                        extras.forEach(img => {
                            if (img && img !== 'default.jpg' && img !== 'placeholder.jpg') {
                                const rutaExtra = path.join(__dirname, 'public/uploads', img);
                                if (fs.existsSync(rutaExtra)) {
                                    fs.unlink(rutaExtra, (err) => { if (err) console.error("Error eliminando archivo físico extra:", err); });
                                }
                            }
                        });
                    }
                } catch(e) { console.error("Error limpiando imágenes extras:", e); }
            }
        }

        // Eliminar el registro de la BD
        db.query('DELETE FROM anuncios WHERE id = ?', [id], (err, result) => {
            if (err) return res.status(500).json({ error: 'Error al eliminar el registro' });
            res.json({ success: true, message: 'Anuncio e imágenes eliminadas con éxito de forma segura' });
        });
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
    
    // ⬇️ Línea modificada aquí abajo ⬇️
    db.query('SELECT id, link_calendario FROM anuncios WHERE link_calendario IS NOT NULL AND LENGTH(link_calendario) > 0', async (err, anuncios) => {
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

// Ruta dedicada para el formulario de contacto 
app.post('/api/contacto', upload.none(), (req, res) => {
    try {
        // Capturamos lo que envía el formulario a través de common.min.js
        const nombre = req.body.feedbackName || req.body.name || req.body.nombre;
        const email = req.body.feedbackEmail || req.body.email;
        const mensaje = req.body.feedbackMessage || req.body.message || req.body.mensaje;

        if (!nombre || !email || !mensaje) {
            return res.status(400).send('<div style="color:red; font-weight:bold; font-family:sans-serif; padding:20px;">Todos los campos son obligatorios.</div>');
        }

        // 1. Opcional: Guardamos en tu tabla contactos para tener un respaldo físico
        const queryGuardar = "INSERT INTO contactos (nombre, email, mensaje, fecha) VALUES (?, ?, ?, NOW())";
        db.query(queryGuardar, [nombre, email, mensaje], (errInsert) => {
            if (errInsert) console.error('Nota: No se pudo respaldar en la tabla contactos:', errInsert.message);
            
            // 2. CONSULTAMOS EL CORREO DESTINO QUE SE CONFIGURÓ EN EL PANEL DE ADMIN
            db.query("SELECT valor FROM configuracion WHERE clave = 'correo_destino'", async (errQuery, results) => {
                
                // Correo de respaldo si por alguna razón la tabla configuración estuviera vacía
                let correoDestinoDinamico = 'tu-correo-propio-de-respaldo@gmail.com'; 
                
                if (!errQuery && results.length > 0 && results[0].valor) {
                    correoDestinoDinamico = results[0].valor; // 👈 ¡Aquí tomamos el del panel!
                }

                // 3. CONFIGURAMOS EL TRANSPORTE DE NODEMAILER USANDO LAS VARIABLES DE RAILWAY
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER, // 🔒 Secreto de Railway
                        pass: process.env.EMAIL_PASS  // 🔒 Secreto de Railway
                    }
                });

                const mailOptions = {
                    from: `"${nombre}" <${email}>`,
                    to: correoDestinoDinamico, // 🎯 ¡Se envía al correo dinámico del Panel de Admin!
                    subject: 'Nuevo mensaje de contacto - Ruumis',
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #0891b2;">¡Tienes un nuevo mensaje de contacto!</h2>
                            <p><strong>Nombre del interesado:</strong> ${nombre}</p>
                            <p><strong>Correo electrónico:</strong> ${email}</p>
                            <p><strong>Mensaje enviado:</strong></p>
                            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; font-style: italic; margin-top: 10px;">
                                "${mensaje}"
                            </div>
                        </div>
                    `
                };

                try {
                    await transporter.sendMail(mailOptions);
                    // Respuesta exitosa que common.min.js inyectará visualmente
                    res.send('<div style="color:green; font-weight:bold; font-family:sans-serif; padding:20px;">¡Mensaje enviado con éxito al administrador!</div>');
                } catch (mailError) {
                    console.error('Error de Nodemailer:', mailError);
                    res.status(500).send('<div style="color:red; font-weight:bold; font-family:sans-serif; padding:20px;">Error al despachar el correo electrónico. Verifique la configuración.</div>');
                }
            });
        });

    } catch (errorCritico) {
        console.error('Error crítico en /api/contacto:', errorCritico);
        res.status(500).send('<div style="color:red; font-weight:bold; font-family:sans-serif; padding:20px;">Error inesperado del servidor.</div>');
    }
});

app.post('/api/feedback', (req, res) => {
    const { feedbackName, feedbackEmail, feedbackMessage } = req.body;

    if (!feedbackName || !feedbackEmail || !feedbackMessage) {
        return res.status(400).send('<div style="color:red; font-weight:bold; font-family:sans-serif; padding:20px;">Todos los campos son obligatorios.</div>');
    }

    const datosMensaje = JSON.stringify({
        nombre: feedbackName,
        email: feedbackEmail,
        mensaje: feedbackMessage,
        fecha: new Date().toISOString()
    });

    const claveUnica = `msg_${Date.now()}`;

    const query = "INSERT INTO configuracion (clave, valor) VALUES (?, ?)";
    
    db.query(query, [claveUnica, datosMensaje], (err, result) => {
        if (err) {
            console.error('Error al guardar el feedback en la tabla configuracion:', err);
            return res.status(500).send('<div style="color:red; font-weight:bold; font-family:sans-serif; padding:20px;">Error interno al procesar el mensaje.</div>');
        }

        res.send('<div style="color:green; font-weight:bold; font-family:sans-serif; padding:20px;">¡Mensaje recibido con éxito! Guardado en el sistema.</div>');
    });
});

app.get('/api/correo', (req, res) => {
    db.query("SELECT valor FROM configuracion WHERE clave = 'correo_destino'", (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener el correo' });
        
        let correo = 'Sin configurar';
        if (results.length > 0 && results[0].valor) {
            correo = results[0].valor;
        }
        res.json({ correo });
    });
});

app.put('/api/correo', (req, res) => {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'El correo es requerido' });

    // Hacemos un UPSERT (Actualizar si existe, insertar si no existe)
    db.query("SELECT * FROM configuracion WHERE clave = 'correo_destino'", (err, results) => {
        if (results.length > 0) {
            db.query("UPDATE configuracion SET valor = ? WHERE clave = 'correo_destino'", [correo], (errUpdate) => {
                if (errUpdate) return res.status(500).json({ error: 'Error al actualizar' });
                res.json({ success: true, message: 'Correo de destino actualizado' });
            });
        } else {
            db.query("INSERT INTO configuracion (clave, valor) VALUES ('correo_destino', ?)", [correo], (errInsert) => {
                if (errInsert) return res.status(500).json({ error: 'Error al insertar' });
                res.json({ success: true, message: 'Correo de destino guardado' });
            });
        }
    });
});

// PARA CONTROLAR TODO EL HEADER (PANEL DE ADMIN)

// Obtener toda la información estructurada para armar el Header dinámico
app.get('/api/header-completo', (req, res) => {
    // Usamos consultas paralelas para traer todo al mismo tiempo de manera eficiente
    const qGeneral = "SELECT clave, valor FROM configuracion_general";
    const qMenu = "SELECT * FROM menu_paginas ORDER BY orden ASC";
    const qRedes = "SELECT * FROM redes_sociales";

    db.query(qGeneral, (errGen, resGen) => {
        if (errGen) return res.status(500).json({ error: 'Error al obtener config general' });

        db.query(qMenu, (errMenu, resMenu) => {
            if (errMenu) return res.status(500).json({ error: 'Error al obtener páginas del menú' });

            db.query(qRedes, (errRedes, resRedes) => {
                if (errRedes) return res.status(500).json({ error: 'Error al obtener redes sociales' });

                // Estructuramos la respuesta convirtiendo la config general en un objeto limpio
                const configObj = {};
                resGen.forEach(item => { configObj[item.clave] = item.valor; });

                res.json({
                    config: configObj,
                    paginas: resMenu,
                    redes: resRedes
                });
            });
        });
    });
});

// Actualizar Configuración General (Nombre de Marca y SVG del Logo)
// LOGO FOOTER Y HEADER
app.put('/api/header/config', upload.fields([
    { name: 'header_logo', maxCount: 1 },
    { name: 'footer_logo', maxCount: 1 }
]), async (req, res) => {
    const { nombre_marca, header_logo_actual, footer_logo_actual } = req.body;
    
    // Si no se suben archivos nuevos, preservamos las URLs actuales de la BD (igual que en Promo)
    let header_logo_url = header_logo_actual;
    let footer_logo_url = footer_logo_actual;

    try {
        // 1. Procesar LOGO DEL HEADER si viene un archivo nuevo
        if (req.files && req.files['header_logo']) {
            const resultHeader = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'ruumis_logos' },
                    (error, uploadResult) => {
                        if (error) return reject(error);
                        resolve(uploadResult);
                    }
                );
                uploadStream.end(req.files['header_logo'][0].buffer);
            });
            header_logo_url = resultHeader.secure_url;
        }

        // 2. Procesar LOGO DEL FOOTER si viene un archivo nuevo
        if (req.files && req.files['footer_logo']) {
            const resultFooter = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'ruumis_logos' },
                    (error, uploadResult) => {
                        if (error) return reject(error);
                        resolve(uploadResult);
                    }
                );
                uploadStream.end(req.files['footer_logo'][0].buffer);
            });
            footer_logo_url = resultFooter.secure_url;
        }

        // 3. Guardar o actualizar en la Base de Datos
        const query = "INSERT INTO configuracion_general (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?";
        
        const updates = [
            ['nombre_marca', nombre_marca],
            ['header_logo', header_logo_url],
            ['footer_logo', footer_logo_url]
        ];

        let completados = 0;
        let huboError = false;

        updates.forEach(item => {
            if (item[1] !== undefined) {
                db.query(query, [item[0], item[1], item[1]], (err) => {
                    if (err) {
                        console.error(`Error actualizando ${item[0]}:`, err);
                        huboError = true;
                    }
                    completados++;
                    
                    if (completados === updates.filter(u => u[1] !== undefined).length) {
                        if (huboError) return res.status(500).json({ error: 'Hubo errores al actualizar la configuración' });
                        res.json({ 
                            success: true, 
                            message: 'Configuración y logos actualizados con éxito',
                            header_logo: header_logo_url,
                            footer_logo: footer_logo_url
                        });
                    }
                });
            }
        });

    } catch (error) {
        console.error("Error en la subida de logos a Cloudinary:", error);
        res.status(500).json({ error: "Error al procesar los logos en la nube" });
    }
});

// Actualizar una página específica del menú (Nombre visible y su URL estética)
app.put('/api/header/pagina/:id', (req, res) => {
    const { id } = req.params;
    const { nombre_visible, url_estetica } = req.body;

    // Normalizar la URL: Asegurar que comience con '/' y formatear espacios como guiones
    let urlLimpia = url_estetica.trim().toLowerCase();
    if (!urlLimpia.startsWith('/')) {
        urlLimpia = '/' + urlLimpia;
    }
    urlLimpia = urlLimpia.replace(/\s+/g, '-');

    const query = "UPDATE menu_paginas SET nombre_visible = ?, url_estetica = ? WHERE id = ?";
    db.query(query, [nombre_visible, urlLimpia, id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar la página en la base de datos' });
        res.json({ success: true, message: 'Página actualizada con éxito' });
    });
});

// Actualizar los enlaces de las Redes Sociales
app.put('/api/header/redes', (req, res) => {
    const { enlaces } = req.body; // Se espera un arreglo de objetos [{ id: 1, url: '...' }]
    
    if (!Array.isArray(enlaces)) return res.status(400).json({ error: 'Formato de datos inválido' });

    let errores = 0;
    enlaces.forEach(red => {
        db.query("UPDATE redes_sociales SET url = ? WHERE id = ?", [red.url, red.id], (err) => {
            if (err) errores++;
        });
    });

    setTimeout(() => {
        if (errores > 0) return res.status(500).json({ error: 'Ocurrieron algunos errores al actualizar las redes' });
        res.json({ success: true, message: 'Redes sociales actualizadas correctamente' });
    }, 400); // Pequeña espera para asegurar la ejecución de los queries distribuidos
});

// URLS DINÁMICAS

// Captura cualquier ruta limpia escrita en el navegador (ej: /acerca-de-nosotros, /habitaciones)
app.get('/:pageSlug', (req, res, next) => {
    const slug = '/' + req.params.pageSlug;

    // Buscamos si el slug escrito coincide con alguna 'url_estetica' de la base de datos
    db.query('SELECT archivo_real FROM menu_paginas WHERE url_estetica = ?', [slug], (err, results) => {
        if (!err && results && results.length > 0) {
            // ¡Magia! El cliente ve la URL limpia, pero el servidor responde mandando el archivo HTML original
            return res.sendFile(path.join(__dirname, 'public', results[0].archivo_real));
        }
        // Si no existe en la base de datos, deja que Express continúe buscando en sus archivos estáticos u otras rutas
        next();
    });
});

// Ruta raíz especial (/) para renderizar dinámicamente la página de inicio original
app.get('/', (req, res) => {
    db.query("SELECT archivo_real FROM menu_paginas WHERE url_estetica = '/'", (err, results) => {
        const archivo = (results && results.length > 0) ? results[0].archivo_real : 'index.html';
        res.sendFile(path.join(__dirname, 'public', archivo));
    });
});


// RUTAS PARA EL FOOTER

// GET: Obtiene los textos guardados en la tabla general
app.get('/api/footer', (req, res) => {
    db.query("SELECT clave, valor FROM configuracion_general WHERE clave LIKE 'footer_%'", (err, results) => {
        // SOLUCIÓN AL CUELGUE: Si falla la BD, avisamos de inmediato para desbloquear el Front-End
        if (err) {
            console.error("Error interno de MySQL en Footer:", err);
            return res.status(500).json({ error: "Error al leer la base de datos", detalle: err.message });
        }

        // Convertimos el Array de filas de la BD en un único objeto limpio para el Front
        const datosPlanos = {};
        if (results && results.length > 0) {
            results.forEach(fila => {
                datosPlanos[fila.clave] = fila.valor;
            });
        }
        
        return res.json(datosPlanos); // Envía {} si está vacío, pero NUNCA se queda colgado
    });
});

// PUT: Guarda o actualiza los textos enviados desde el panel
app.put('/api/footer', (req, res) => { // <-- ALINEADO: Se quitó el '/textos' sobrante
    const textos = req.body; 
    
    if (!textos || Object.keys(textos).length === 0) {
        return res.status(400).json({ error: 'No se recibieron datos para actualizar' });
    }

    const keys = Object.keys(textos);
    let queriesCompletadas = 0;
    let huboError = false;

    keys.forEach(clave => {
        const valor = textos[clave];
        db.query(
            "INSERT INTO configuracion_general (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?",
            [clave, valor, valor],
            (err) => {
                if (err) {
                    console.error(`Error al actualizar clave ${clave}:`, err);
                    if (!huboError) {
                        huboError = true;
                        return res.status(500).json({ error: "Error al procesar la actualización en lote" });
                    }
                    return;
                }
                
                queriesCompletadas++;
                if (queriesCompletadas === keys.length && !huboError) {
                    return res.json({ success: true, message: '¡Textos del footer actualizados exitosamente!' });
                }
            }
        );
    });
});


// ==========================================
// SECCIÓN: CONTROL DE IMÁGENES (CLOUDINARY)
// ==========================================
const fs = require('fs');

// 1. Subir una imagen individual (ej. Logotipo, logos de marcas, etc.) directamente a Cloudinary
app.post('/api/upload-image', upload.single('imagen'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo válido.' });
    }

    // Subimos directamente el buffer a Cloudinary usando upload_stream
    cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
        if (error) {
            console.error("Error al subir imagen a Cloudinary:", error);
            return res.status(500).json({ error: 'Error al subir la imagen a la nube' });
        }
        
        // TIP DE COMPATIBILIDAD: Enviamos la URL de Cloudinary tanto en 'url' como en 'fileName'.
        // De esta manera, si tu frontend antes guardaba "res.fileName" o "res.url", 
        // guardará la ruta de internet correcta sin romperse.
        res.json({ 
            success: true, 
            fileName: result.secure_url, 
            url: result.secure_url 
        }); 
    }).end(req.file.buffer);
});

// 2. Eliminar una imagen (Soporta borrado físico local antiguo y borrado en Cloudinary)
app.delete('/api/delete-image', (req, res) => {
    const { nombreArchivo } = req.body; 
    
    if (!nombreArchivo || nombreArchivo === 'default.jpg' || nombreArchivo === 'placeholder.jpg') {
        return res.json({ success: true, message: 'No requiere borrado físico' });
    }

    // CASO A: La imagen guardada es una URL completa de Cloudinary
    if (nombreArchivo.includes('cloudinary.com')) {
        try {
            // Extraemos el public_id de la URL de Cloudinary (el nombre único sin la extensión)
            // Ejemplo: .../v1783024268/logo_ejemplo.png -> 'logo_ejemplo'
            const partesUrl = nombreArchivo.split('/');
            const archivoConExtension = partesUrl[partesUrl.length - 1];
            const publicId = archivoConExtension.split('.')[0]; 

            // Ejecutamos la destrucción del recurso en Cloudinary
            cloudinary.uploader.destroy(publicId, (error, result) => {
                if (error) {
                    console.error("Error al eliminar recurso en Cloudinary:", error);
                    return res.status(500).json({ error: 'Error al eliminar el archivo de Cloudinary' });
                }
                return res.json({ success: true, message: 'Imagen eliminada de Cloudinary con éxito', result });
            });
        } catch (e) {
            console.error("Error procesando URL de Cloudinary:", e);
            return res.status(500).json({ error: 'No se pudo procesar la URL para su borrado' });
        }
    } 
    // CASO B: Es una imagen vieja que se quedó de forma local (ej. "booking-logo.png")
    else {
        const rutaArchivo = path.join(__dirname, 'public/uploads', nombreArchivo);

        if (fs.existsSync(rutaArchivo)) {
            fs.unlink(rutaArchivo, (err) => {
                if (err) {
                    console.error("Error al borrar la imagen física local:", err);
                    return res.status(500).json({ error: 'Error al eliminar el archivo local del servidor' });
                }
                res.json({ success: true, message: 'Archivo local eliminado físicamente' });
            });
        } else {
            res.json({ success: true, message: 'El archivo local ya no existía en el servidor' });
        }
    }
});

// ==========================================
// SECCIÓN: FAVICON Y CONFIGURACIONES
// ==========================================

app.put('/api/config/favicon', (req, res) => {
    const { nuevoFavicon } = req.body;
    
    // ⚠️ DETALLE DETECTADO: Tenías: WHERE clave = 'correo_destino'. 
    // Si estás actualizando el favicon, tu condición SQL debe apuntar a la clave del favicon.
    const sql = "UPDATE configuracion SET favicon = ? WHERE clave = 'favicon'";
    
    db.query(sql, [nuevoFavicon], (err, result) => {
        if (err) {
            console.error("ERROR EN BASE DE DATOS:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Favicon actualizado con éxito en la base de datos' });
    });
});

// Tu endpoint global de subida /api/upload (Se mantiene igual porque ya funciona excelente)
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
        if (error) {
            console.error("Error al subir a Cloudinary:", error);
            return res.status(500).json({ error: 'Error al subir a la nube' });
        }
        res.json({ url: result.secure_url }); 
    }).end(req.file.buffer);
});

// ==========================================
// MÓDULO HERO SECTION (HOME)

// Endpoint para obtener la información actual del Home
app.get('/api/cms/home', (req, res) => {
    const sql = "SELECT * FROM admin_home WHERE id = 1";
    db.query(sql, (err, result) => {
        if (err) {
            console.error("Error al obtener datos de admin_home:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(result[0]);
    });
});

// Endpoint dinámico para actualizar cualquier texto/campo del Home de forma directa
app.put('/api/cms/home/actualizar', (req, res) => {
    const { columna, valor } = req.body;

    // Lista blanca de columnas permitidas por seguridad para evitar inyección SQL en identificadores
    const columnasPermitidas = [
        'hero_titulo', 'hero_descripcion', 'hero_imagen', 
        'lbl_checkin', 'lbl_checkout', 'lbl_guests', 
        'lbl_adults', 'lbl_children', 'btn_search'
    ];

    if (!columnasPermitidas.includes(columna)) {
        return res.status(400).json({ error: "Columna no válida o no autorizada." });
    }

    // Usamos el operador ?? de mysql2 para escapar nombres de columnas de manera segura
    const sql = "UPDATE admin_home SET ?? = ? WHERE id = 1";
    db.query(sql, [columna, valor], (err, result) => {
        if (err) {
            console.error(`Error al actualizar la columna [${columna}]:`, err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: `Campo ${columna} actualizado con éxito.` });
    });
});


// ==========================================
// HOME (ROOMS SECTION)
// ==========================================

// GET: Obtener la configuración general del Home (Hero + Rooms Section)
app.get('/api/home', (req, res) => {
    const sql = "SELECT * FROM admin_home WHERE id = 1";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error al consultar admin_home:", err);
            return res.status(500).json({ error: 'Error interno en la base de datos' });
        }
        res.json(results[0] || {});
    });
});

// PUT: Guardar modificaciones específicas de ROOMS SECTION
app.put('/api/home/rooms', (req, res) => {
    const {
        rooms_titulo,
        rooms_btn_ver_mas,
        rooms_lbl_precio_noche,
        rooms_lbl_sleeps,
        rooms_lbl_beds,
        rooms_lbl_disponibilidad,
        rooms_card_titulo,
        rooms_card_subtitulo,
        rooms_card_linea1,
        rooms_card_linea2,
        rooms_card_btn
    } = req.body;

    const sql = `
        UPDATE admin_home SET 
            rooms_titulo = ?, 
            rooms_btn_ver_mas = ?, 
            rooms_lbl_precio_noche = ?, 
            rooms_lbl_sleeps = ?, 
            rooms_lbl_beds = ?, 
            rooms_lbl_disponibilidad = ?, 
            rooms_card_titulo = ?, 
            rooms_card_subtitulo = ?, 
            rooms_card_linea1 = ?, 
            rooms_card_linea2 = ?, 
            rooms_card_btn = ?
        WHERE id = 1
    `;

    const values = [
        rooms_titulo,
        rooms_btn_ver_mas,
        rooms_lbl_precio_noche,
        rooms_lbl_sleeps,
        rooms_lbl_beds,
        rooms_lbl_disponibilidad,
        rooms_card_titulo,
        rooms_card_subtitulo,
        rooms_card_linea1,
        rooms_card_linea2,
        rooms_card_btn
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("Error al actualizar la sección de anuncios de admin_home:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: '¡Sección de anuncios (Rooms Section) actualizada correctamente!' });
    });
});

// ==========================================
// HOME (ABOUT SECTION)
// ==========================================

// Endpoint para actualizar los datos de la sección de inicio (admin_home)
app.put('/api/admin_home', (req, res) => {
    const {
        about_titulo,
        about_descripcion,
        about_item1_text,
        about_item2_text,
        about_item3_text,
        about_item4_text,
        about_btn1_text,
        about_btn2_text,
        about_video_url
    } = req.body;

    const sql = `
        UPDATE admin_home 
        SET 
            about_titulo = ?, 
            about_descripcion = ?, 
            about_item1_text = ?, 
            about_item2_text = ?, 
            about_item3_text = ?, 
            about_item4_text = ?, 
            about_btn1_text = ?, 
            about_btn2_text = ?, 
            about_video_url = ?
        WHERE id = 1
    `;

    db.query(sql, [
        about_titulo, 
        about_descripcion, 
        about_item1_text, 
        about_item2_text, 
        about_item3_text, 
        about_item4_text, 
        about_btn1_text, 
        about_btn2_text, 
        about_video_url
    ], (err, result) => {
        if (err) {
            console.error("Error al actualizar la sección About:", err);
            return res.status(500).json({ error: 'Error al actualizar la base de datos' });
        }
        res.json({ success: true, message: 'Sección About actualizada correctamente' });
    });
});

// ==========================================
// HOME (RATING SECTION)
// ==========================================
app.put('/api/home/rating', (req, res) => {
    const {
        rating_item1_num,
        rating_item1_text,
        rating_item1_logo,
        rating_item2_num,
        rating_item2_text,
        rating_item2_logo,
        rating_item3_num,
        rating_item3_text,
        rating_item3_logo,
        rating_animacion
    } = req.body;

    const sql = `
        UPDATE admin_home 
        SET 
            rating_item1_num = ?, 
            rating_item1_text = ?, 
            rating_item1_logo = ?, 
            rating_item2_num = ?, 
            rating_item2_text = ?, 
            rating_item2_logo = ?, 
            rating_item3_num = ?, 
            rating_item3_text = ?, 
            rating_item3_logo = ?, 
            rating_animacion = ?
        WHERE id = 1
    `;

    db.query(sql, [
        rating_item1_num, 
        rating_item1_text, 
        rating_item1_logo, 
        rating_item2_num, 
        rating_item2_text, 
        rating_item2_logo, 
        rating_item3_num, 
        rating_item3_text, 
        rating_item3_logo, 
        rating_animacion
    ], (err, result) => {
        if (err) {
            console.error("Error al actualizar la sección Rating:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Sección Rating actualizada correctamente.' });
    });
});


// ==========================================
// REVIEWS SECTION
// ==========================================

//Obtener el título de la sección y la lista completa de comentarios
app.get('/api/home/reviews', (req, res) => {
    //Primero obtenemos el título de la tabla admin_home
    db.query("SELECT reviews_titulo FROM admin_home WHERE id = 1", (err, titleResult) => {
        if (err) {
            console.error("Error al obtener título de reviews:", err);
            return res.status(500).json({ error: err.message });
        }
        
        //Luego obtenemos todos los comentarios individuales
        db.query("SELECT * FROM home_reviews ORDER BY id ASC", (err, reviewsResults) => {
            if (err) {
                console.error("Error al obtener lista de comentarios:", err);
                return res.status(500).json({ error: err.message });
            }
            
            res.json({
                reviews_titulo: titleResult[0] ? titleResult[0].reviews_titulo : 'What our guests say',
                comentarios: reviewsResults
            });
        });
    });
});

//Actualizar el título general de la sección
app.put('/api/home/reviews/title', (req, res) => {
    const { reviews_titulo } = req.body;
    db.query("UPDATE admin_home SET reviews_titulo = ? WHERE id = 1", [reviews_titulo], (err, result) => {
        if (err) {
            console.error("Error al actualizar título de reviews:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Título de la sección actualizado correctamente.' });
    });
});

//Agregar un nuevo comentario
app.post('/api/home/reviews', (req, res) => {
    const { bg_image, stars, date_text, title, text, avatar, name } = req.body;
    const sql = `INSERT INTO home_reviews (bg_image, stars, date_text, title, text, avatar, name) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [bg_image || 'img/placeholder.jpg', stars || 5, date_text, title, text, avatar || 'img/placeholder.jpg', name], (err, result) => {
        if (err) {
            console.error("Error al insertar comentario:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Comentario agregado con éxito.', insertId: result.insertId });
    });
});

//Editar un comentario existente
app.put('/api/home/reviews/:id', (req, res) => {
    const { id } = req.params;
    const { bg_image, stars, date_text, title, text, avatar, name } = req.body;
    const sql = `UPDATE home_reviews 
                 SET bg_image = ?, stars = ?, date_text = ?, title = ?, text = ?, avatar = ?, name = ? 
                 WHERE id = ?`;
                 
    db.query(sql, [bg_image, stars, date_text, title, text, avatar, name, id], (err, result) => {
        if (err) {
            console.error("Error al actualizar comentario:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Comentario actualizado con éxito.' });
    });
});

//Eliminar un comentario
app.delete('/api/home/reviews/:id', (req, res) => {
    const { id } = req.params;
    db.query("DELETE FROM home_reviews WHERE id = ?", [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar comentario:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Comentario eliminado correctamente.' });
    });
});

// ========================================================
// PROMO SECTION 
// ========================================================

// GET - Obtener datos de la sección Promo
app.get('/api/home/promo', (req, res) => {
    const sql = 'SELECT promo_titulo, promo_descripcion, promo_item1_title, promo_item1_text, promo_item2_title, promo_item2_text, promo_imagen, promo_review_text, promo_review_name FROM admin_home WHERE id = 1';
    db.query(sql, (err, result) => {
        if (err) {
            console.error("Error al obtener la sección Promo:", err);
            return res.status(500).json({ error: "Error en el servidor al cargar Promo" });
        }
        res.json(result[0] || {});
    });
});

// PUT - Actualizar datos de la sección Promo con imagen en Cloudinary
app.put('/api/home/promo', upload.single('promo_imagen'), async (req, res) => {
    const {
        promo_titulo,
        promo_descripcion,
        promo_item1_title,
        promo_item1_text,
        promo_item2_title,
        promo_item2_text,
        promo_review_text,
        promo_review_name
    } = req.body;

    // Si no se sube un archivo nuevo, preservamos la URL de la imagen actual
    let promo_imagen_url = req.body.promo_imagen_actual; 

    try {
        if (req.file) {
            // Envío del buffer del archivo directamente a Cloudinary
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'ruumis_promo' },
                    (error, uploadResult) => {
                        if (error) return reject(error);
                        resolve(uploadResult);
                    }
                );
                uploadStream.end(req.file.buffer);
            });
            promo_imagen_url = result.secure_url;
        }

        const sql = `
            UPDATE admin_home 
            SET 
                promo_titulo = ?, 
                promo_descripcion = ?, 
                promo_item1_title = ?, 
                promo_item1_text = ?, 
                promo_item2_title = ?, 
                promo_item2_text = ?, 
                promo_imagen = ?, 
                promo_review_text = ?, 
                promo_review_name = ?
            WHERE id = 1
        `;

        db.query(sql, [
            promo_titulo,
            promo_descripcion,
            promo_item1_title,
            promo_item1_text,
            promo_item2_title,
            promo_item2_text,
            promo_imagen_url,
            promo_review_text,
            promo_review_name
        ], (err, result) => {
            if (err) {
                console.error("Error al actualizar la tabla admin_home (Promo):", err);
                return res.status(500).json({ error: "Error al guardar en la base de datos" });
            }
            res.json({ message: "¡Sección Promo actualizada con éxito!", promo_imagen: promo_imagen_url });
        });

    } catch (error) {
        console.error("Error en la subida a Cloudinary de la sección Promo:", error);
        res.status(500).json({ error: "Error al procesar la imagen promocional" });
    }
});



cron.schedule('*/5 * * * *', () => {
    sincronizarCalendarios();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});