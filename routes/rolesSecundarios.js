import { Router } from "express";
import pool from "../db.js";

const router = Router();

// SELECT con JOINs: añade el login del usuario y el nombre del rol secundario
const SELECT_ROLES_SECUNDARIOS = `
    SELECT
        rs.usuario_id,
        rs.rol_secundario,
        u.login,
        r.tipo_rol
    FROM roles_secundarios rs
    LEFT JOIN usuarios u ON u.id = rs.usuario_id
    LEFT JOIN roles r ON r.id_rol = rs.rol_secundario
`;

// Obtener todos los roles secundarios (soporta ?usuario_id=)
router.get("/", async (req, res) => {
    try {
        const { usuario_id } = req.query;

        let query = SELECT_ROLES_SECUNDARIOS;
        const params = [];

        if (usuario_id !== undefined) {
            query += " WHERE rs.usuario_id = ?";
            params.push(usuario_id);
        }

        query += " ORDER BY rs.usuario_id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los roles secundarios:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener los roles secundarios de un usuario
router.get("/:usuario_id", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `${SELECT_ROLES_SECUNDARIOS} WHERE rs.usuario_id = ?`,
            [req.params.usuario_id]
        );
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los roles secundarios del usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Asignar un rol secundario a un usuario
router.post("/", async (req, res) => {
    try {
        const { usuario_id, rol_secundario } = req.body;

        if (!usuario_id || !rol_secundario) {
            return res.status(400).json({ error: "Usuario y rol secundario son campos requeridos" });
        }

        const [existing] = await pool.query(
            "SELECT usuario_id FROM roles_secundarios WHERE usuario_id = ? AND rol_secundario = ?",
            [usuario_id, rol_secundario]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: "El usuario ya tiene asignado ese rol secundario" });
        }

        await pool.query(
            "INSERT INTO roles_secundarios (usuario_id, rol_secundario) VALUES (?, ?)",
            [usuario_id, rol_secundario]
        );

        res.status(201).json({
            mensaje: "Rol secundario asignado exitosamente",
            rol_secundario: { usuario_id, rol_secundario }
        });
    } catch (error) {
        console.error("Error al asignar rol secundario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Quitar un rol secundario a un usuario
router.delete("/:usuario_id/:rol_secundario", async (req, res) => {
    try {
        const [result] = await pool.query(
            "DELETE FROM roles_secundarios WHERE usuario_id = ? AND rol_secundario = ?",
            [req.params.usuario_id, req.params.rol_secundario]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Asignacion no encontrada" });
        }

        res.json({ mensaje: "Rol secundario eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar rol secundario:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
