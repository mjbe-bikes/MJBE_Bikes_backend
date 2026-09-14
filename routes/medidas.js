import { Router } from "express";
import pool from "../db.js";

const router = Router();

const camposBusqueda = ["tipo_medida"];

// Obtener todas las medidas
router.get("/", async (req, res) => {
    try {
        const { search } = req.query;

        let query = "SELECT id, tipo_medida FROM medidas";
        const params = [];

        if (search) {
            query += ` WHERE ${camposBusqueda.map((campo) => `${campo} LIKE ?`).join(" OR ")}`;
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        query += " ORDER BY id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener las medidas:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener una medida por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, tipo_medida FROM medidas WHERE id = ?", [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Medida no encontrada" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener la medida:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear una nueva medida
router.post("/", async (req, res) => {
    try {
        const { tipo_medida } = req.body;

        if (!tipo_medida) {
            return res.status(400).json({ error: "El tipo de medida es un campo requerido" });
        }

        const [result] = await pool.query("INSERT INTO medidas (tipo_medida) VALUES (?)", [tipo_medida]);

        res.status(201).json({
            mensaje: "Medida creada exitosamente",
            id: result.insertId,
            medida: { id: result.insertId, tipo_medida }
        });
    } catch (error) {
        console.error("Error al crear medida:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar una medida
router.put("/:id", async (req, res) => {
    try {
        const { tipo_medida } = req.body;

        const [result] = await pool.query(
            "UPDATE medidas SET tipo_medida = ? WHERE id = ?",
            [tipo_medida, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Medida no encontrada" });
        }

        res.json({ id: Number(req.params.id), tipo_medida });
    } catch (error) {
        console.error("Error al actualizar medida:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar una medida
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM medidas WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Medida no encontrada" });
        }

        res.json({ mensaje: "Medida eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar medida:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
