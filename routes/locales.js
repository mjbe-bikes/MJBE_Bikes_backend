import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Columnas para ?search=  y  columnas admitidas como filtro exacto (?estado=)
const camposBusqueda = ["nombre_local", "direccion_local", "correo", "telefono", "estado"];
const columnasFiltrables = ["estado"];

// Obtener todos los locales
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

        let query = "SELECT id, nombre_local, direccion_local, correo, telefono, estado FROM locales";
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los locales:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un local por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, nombre_local, direccion_local, correo, telefono, estado FROM locales WHERE id = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Local no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el local:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo local
router.post("/", async (req, res) => {
    try {
        const { nombre_local, direccion_local, correo, telefono, estado } = req.body;

        if (!nombre_local || !direccion_local || !correo || !telefono) {
            return res.status(400).json({
                error: "Nombre, direccion, correo y telefono son campos requeridos"
            });
        }

        const [result] = await pool.query(
            `INSERT INTO locales (nombre_local, direccion_local, correo, telefono, estado)
             VALUES (?, ?, ?, ?, ?)`,
            [nombre_local, direccion_local, correo, telefono, estado ?? "activo"]
        );

        res.status(201).json({
            mensaje: "Local creado exitosamente",
            id: result.insertId,
            local: { id: result.insertId, nombre_local, direccion_local, correo, telefono, estado: estado ?? "activo" }
        });
    } catch (error) {
        console.error("Error al crear local:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un local
router.put("/:id", async (req, res) => {
    try {
        const { nombre_local, direccion_local, correo, telefono, estado } = req.body;

        const [result] = await pool.query(
            `UPDATE locales SET
                nombre_local = ?,
                direccion_local = ?,
                correo = ?,
                telefono = ?,
                estado = ?
            WHERE id = ?`,
            [nombre_local, direccion_local, correo, telefono, estado, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Local no encontrado" });
        }

        const [rows] = await pool.query(
            "SELECT id, nombre_local, direccion_local, correo, telefono, estado FROM locales WHERE id = ?",
            [req.params.id]
        );
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar local:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar parcialmente un local
router.patch("/:id", async (req, res) => {
    try {
        const columnas = ["nombre_local", "direccion_local", "correo", "telefono", "estado"];

        const campos = [];
        const params = [];

        for (const columna of columnas) {
            if (req.body[columna] !== undefined) {
                campos.push(`${columna} = ?`);
                params.push(req.body[columna]);
            }
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: "No se enviaron campos para actualizar" });
        }

        params.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE locales SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Local no encontrado" });
        }

        const [rows] = await pool.query(
            "SELECT id, nombre_local, direccion_local, correo, telefono, estado FROM locales WHERE id = ?",
            [req.params.id]
        );
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar local:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un local
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM locales WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Local no encontrado" });
        }

        res.json({ mensaje: "Local eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar local:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
