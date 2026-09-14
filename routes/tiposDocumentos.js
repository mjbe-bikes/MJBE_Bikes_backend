import { Router } from "express";
import pool from "../db.js";

const router = Router();

const camposBusqueda = ["sigla", "nombre_documento"];

// Obtener todos los tipos de documento
router.get("/", async (req, res) => {
    try {
        const { search } = req.query;

        let query = "SELECT id, sigla, nombre_documento FROM tipos_documentos";
        const params = [];

        if (search) {
            query += ` WHERE ${camposBusqueda.map((campo) => `${campo} LIKE ?`).join(" OR ")}`;
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        query += " ORDER BY id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los tipos de documento:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un tipo de documento por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, sigla, nombre_documento FROM tipos_documentos WHERE id = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Tipo de documento no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el tipo de documento:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo tipo de documento
router.post("/", async (req, res) => {
    try {
        const { sigla, nombre_documento } = req.body;

        if (!sigla || !nombre_documento) {
            return res.status(400).json({ error: "Sigla y nombre del documento son campos requeridos" });
        }

        const [result] = await pool.query(
            "INSERT INTO tipos_documentos (sigla, nombre_documento) VALUES (?, ?)",
            [sigla, nombre_documento]
        );

        res.status(201).json({
            mensaje: "Tipo de documento creado exitosamente",
            id: result.insertId,
            tipo_documento: { id: result.insertId, sigla, nombre_documento }
        });
    } catch (error) {
        console.error("Error al crear tipo de documento:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un tipo de documento
router.put("/:id", async (req, res) => {
    try {
        const { sigla, nombre_documento } = req.body;

        const [result] = await pool.query(
            "UPDATE tipos_documentos SET sigla = ?, nombre_documento = ? WHERE id = ?",
            [sigla, nombre_documento, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Tipo de documento no encontrado" });
        }

        res.json({ id: Number(req.params.id), sigla, nombre_documento });
    } catch (error) {
        console.error("Error al actualizar tipo de documento:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un tipo de documento
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM tipos_documentos WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Tipo de documento no encontrado" });
        }

        res.json({ mensaje: "Tipo de documento eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar tipo de documento:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
