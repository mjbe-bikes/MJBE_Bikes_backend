import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ?search= (LIKE) y filtros exactos admitidos (?email=, ?login=, ?estado=, ?rol_id=)
const camposBusqueda = ["u.login", "u.email", "u.estado"];
const columnasFiltrables = ["login", "email", "estado", "rol_id"];

// SELECT con JOIN a roles -> añade tipo_rol (nombre legible del rol)
const SELECT_USUARIOS = `
    SELECT
        u.id,
        u.login,
        u.email,
        u.password_harsh,
        u.image_url,
        u.token_activacion,
        u.reset_key,
        u.reset_base,
        u.rol_id,
        r.tipo_rol,
        u.estado
    FROM usuarios u
    LEFT JOIN roles r ON r.id_rol = u.rol_id
`;

// Obtener todos los usuarios (soporta ?email=, ?login=, ?estado=, ?search=)
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
                condiciones.push(`u.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_USUARIOS;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY u.id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los usuarios:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un usuario por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo usuario
router.post("/", async (req, res) => {
    try {
        const {
            login,
            email,
            password_harsh,
            image_url,
            token_activacion,
            reset_key,
            reset_base,
            rol_id,
            estado
        } = req.body;

        // Validar campos requeridos
        if (!login || !email || !password_harsh || !rol_id) {
            return res.status(400).json({
                error: "Login, email, contrasena y rol son campos requeridos"
            });
        }

        // No permitir login o email duplicados (la tabla también tiene UNIQUE,
        // pero así devolvemos un mensaje claro en vez de un error 500 de MySQL)
        const [existing] = await pool.query(
            "SELECT id FROM usuarios WHERE login = ? OR email = ?",
            [login, email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ mensaje: "El usuario o el correo ya estan registrados" });
        }

        const [result] = await pool.query(
            `INSERT INTO usuarios (
                login,
                email,
                password_harsh,
                image_url,
                token_activacion,
                reset_key,
                reset_base,
                rol_id,
                estado
            ) VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                login,
                email,
                password_harsh,
                image_url ?? null,
                token_activacion ?? "",
                reset_key ?? "",
                reset_base ?? "",
                rol_id,
                estado ?? "activo"
            ]
        );

        const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [result.insertId]);

        res.status(201).json({
            mensaje: "Usuario creado exitosamente",
            id: result.insertId,
            usuario: rows[0]
        });
    } catch (error) {
        console.error("Error al crear usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un usuario. Solo toca las columnas que llegan en el body, así el
// front puede mandar login/email/rol_id/estado y OMITIR password_harsh cuando
// no se quiere cambiar la contraseña (ActualizarEmpleados.jsx hace justo eso).
router.put("/:id", async (req, res) => {
    try {
        const [existing] = await pool.query("SELECT id FROM usuarios WHERE id = ?", [req.params.id]);

        if (existing.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const columnas = [
            "login",
            "email",
            "password_harsh",
            "image_url",
            "token_activacion",
            "reset_key",
            "reset_base",
            "rol_id",
            "estado"
        ];

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
        await pool.query(`UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`, params);

        const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar parcialmente un usuario
router.patch("/:id", async (req, res) => {
    try {
        const columnas = [
            "login",
            "email",
            "password_harsh",
            "image_url",
            "token_activacion",
            "reset_key",
            "reset_base",
            "rol_id",
            "estado"
        ];

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
        const [result] = await pool.query(`UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        const [rows] = await pool.query(`${SELECT_USUARIOS} WHERE u.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un usuario
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM usuarios WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json({ mensaje: "Usuario eliminado exitosamente" });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
