import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Filtros exactos: ?id_compra= (el más usado)  ?id_producto=
const columnasFiltrables = ["id_compra", "id_producto"];

// SELECT con JOIN -> añade nombre_producto
const SELECT_DETALLES = `
    SELECT
        d.id,
        d.id_compra,
        d.id_producto,
        d.cantidad,
        d.precio_unitario_momento,
        p.nombre_producto
    FROM detalles_compra d
    LEFT JOIN productos p ON p.id = d.id_producto
`;

// Dentro de la transacción 

// Bloquea el producto y SUMA `unidades` (re-stock)
async function sumarStock(conn, idProducto, unidades) {
    const [productos] = await conn.query(
        "SELECT id FROM productos WHERE id = ? FOR UPDATE",
        [idProducto]
    );

    if (productos.length === 0) {
        return { ok: false, status: 404, error: "El producto no existe" };
    }

    await conn.query(
        "UPDATE productos SET cant_producto = cant_producto + ? WHERE id = ?",
        [unidades, idProducto]
    );
    return { ok: true };
}

// Revierte un re-stock (al editar o eliminar el detalle). No baja de 0.
async function restarStock(conn, idProducto, unidades) {
    await conn.query(
        "UPDATE productos SET cant_producto = GREATEST(cant_producto - ?, 0) WHERE id = ?",
        [unidades, idProducto]
    );
}

// Obtener todos los detalles de compra (soporta ?id_compra=)
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
        console.error("Error al obtener los detalles de compra:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener un detalle de compra por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_DETALLES} WHERE d.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Detalle de compra no encontrado" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener el detalle de compra:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear un detalle de compra -> SUMA el stock del producto
router.post("/", async (req, res) => {
    const { id_compra, id_producto, cantidad, precio_unitario_momento } = req.body;

    if (!id_compra || !id_producto || !cantidad) {
        return res.status(400).json({ error: "Compra, producto y cantidad son campos requeridos" });
    }

    const unidades = Number(cantidad);
    if (!Number.isFinite(unidades) || unidades <= 0) {
        return res.status(400).json({ error: "La cantidad debe ser un numero mayor a 0" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const stock = await sumarStock(conn, id_producto, unidades);
        if (!stock.ok) {
            await conn.rollback();
            return res.status(stock.status).json({ error: stock.error });
        }

        const [result] = await conn.query(
            `INSERT INTO detalles_compra (id_compra, id_producto, cantidad, precio_unitario_momento)
             VALUES (?, ?, ?, ?)`,
            [id_compra, id_producto, unidades, precio_unitario_momento ?? null]
        );

        await conn.commit();

        const [rows] = await conn.query(`${SELECT_DETALLES} WHERE d.id = ?`, [result.insertId]);
        res.status(201).json({
            mensaje: "Detalle de compra creado exitosamente",
            id: result.insertId,
            detalle: rows[0]
        });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al crear detalle de compra:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

// Actualizar un detalle de compra -> revierte el re-stock anterior y aplica el nuevo
router.put("/:id", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [previos] = await conn.query(
            "SELECT id_compra, id_producto, cantidad FROM detalles_compra WHERE id = ? FOR UPDATE",
            [req.params.id]
        );

        if (previos.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: "Detalle de compra no encontrado" });
        }

        const anterior = previos[0];
        const idCompra = req.body.id_compra ?? anterior.id_compra;
        const idProducto = req.body.id_producto ?? anterior.id_producto;
        const unidades = req.body.cantidad !== undefined ? Number(req.body.cantidad) : anterior.cantidad;
        const precio = req.body.precio_unitario_momento ?? null;

        if (!Number.isFinite(unidades) || unidades <= 0) {
            await conn.rollback();
            return res.status(400).json({ error: "La cantidad debe ser un numero mayor a 0" });
        }

        // 1. Quita del inventario lo que habia sumado este detalle
        await restarStock(conn, anterior.id_producto, anterior.cantidad);

        // 2. Suma lo que lleva ahora
        const stock = await sumarStock(conn, idProducto, unidades);
        if (!stock.ok) {
            await conn.rollback();
            return res.status(stock.status).json({ error: stock.error });
        }

        await conn.query(
            `UPDATE detalles_compra SET
                id_compra = ?,
                id_producto = ?,
                cantidad = ?,
                precio_unitario_momento = ?
            WHERE id = ?`,
            [idCompra, idProducto, unidades, precio, req.params.id]
        );

        await conn.commit();

        const [rows] = await conn.query(`${SELECT_DETALLES} WHERE d.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al actualizar detalle de compra:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

// Eliminar un detalle de compra -> quita del inventario lo que habia sumado
router.delete("/:id", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [previos] = await conn.query(
            "SELECT id_producto, cantidad FROM detalles_compra WHERE id = ? FOR UPDATE",
            [req.params.id]
        );

        if (previos.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: "Detalle de compra no encontrado" });
        }

        await conn.query("DELETE FROM detalles_compra WHERE id = ?", [req.params.id]);
        await restarStock(conn, previos[0].id_producto, previos[0].cantidad);

        await conn.commit();
        res.json({ mensaje: "Detalle de compra eliminado exitosamente" });
    } catch (error) {
        await conn.rollback().catch(() => {});
        console.error("Error al eliminar detalle de compra:", error);
        res.status(500).json({ error: error.message });
    } finally {
        conn.release();
    }
});

export default router;
