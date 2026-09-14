import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ?id_venta= (el más usado) y ?id_producto= como filtros exactos
const columnasFiltrables = ["id_venta", "id_producto"];

// SELECT con JOIN -> añade nombre_producto a cada línea
const SELECT_DETALLES = `
    SELECT
        d.id,
        d.id_venta,
        d.id_producto,
        d.cantidad,
        d.precio_unitario_momento,
        p.nombre_producto
    FROM detalles_venta d
    LEFT JOIN productos p ON p.id = d.id_producto
`;

// Reciben la conexión de la transacción

// Bloquea la fila del producto (FOR UPDATE), valida que haya stock suficiente
// y descuenta `unidades`. Devuelve { ok:false, status, error } si no se puede.
async function descontarStock(conn, idProducto, unidades) {
    const [productos] = await conn.query(
        "SELECT nombre_producto, cant_producto FROM productos WHERE id = ? FOR UPDATE",
        [idProducto]
    );

    if (productos.length === 0) {
        return { ok: false, status: 404, error: "El producto no existe" };
    }

    if (productos[0].cant_producto < unidades) {
        return {
            ok: false,
            status: 400,
            error: `Stock insuficiente para "${productos[0].nombre_producto}" (disponible: ${productos[0].cant_producto})`
        };
    }

    await conn.query(
        "UPDATE productos SET cant_producto = cant_producto - ? WHERE id = ?",
        [unidades, idProducto]
    );
    return { ok: true };
}

// Devuelve al inventario las unidades de un detalle (al editar o eliminar)
async function reponerStock(conn, idProducto, unidades) {
    await conn.query(
        "UPDATE productos SET cant_producto = cant_producto + ? WHERE id = ?",
        [unidades, idProducto]
    );
}

// Obtener todos los detalles de venta (soporta ?id_venta=)
router.get("/", async (req, res) => {
    try {
        const condiciones = [];
        const params = [];

        for (const [campo, valor] of Object.entries(req.query)) {
            if (columnasFiltrables.includes(campo)) {
                condiciones.push(`d.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_DETALLES;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY d.id ASC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener los detalles de venta:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un detalle de venta por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_DETALLES} WHERE d.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Detalle de venta no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el detalle de venta:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un detalle de venta -> RESTA el stock del producto
router.post("/", async (req, res) => {
    const { id_venta, id_producto, cantidad, precio_unitario_momento } = req.body;

    if (!id_venta || !id_producto || !cantidad) {
        return res.status(400).json({ error: "Venta, producto y cantidad son campos requeridos" });
    }

    const unidades = Number(cantidad);
    if (!Number.isFinite(unidades) || unidades <= 0) {
        return res.status(400).json({ error: "La cantidad debe ser un numero mayor a 0" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const stock = await descontarStock(conn, id_producto, unidades);
        if (!stock.ok) {
            await conn.rollback();
            return res.status(stock.status).json({ error: stock.error });
        }

        const [result] = await conn.query(
            `INSERT INTO detalles_venta (id_venta, id_producto, cantidad, precio_unitario_momento)
             VALUES (?, ?, ?, ?)`,
            [id_venta, id_producto, unidades, precio_unitario_momento ?? null]
        );

        await conn.commit();

        const [rows] = await conn.query(`${SELECT_DETALLES} WHERE d.id = ?`, [result.insertId]);
        res.status(201).json({
            mensaje: "Detalle de venta creado exitosamente",
            id: result.insertId,
            detalle: rows[0]
        });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al crear detalle de venta:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

// Actualizar un detalle de venta -> repone el stock anterior y descuenta el nuevo
router.put("/:id", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [previos] = await conn.query(
            "SELECT id_venta, id_producto, cantidad FROM detalles_venta WHERE id = ? FOR UPDATE",
            [req.params.id]
        );

        if (previos.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: "Detalle de venta no encontrado" });
        }

        const anterior = previos[0];
        const idVenta = req.body.id_venta ?? anterior.id_venta;
        const idProducto = req.body.id_producto ?? anterior.id_producto;
        const unidades = req.body.cantidad !== undefined ? Number(req.body.cantidad) : anterior.cantidad;
        const precio = req.body.precio_unitario_momento ?? null;

        if (!Number.isFinite(unidades) || unidades <= 0) {
            await conn.rollback();
            return res.status(400).json({ error: "La cantidad debe ser un numero mayor a 0" });
        }

        // 1. Devuelve al inventario lo que tenia el detalle
        await reponerStock(conn, anterior.id_producto, anterior.cantidad);

        // 2. Descuenta lo que lleva ahora
        const stock = await descontarStock(conn, idProducto, unidades);
        if (!stock.ok) {
            await conn.rollback();
            return res.status(stock.status).json({ error: stock.error });
        }

        await conn.query(
            `UPDATE detalles_venta SET
                id_venta = ?,
                id_producto = ?,
                cantidad = ?,
                precio_unitario_momento = ?
            WHERE id = ?`,
            [idVenta, idProducto, unidades, precio, req.params.id]
        );

        await conn.commit();

        const [rows] = await conn.query(`${SELECT_DETALLES} WHERE d.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al actualizar detalle de venta:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

// Eliminar un detalle de venta -> devuelve el stock al inventario
router.delete("/:id", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [previos] = await conn.query(
            "SELECT id_producto, cantidad FROM detalles_venta WHERE id = ? FOR UPDATE",
            [req.params.id]
        );

        if (previos.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: "Detalle de venta no encontrado" });
        }

        await conn.query("DELETE FROM detalles_venta WHERE id = ?", [req.params.id]);
        await reponerStock(conn, previos[0].id_producto, previos[0].cantidad);

        await conn.commit();
        res.json({ mensaje: "Detalle de venta eliminado exitosamente" });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al eliminar detalle de venta:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

export default router;
