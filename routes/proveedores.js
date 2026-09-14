import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ?search= (LIKE) y filtros exactos admitidos (?estado=, ?tipo_documento_id=)
const camposBusqueda = ["p.nombre_proveedor", "p.numero_identidad", "p.telefono_prv", "p.estado"];
const columnasFiltrables = ["estado", "tipo_documento_id"];

// SELECT con JOIN. telefono_prv se expone también como "telefono" para el front.
const SELECT_PROVEEDORES = `
    SELECT
        p.id,
        p.nombre_proveedor,
        p.tipo_documento_id,
        td.sigla AS tipo_documento,
        p.numero_identidad,
        p.direccion,
        p.telefono_prv,
        p.telefono_prv AS telefono,
        p.estado
    FROM proveedores p
    LEFT JOIN tipos_documentos td ON td.id = p.tipo_documento_id
`;

// Obtener todos los proveedores
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
                condiciones.push(`p.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_PROVEEDORES;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY p.id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los proveedores:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un proveedor por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_PROVEEDORES} WHERE p.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Proveedor no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el proveedor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo proveedor
router.post("/", async (req, res) => {
    try {
        const {
            nombre_proveedor,
            tipo_documento_id,
            numero_identidad,
            direccion,
            telefono,
            telefono_prv,
            estado
        } = req.body;

        const telefonoProveedor = telefono_prv ?? telefono;

        // Validar campos requeridos
        if (!nombre_proveedor || !tipo_documento_id || !numero_identidad || !direccion || !telefonoProveedor) {
            return res.status(400).json({
                mensaje: "Nombre, tipo de documento, identidad, direccion y telefono son campos requeridos"
            });
        }

        // Verificar que la identidad no este repetida
        const [existing] = await pool.query(
            "SELECT id FROM proveedores WHERE tipo_documento_id = ? AND numero_identidad = ?",
            [tipo_documento_id, numero_identidad]
        );

        if (existing.length > 0) {
            return res.status(400).json({ mensaje: "Ya existe un proveedor con esa identidad" });
        }

        const [result] = await pool.query(
            `INSERT INTO proveedores (
                nombre_proveedor,
                tipo_documento_id,
                numero_identidad,
                direccion,
                telefono_prv,
                estado
            ) VALUES (?,?,?,?,?,?)`,
            [nombre_proveedor, tipo_documento_id, numero_identidad, direccion, telefonoProveedor, estado ?? "activo"]
        );

        const [rows] = await pool.query(`${SELECT_PROVEEDORES} WHERE p.id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Proveedor creado exitosamente",
            id: result.insertId,
            proveedor: rows[0]
        });
    } catch (error) {
        console.error("Error al crear proveedor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un proveedor
router.put("/:id", async (req, res) => {
    try {
        const [existing] = await pool.query("SELECT id FROM proveedores WHERE id = ?", [req.params.id]);

        if (existing.length === 0) {
            return res.status(404).json({ error: "Proveedor no encontrado" });
        }

        const {
            nombre_proveedor,
            tipo_documento_id,
            numero_identidad,
            direccion,
            telefono,
            telefono_prv,
            estado
        } = req.body;

        await pool.query(
            `UPDATE proveedores SET
                nombre_proveedor = ?,
                tipo_documento_id = ?,
                numero_identidad = ?,
                direccion = ?,
                telefono_prv = ?,
                estado = ?
            WHERE id = ?`,
            [
                nombre_proveedor,
                tipo_documento_id,
                numero_identidad,
                direccion,
                telefono_prv ?? telefono,
                estado,
                req.params.id
            ]
        );

        const [rows] = await pool.query(`${SELECT_PROVEEDORES} WHERE p.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar proveedor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar parcialmente un proveedor (por ejemplo solo el estado).
// mapaColumnas traduce la CLAVE que manda el front -> COLUMNA real de la tabla.
// Así "telefono" (front) escribe en la columna "telefono_prv".
router.patch("/:id", async (req, res) => {
    try {
        const mapaColumnas = {
            nombre_proveedor: "nombre_proveedor",
            tipo_documento_id: "tipo_documento_id",
            numero_identidad: "numero_identidad",
            direccion: "direccion",
            telefono: "telefono_prv",
            telefono_prv: "telefono_prv",
            estado: "estado"
        };

        const campos = [];
        const params = [];

        for (const [clave, columna] of Object.entries(mapaColumnas)) {
            if (req.body[clave] !== undefined) {
                campos.push(`${columna} = ?`);
                params.push(req.body[clave]);
            }
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: "No se enviaron campos para actualizar" });
        }

        params.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE proveedores SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Proveedor no encontrado" });
        }

        const [rows] = await pool.query(`${SELECT_PROVEEDORES} WHERE p.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar proveedor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un proveedor
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM proveedores WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Proveedor no encontrado" });
        }

        res.json({ mensaje: "Proveedor eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar proveedor:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
