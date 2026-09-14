import { Router } from "express";
import pool from "../db.js";

const router = Router();

const camposBusqueda = ["tipo_rol"];

// Obtener todos los roles
router.get("/", async (req, res) => {
    try {
        const { search } = req.query;

        let query = "SELECT id_rol, tipo_rol FROM roles";
        const params = [];

        if (search) {
            query += ` WHERE ${camposBusqueda.map((campo) => `${campo} LIKE ?`).join(" OR ")}`;
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        query += " ORDER BY id_rol ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los roles:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un rol por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id_rol, tipo_rol FROM roles WHERE id_rol = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Rol no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el rol:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo rol
router.post("/", async (req, res) => {
    try {
        const { tipo_rol } = req.body;

        if (!tipo_rol) {
            return res.status(400).json({ error: "El tipo de rol es un campo requerido" });
        }

        const [result] = await pool.query(
            "INSERT INTO roles (tipo_rol) VALUES (?)",
            [tipo_rol]
        );

        res.status(201).json({
            mensaje: "Rol creado exitosamente",
            id: result.insertId,
            rol: { id_rol: result.insertId, tipo_rol }
        });
    } catch (error) {
        console.error("Error al crear rol:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un rol
router.put("/:id", async (req, res) => {
    try {
        const { tipo_rol } = req.body;

        const [result] = await pool.query(
            "UPDATE roles SET tipo_rol = ? WHERE id_rol = ?",
            [tipo_rol, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Rol no encontrado" });
        }

        res.json({ id_rol: Number(req.params.id), tipo_rol });
    } catch (error) {
        console.error("Error al actualizar rol:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un rol
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM roles WHERE id_rol = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Rol no encontrado" });
        }

        res.json({ mensaje: "Rol eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar rol:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
