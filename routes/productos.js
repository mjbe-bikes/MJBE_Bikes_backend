import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Campos de texto sobre los que actua ?search=
const camposBusqueda = ["nombre_producto", "color_producto", "marca_producto", "modelo"];

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

// id_talla se expone tambien como id_medida porque asi lo pide el frontend
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

// Obtener todos los productos (con busqueda y filtros opcionales)
router.get("/", async (req, res) => {
    try {
        const { search, ...filtros } = req.query;

        const condiciones = [];
        const params = [];

        if (search) {
            condiciones.push(`(${camposBusqueda.map((campo) => `${campo} LIKE ?`).join(" OR ")})`);
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        for (const [campo, valor] of Object.entries(filtros)) {
            if (columnasFiltrables.includes(campo)) {
                condiciones.push(`${campo} = ?`);
                params.push(valor);
            }
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
        res.status(500).json({ error: error.message });
    }
});

// Obtener un producto por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_PRODUCTOS} WHERE id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el producto:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo producto
router.post("/", async (req, res) => {
    try {
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

        // El frontend envia id_medida; la columna real es id_talla
        const talla = id_talla ?? id_medida;

        // Validar campos requeridos
        if (!nombre_producto || !marca_producto || !modelo || !talla || !id_proveedor || !valor_unitario) {
            return res.status(400).json({
                error: "Nombre, marca, modelo, talla, proveedor y valor unitario son campos requeridos"
            });
        }

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
                img_producto,
                nombre_producto,
                descripcion,
                color_producto,
                marca_producto,
                cant_producto,
                modelo,
                talla,
                id_proveedor,
                id_local,
                valor_unitario,
                estado ?? "activo"
            ]
        );

        const [rows] = await pool.query(`${SELECT_PRODUCTOS} WHERE id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Producto creado exitosamente",
            id: result.insertId,
            producto: rows[0]
        });
    } catch (error) {
        console.error("Error al crear producto:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un producto completo
router.put("/:id", async (req, res) => {
    try {
        const [existing] = await pool.query("SELECT id FROM productos WHERE id = ?", [req.params.id]);

        if (existing.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
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
                img_producto,
                nombre_producto,
                descripcion,
                color_producto,
                marca_producto,
                cant_producto,
                modelo,
                id_talla ?? id_medida,
                id_proveedor,
                id_local,
                valor_unitario,
                estado,
                req.params.id
            ]
        );

        const [rows] = await pool.query(`${SELECT_PRODUCTOS} WHERE id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar producto:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar parcialmente un producto (por ejemplo solo el estado)
router.patch("/:id", async (req, res) => {
    try {
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
            if (columna === "id_talla" && valor === undefined) {
                valor = req.body.id_medida;
            }
            if (valor !== undefined) {
                campos.push(`${columna} = ?`);
                params.push(valor);
            }
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: "No se enviaron campos para actualizar" });
        }

        params.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE productos SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const [rows] = await pool.query(`${SELECT_PRODUCTOS} WHERE id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar producto:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un producto
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        res.json({ mensaje: "Producto eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
