import { Router } from "express";
import pool from "../db.js";

const router = Router();

// =========================================================
// CONFIGURACIÓN DE VALIDACIONES
// =========================================================

// Campos de texto sobre los que actúa ?search=
const camposBusqueda = [
    "nombre_producto",
    "color_producto",
    "marca_producto",
    "modelo"
];

// Columnas que se aceptan como filtro exacto (?columna=valor)
const columnasFiltrables = [
    "estado",
    "marca_producto",
    "color_producto",
    "modelo",
    "id_talla",
    "id_proveedor",
    "id_local"
];

// =========================================================
// FUNCIONES DE VALIDACIÓN
// =========================================================

// Verifica que un valor sea texto.
// También permite que sea opcional cuando allowEmpty = true.
const validarTexto = (valor, nombreCampo, allowEmpty = true) => {
    if (valor === undefined || valor === null) {
        if (allowEmpty) {
            return null;
        }

        return `${nombreCampo} es requerido`;
    }

    // No permite números, booleanos, objetos ni arrays.
    if (typeof valor !== "string") {
        return `${nombreCampo} debe ser texto`;
    }

    // Evita textos completamente vacíos.
    if (!allowEmpty && valor.trim() === "") {
        return `${nombreCampo} no puede estar vacío`;
    }

    return null;
};

// Verifica que sea un entero positivo.
// Ejemplo válido: 1, 25, 100
// Ejemplo inválido: "25abc", 2.5, -1, "hola"
const validarId = (valor, nombreCampo, requerido = false) => {
    if (valor === undefined || valor === null || valor === "") {
        if (requerido) {
            return `${nombreCampo} es requerido`;
        }

        return null;
    }

    // Los IDs deben llegar como número.
    if (typeof valor !== "number") {
        return `${nombreCampo} debe ser un número entero`;
    }

    if (!Number.isInteger(valor)) {
        return `${nombreCampo} debe ser un número entero`;
    }

    if (valor <= 0) {
        return `${nombreCampo} debe ser mayor que 0`;
    }

    return null;
};

// Verifica números enteros >= 0.
// Se utiliza principalmente para cantidades.
const validarCantidad = (valor, nombreCampo, requerido = false) => {
    if (valor === undefined || valor === null || valor === "") {
        if (requerido) {
            return `${nombreCampo} es requerido`;
        }

        return null;
    }

    if (typeof valor !== "number") {
        return `${nombreCampo} debe ser un número`;
    }

    if (!Number.isInteger(valor)) {
        return `${nombreCampo} debe ser un número entero`;
    }

    if (valor < 0) {
        return `${nombreCampo} no puede ser negativo`;
    }

    return null;
};

// Verifica números decimales o enteros >= 0.
// Se utiliza para valor_unitario.
const validarPrecio = (valor, nombreCampo, requerido = false) => {
    if (valor === undefined || valor === null || valor === "") {
        if (requerido) {
            return `${nombreCampo} es requerido`;
        }

        return null;
    }

    if (typeof valor !== "number") {
        return `${nombreCampo} debe ser un número`;
    }

    if (!Number.isFinite(valor)) {
        return `${nombreCampo} debe ser un número válido`;
    }

    if (valor < 0) {
        return `${nombreCampo} no puede ser negativo`;
    }

    return null;
};

// Verifica el estado del producto.
const validarEstado = (valor, requerido = false) => {
    if (valor === undefined || valor === null || valor === "") {
        if (requerido) {
            return "estado es requerido";
        }

        return null;
    }

    if (typeof valor !== "string") {
        return "estado debe ser texto";
    }

    const estadosPermitidos = [
        "activo",
        "inactivo"
    ];

    if (!estadosPermitidos.includes(valor.toLowerCase())) {
        return `estado debe ser uno de: ${estadosPermitidos.join(", ")}`;
    }

    return null;
};

// =========================================================
// VALIDAR PRODUCTO
// =========================================================
//
// Esta función centraliza las validaciones para evitar
// repetirlas en POST, PUT y PATCH.
//

const validarProducto = (datos, modo = "create") => {
    const errores = [];

    // -----------------------------------------------------
    // CAMPOS DE TEXTO
    // -----------------------------------------------------

    const camposTexto = [
        ["img_producto", "Imagen del producto"],
        ["nombre_producto", "Nombre del producto"],
        ["descripcion", "Descripción"],
        ["color_producto", "Color del producto"],
        ["marca_producto", "Marca del producto"],
        ["modelo", "Modelo"]
    ];

    for (const [campo, nombre] of camposTexto) {
        const error = validarTexto(
            datos[campo],
            nombre,
            modo === "create" && campo === "nombre_producto"
                ? false
                : true
        );

        if (error) {
            errores.push(error);
        }
    }

    // -----------------------------------------------------
    // IDS
    // -----------------------------------------------------

    // El frontend puede mandar id_talla o id_medida.
    const talla = datos.id_talla ?? datos.id_medida;

    const errorTalla = validarId(
        talla,
        "id_talla",
        modo === "create"
    );

    if (errorTalla) {
        errores.push(errorTalla);
    }

    const errorProveedor = validarId(
        datos.id_proveedor,
        "id_proveedor",
        modo === "create"
    );

    if (errorProveedor) {
        errores.push(errorProveedor);
    }

    const errorLocal = validarId(
        datos.id_local,
        "id_local",
        false
    );

    if (errorLocal) {
        errores.push(errorLocal);
    }

    // -----------------------------------------------------
    // CANTIDAD
    // -----------------------------------------------------

    const errorCantidad = validarCantidad(
        datos.cant_producto,
        "cant_producto",
        false
    );

    if (errorCantidad) {
        errores.push(errorCantidad);
    }

    // -----------------------------------------------------
    // PRECIO
    // -----------------------------------------------------

    const errorPrecio = validarPrecio(
        datos.valor_unitario,
        "valor_unitario",
        modo === "create"
    );

    if (errorPrecio) {
        errores.push(errorPrecio);
    }

    // -----------------------------------------------------
    // ESTADO
    // -----------------------------------------------------

    const errorEstado = validarEstado(
        datos.estado,
        false
    );

    if (errorEstado) {
        errores.push(errorEstado);
    }

    return errores;
};

// =========================================================
// SELECT DE PRODUCTOS
// =========================================================

// id_talla se expone también como id_medida porque así
// lo utiliza actualmente el frontend.
const SELECT_PRODUCTOS = `
    SELECT 
        id, 
        img_producto, 
        nombre_producto, 
        descripcion, 
        color_producto, 
        marca_producto, 
        cant_producto, 
        modelo, 
        id_talla, 
        id_talla AS id_medida, 
        id_proveedor, 
        id_local, 
        valor_unitario, 
        estado 
    FROM productos 
`;

// =========================================================
// OBTENER TODOS LOS PRODUCTOS
// =========================================================

router.get("/", async (req, res) => {
    try {
        const { search, ...filtros } = req.query;

        const condiciones = [];
        const params = [];

        // -------------------------------------------------
        // VALIDAR SEARCH
        // -------------------------------------------------

        if (search !== undefined) {

            if (typeof search !== "string") {
                return res.status(400).json({
                    error: "search debe ser texto"
                });
            }

            if (search.trim() !== "") {
                condiciones.push(
                    `(${camposBusqueda
                        .map((campo) => `${campo} LIKE ?`)
                        .join(" OR ")})`
                );

                camposBusqueda.forEach(() => {
                    params.push(`%${search}%`);
                });
            }
        }

        // -------------------------------------------------
        // FILTROS
        // -------------------------------------------------

        for (const [campo, valor] of Object.entries(filtros)) {

            if (!columnasFiltrables.includes(campo)) {
                continue;
            }

            // Filtros de texto
            if (
                campo === "estado" ||
                campo === "marca_producto" ||
                campo === "color_producto" ||
                campo === "modelo"
            ) {
                if (typeof valor !== "string") {
                    return res.status(400).json({
                        error: `${campo} debe ser texto`
                    });
                }
            }

            // Filtros que son IDs
            if (
                campo === "id_talla" ||
                campo === "id_proveedor" ||
                campo === "id_local"
            ) {
                const numero = Number(valor);

                if (
                    !/^\d+$/.test(valor) ||
                    !Number.isInteger(numero) ||
                    numero <= 0
                ) {
                    return res.status(400).json({
                        error: `${campo} debe ser un número entero positivo`
                    });
                }
            }

            condiciones.push(`${campo} = ?`);
            params.push(valor);
        }

        let query = SELECT_PRODUCTOS;

        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }

        query += " ORDER BY id ASC";

        const [rows] = await pool.query(query, params);

        res.json(rows);

    } catch (error) {
        console.error("Error al obtener los productos:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// OBTENER UN PRODUCTO POR ID
// =========================================================

router.get("/:id", async (req, res) => {
    try {

        // Validar que el ID de la URL sea entero positivo.
        if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
            return res.status(400).json({
                error: "El ID del producto debe ser un número entero positivo"
            });
        }

        const [rows] = await pool.query(
            `${SELECT_PRODUCTOS} WHERE id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("Error al obtener el producto:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// CREAR UN NUEVO PRODUCTO
// =========================================================

router.post("/", async (req, res) => {
    try {

        // -------------------------------------------------
        // VALIDAR QUE EL BODY SEA UN OBJETO
        // -------------------------------------------------

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                error: "Los datos del producto deben enviarse como un objeto"
            });
        }

        const {
            img_producto,
            nombre_producto,
            descripcion,
            color_producto,
            marca_producto,
            cant_producto,
            modelo,
            id_talla,
            id_medida,
            id_proveedor,
            id_local,
            valor_unitario,
            estado
        } = req.body;

        // -------------------------------------------------
        // VALIDAR CAMPOS
        // -------------------------------------------------

        const errores = validarProducto(req.body, "create");

        if (errores.length > 0) {
            return res.status(400).json({
                error: "Datos del producto inválidos",
                detalles: errores
            });
        }

        // El frontend puede enviar id_medida.
        // La base de datos utiliza id_talla.
        const talla = id_talla ?? id_medida;

        // -------------------------------------------------
        // INSERTAR
        // -------------------------------------------------

        const [result] = await pool.query(
            `INSERT INTO productos (
                img_producto,
                nombre_producto,
                descripcion,
                color_producto,
                marca_producto,
                cant_producto,
                modelo,
                id_talla,
                id_proveedor,
                id_local,
                valor_unitario,
                estado
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                img_producto ?? null,
                nombre_producto.trim(),
                descripcion ?? null,
                color_producto ?? null,
                marca_producto.trim(),
                cant_producto ?? 0,
                modelo.trim(),
                talla,
                id_proveedor,
                id_local ?? null,
                valor_unitario,
                estado ?? "activo"
            ]
        );

        // -------------------------------------------------
        // OBTENER PRODUCTO CREADO
        // -------------------------------------------------

        const [rows] = await pool.query(
            `${SELECT_PRODUCTOS} WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            mensaje: "Producto creado exitosamente",
            id: result.insertId,
            producto: rows[0]
        });

    } catch (error) {
        console.error("Error al crear producto:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// ACTUALIZAR UN PRODUCTO COMPLETO
// =========================================================

router.put("/:id", async (req, res) => {
    try {

        // -------------------------------------------------
        // VALIDAR ID
        // -------------------------------------------------

        if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
            return res.status(400).json({
                error: "El ID del producto debe ser un número entero positivo"
            });
        }

        // -------------------------------------------------
        // VERIFICAR QUE EXISTA
        // -------------------------------------------------

        const [existing] = await pool.query(
            "SELECT id FROM productos WHERE id = ?",
            [req.params.id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        // -------------------------------------------------
        // VALIDAR BODY
        // -------------------------------------------------

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                error: "Los datos del producto deben enviarse como un objeto"
            });
        }

        const {
            img_producto,
            nombre_producto,
            descripcion,
            color_producto,
            marca_producto,
            cant_producto,
            modelo,
            id_talla,
            id_medida,
            id_proveedor,
            id_local,
            valor_unitario,
            estado
        } = req.body;

        // -------------------------------------------------
        // PUT ACTUALIZA EL PRODUCTO COMPLETO
        // Por eso los campos importantes son requeridos.
        // -------------------------------------------------

        const errores = validarProducto(
            req.body,
            "create"
        );

        if (errores.length > 0) {
            return res.status(400).json({
                error: "Datos del producto inválidos",
                detalles: errores
            });
        }

        // -------------------------------------------------
        // ACTUALIZAR
        // -------------------------------------------------

        await pool.query(
            `UPDATE productos SET
                img_producto = ?,
                nombre_producto = ?,
                descripcion = ?,
                color_producto = ?,
                marca_producto = ?,
                cant_producto = ?,
                modelo = ?,
                id_talla = ?,
                id_proveedor = ?,
                id_local = ?,
                valor_unitario = ?,
                estado = ?
            WHERE id = ?`,
            [
                img_producto ?? null,
                nombre_producto.trim(),
                descripcion ?? null,
                color_producto ?? null,
                marca_producto.trim(),
                cant_producto ?? 0,
                modelo.trim(),
                id_talla ?? id_medida,
                id_proveedor,
                id_local ?? null,
                valor_unitario,
                estado ?? "activo",
                req.params.id
            ]
        );

        const [rows] = await pool.query(
            `${SELECT_PRODUCTOS} WHERE id = ?`,
            [req.params.id]
        );

        res.json(rows[0]);

    } catch (error) {
        console.error("Error al actualizar producto:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// ACTUALIZAR PARCIALMENTE UN PRODUCTO
// =========================================================

router.patch("/:id", async (req, res) => {
    try {

        // -------------------------------------------------
        // VALIDAR ID
        // -------------------------------------------------

        if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
            return res.status(400).json({
                error: "El ID del producto debe ser un número entero positivo"
            });
        }

        // -------------------------------------------------
        // VALIDAR BODY
        // -------------------------------------------------

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                error: "Los datos deben enviarse como un objeto"
            });
        }

        // -------------------------------------------------
        // VALIDAR SOLO LOS CAMPOS ENVIADOS
        // -------------------------------------------------

        const errores = validarProducto(
            req.body,
            "update"
        );

        if (errores.length > 0) {
            return res.status(400).json({
                error: "Datos del producto inválidos",
                detalles: errores
            });
        }

        // -------------------------------------------------
        // COLUMNAS QUE PUEDEN MODIFICARSE
        // -------------------------------------------------

        const columnas = [
            "img_producto",
            "nombre_producto",
            "descripcion",
            "color_producto",
            "marca_producto",
            "cant_producto",
            "modelo",
            "id_talla",
            "id_proveedor",
            "id_local",
            "valor_unitario",
            "estado"
        ];

        const campos = [];
        const params = [];

        for (const columna of columnas) {

            let valor = req.body[columna];

            // El frontend puede enviar id_medida
            // aunque la base de datos use id_talla.
            if (
                columna === "id_talla" &&
                valor === undefined
            ) {
                valor = req.body.id_medida;
            }

            if (valor !== undefined) {

                // Limpiar textos antes de guardarlos.
                if (
                    typeof valor === "string" &&
                    [
                        "nombre_producto",
                        "descripcion",
                        "color_producto",
                        "marca_producto",
                        "modelo",
                        "estado",
                        "img_producto"
                    ].includes(columna)
                ) {
                    valor = valor.trim();
                }

                campos.push(`${columna} = ?`);
                params.push(valor);
            }
        }

        // -------------------------------------------------
        // VERIFICAR QUE SE ENVÍE AL MENOS UN CAMPO
        // -------------------------------------------------

        if (campos.length === 0) {
            return res.status(400).json({
                error: "No se enviaron campos para actualizar"
            });
        }

        // -------------------------------------------------
        // ACTUALIZAR
        // -------------------------------------------------

        params.push(req.params.id);

        const [result] = await pool.query(
            `UPDATE productos SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        // -------------------------------------------------
        // DEVOLVER PRODUCTO ACTUALIZADO
        // -------------------------------------------------

        const [rows] = await pool.query(
            `${SELECT_PRODUCTOS} WHERE id = ?`,
            [req.params.id]
        );

        res.json(rows[0]);

    } catch (error) {
        console.error("Error al actualizar producto:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// ELIMINAR UN PRODUCTO
// =========================================================

router.delete("/:id", async (req, res) => {
    try {

        // -------------------------------------------------
        // VALIDAR ID
        // -------------------------------------------------

        if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
            return res.status(400).json({
                error: "El ID del producto debe ser un número entero positivo"
            });
        }

        // -------------------------------------------------
        // ELIMINAR
        // -------------------------------------------------

        const [result] = await pool.query(
            "DELETE FROM productos WHERE id = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: "Producto no encontrado"
            });
        }

        res.json({
            mensaje: "Producto eliminado exitosamente"
        });

    } catch (error) {
        console.error("Error al eliminar producto:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

// =========================================================
// EXPORTAR ROUTER
// =========================================================

export default router;