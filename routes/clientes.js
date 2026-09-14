import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Columnas para ?search= (alias c = clientes)
const camposBusqueda = ["c.nombres", "c.apellidos", "c.numero_documento"];

// SELECT con JOIN. `id AS id_cliente` -> el front usa ese nombre.
const SELECT_CLIENTES = `
    SELECT
        c.id,
        c.id AS id_cliente,
        c.usuario_id,
        c.tipo_documento_id,
        td.sigla AS tipo_documento,
        c.numero_documento,
        c.nombres,
        c.apellidos,
        c.direccion,
        c.telefono_clnt
    FROM clientes c
    LEFT JOIN tipos_documentos td ON td.id = c.tipo_documento_id
`;

// Obtener todos los clientes (soporta ?id_cliente=, ?usuario_id=, ?search=)
router.get("/", async (req, res) => {
    try {
        const { search, id_cliente, usuario_id } = req.query;

        const condiciones = [];
        const params = [];

        if (search) {
            condiciones.push(`(${camposBusqueda.map((campo) => `${campo} LIKE ?`).join(" OR ")})`);
            camposBusqueda.forEach(() => params.push(`%${search}%`));
        }

        if (id_cliente !== undefined) {
            condiciones.push("c.id = ?");
            params.push(id_cliente);
        }

        if (usuario_id !== undefined) {
            condiciones.push("c.usuario_id = ?");
            params.push(usuario_id);
        }

        let query = SELECT_CLIENTES;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY c.id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los clientes:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un cliente por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_CLIENTES} WHERE c.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el cliente:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo cliente
router.post("/", async (req, res) => {
    try {
        const {
            usuario_id,
            tipo_documento_id,
            numero_documento,
            nombres,
            apellidos,
            direccion,
            telefono_clnt
        } = req.body;

        // Validar campos requeridos
        if (!tipo_documento_id || !numero_documento || !nombres || !apellidos || !direccion || !telefono_clnt) {
            return res.status(400).json({
                error: "Tipo de documento, numero, nombres, apellidos, direccion y telefono son campos requeridos"
            });
        }

        // Verificar que el documento no este repetido
        const [existing] = await pool.query(
            "SELECT id FROM clientes WHERE tipo_documento_id = ? AND numero_documento = ?",
            [tipo_documento_id, numero_documento]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: "Ya existe un cliente con ese documento" });
        }

        const [result] = await pool.query(
            `INSERT INTO clientes (
                usuario_id,
                tipo_documento_id,
                numero_documento,
                nombres,
                apellidos,
                direccion,
                telefono_clnt
            ) VALUES (?,?,?,?,?,?,?)`,
            [usuario_id ?? null, tipo_documento_id, numero_documento, nombres, apellidos, direccion, telefono_clnt]
        );

        const [rows] = await pool.query(`${SELECT_CLIENTES} WHERE c.id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Cliente creado exitosamente",
            id: result.insertId,
            id_cliente: result.insertId,
            cliente: rows[0]
        });
    } catch (error) {
        console.error("Error al crear cliente:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un cliente
router.put("/:id", async (req, res) => {
    try {
        const [existing] = await pool.query("SELECT id FROM clientes WHERE id = ?", [req.params.id]);

        if (existing.length === 0) {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }

        const {
            usuario_id,
            tipo_documento_id,
            numero_documento,
            nombres,
            apellidos,
            direccion,
            telefono_clnt
        } = req.body;

        // COALESCE(?, usuario_id): si el front NO manda usuario_id (llega null),
        // se conserva el que ya tenía la fila en vez de borrarlo.
        await pool.query(
            `UPDATE clientes SET
                usuario_id = COALESCE(?, usuario_id),
                tipo_documento_id = ?,
                numero_documento = ?,
                nombres = ?,
                apellidos = ?,
                direccion = ?,
                telefono_clnt = ?
            WHERE id = ?`,
            [
                usuario_id ?? null,
                tipo_documento_id,
                numero_documento,
                nombres,
                apellidos,
                direccion,
                telefono_clnt,
                req.params.id
            ]
        );

        const [rows] = await pool.query(`${SELECT_CLIENTES} WHERE c.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un cliente
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM clientes WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }

        res.json({ mensaje: "Cliente eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar cliente:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
