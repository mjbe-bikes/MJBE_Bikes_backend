import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Filtros exactos admitidos: ?id_proveedor=  ?pago=
const columnasFiltrables = ["id_proveedor", "pago"];

// SELECT con JOIN (alias co = compras, pr = proveedores)
const SELECT_COMPRAS = `
    SELECT
        co.id,
        co.id_proveedor,
        co.fecha,
        co.total_compra,
        co.pago,
        pr.nombre_proveedor AS proveedor
    FROM compras co
    LEFT JOIN proveedores pr ON pr.id = co.id_proveedor
`;

// Obtener todas las compras (soporta ?id_proveedor=)
router.get("/", async (req, res) => {
    try {
        const condiciones = [];
        const params = [];

        for (const [campo, valor] of Object.entries(req.query)) {
            if (columnasFiltrables.includes(campo)) {
                condiciones.push(`co.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_COMPRAS;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY co.fecha DESC, co.id DESC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener las compras:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener una compra por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_COMPRAS} WHERE co.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Compra no encontrada" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener la compra:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear una nueva compra
router.post("/", async (req, res) => {
    try {
        const { id_proveedor, fecha, total_compra, pago } = req.body;

        // Validar campos requeridos
        if (!id_proveedor) {
            return res.status(400).json({ error: "El proveedor es un campo requerido" });
        }

        const columnas = ["id_proveedor", "total_compra", "pago"];
        const valores = [id_proveedor, total_compra ?? null, pago ?? false];

        if (fecha) {
            columnas.splice(1, 0, "fecha");
            valores.splice(1, 0, new Date(fecha));
        }

        const [result] = await pool.query(
            `INSERT INTO compras (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
            valores
        );

        const [rows] = await pool.query(`${SELECT_COMPRAS} WHERE co.id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Compra creada exitosamente",
            id: result.insertId,
            compra: rows[0]
        });
    } catch (error) {
        console.error("Error al crear compra:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar una compra
router.patch("/:id", async (req, res) => {
    try {
        const columnas = ["id_proveedor", "fecha", "total_compra", "pago"];

        const campos = [];
        const params = [];

        for (const columna of columnas) {
            if (req.body[columna] !== undefined) {
                campos.push(`${columna} = ?`);
                params.push(columna === "fecha" ? new Date(req.body[columna]) : req.body[columna]);
            }
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: "No se enviaron campos para actualizar" });
        }

        params.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE compras SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Compra no encontrada" });
        }

        const [rows] = await pool.query(`${SELECT_COMPRAS} WHERE co.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar compra:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar una compra (los detalles se borran en cascada)
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM compras WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Compra no encontrada" });
        }

        res.json({ mensaje: "Compra eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar compra:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
