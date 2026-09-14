import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ?search= busca en la columna `talla`; ?medida_id= filtra por medida
const camposBusqueda = ["talla"];
const columnasFiltrables = ["medida_id"];

// SELECT con JOIN para traer también el nombre de la medida (alias t / m)
const SELECT_TALLAS = `
    SELECT
        t.id,
        t.medida_id,
        t.talla,
        m.tipo_medida
    FROM tallas t
    LEFT JOIN medidas m ON m.id = t.medida_id
`;

// Obtener todas las tallas
router.get("/", async (req, res) => {
    try {
        const { search, ...filtros } = req.query;

        const condiciones = [];
        const params = [];

        if (search) {
            condiciones.push(`(${camposBusqueda.map((campo) => `t.${campo} LIKE ?`).join(" OR ")})`);
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        for (const [campo, valor] of Object.entries(filtros)) {
            if (columnasFiltrables.includes(campo)) {
                condiciones.push(`t.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_TALLAS;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY t.id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener las tallas:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener una talla por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_TALLAS} WHERE t.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Talla no encontrada" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener la talla:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear una nueva talla
router.post("/", async (req, res) => {
    try {
        const { medida_id, talla } = req.body;

        if (!medida_id || !talla) {
            return res.status(400).json({ error: "Medida y talla son campos requeridos" });
        }

        const [result] = await pool.query(
            "INSERT INTO tallas (medida_id, talla) VALUES (?, ?)",
            [medida_id, talla]
        );

        const [rows] = await pool.query(`${SELECT_TALLAS} WHERE t.id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Talla creada exitosamente",
            id: result.insertId,
            talla: rows[0]
        });
    } catch (error) {
        console.error("Error al crear talla:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar una talla
router.put("/:id", async (req, res) => {
    try {
        const { medida_id, talla } = req.body;

        const [result] = await pool.query(
            "UPDATE tallas SET medida_id = ?, talla = ? WHERE id = ?",
            [medida_id, talla, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Talla no encontrada" });
        }

        const [rows] = await pool.query(`${SELECT_TALLAS} WHERE t.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar talla:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar una talla
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM tallas WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Talla no encontrada" });
        }

        res.json({ mensaje: "Talla eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar talla:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
