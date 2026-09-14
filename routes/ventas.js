// ============================================================================
//  routes/ventas.js  —  CRUD de la CABECERA de una venta (tabla `ventas`)
// ----------------------------------------------------------------------------
//  Montado como  /api/ventas  (index.js).
//
//  Una `venta` guarda: quién vendió (id_vendedor -> usuarios), a quién
//  (id_cliente -> clientes), fecha, total y `pago` (bool: pagada o pendiente).
//  Los productos de la venta NO están aquí, están en `detalles_venta`
//  (ver routes/detallesVenta.js), que es quien mueve el stock.
//
//  Quién lo usa en el front:
//    - CrearVenta.jsx (vendedor)  -> POST, luego crea los detalles
//    - CompraCliente.jsx (cliente)-> POST con pago:false, luego PATCH pago:true al final
//    - VerVenta.jsx / VentasAdmin.jsx / InicioVentas.jsx / DetallesVenta.jsx -> GET
//    - MisCompras.jsx -> GET ?comprador=<userId>
//
//  El SELECT hace JOIN para devolver también el nombre del vendedor (u.login)
//  y del cliente, así el front no tiene que cruzar datos.
// ============================================================================

import { Router } from "express";
import pool from "../db.js";

const router = Router();

// Columnas admitidas como filtro exacto: ?id_vendedor= ?id_cliente= ?pago=
const columnasFiltrables = ["id_vendedor", "id_cliente", "pago"];

// SELECT con JOINs -> añade `vendedor` (login) y `cliente` (nombre completo)
const SELECT_VENTAS = `
    SELECT
        v.id,
        v.id_vendedor,
        v.id_cliente,
        v.fecha,
        v.total,
        v.pago,
        u.login AS vendedor,
        CONCAT(c.nombres, ' ', c.apellidos) AS cliente
    FROM ventas v
    LEFT JOIN usuarios u ON u.id = v.id_vendedor
    LEFT JOIN clientes c ON c.id = v.id_cliente
`;

// Obtener todas las ventas
// Filtros: ?id_vendedor=  ?id_cliente=  ?pago=
//          ?comprador=<usuario_id>  -> ventas de los clientes de ese usuario (para "Mis compras")
router.get("/", async (req, res) => {
    try {
        const filtros = { ...req.query };

        // user_id es un alias que usa el frontend para el vendedor
        if (filtros.user_id !== undefined && filtros.id_vendedor === undefined) {
            filtros.id_vendedor = filtros.user_id;
        }
        delete filtros.user_id;

        const condiciones = [];
        const params = [];

        // "comprador" = usuario que compra: se resuelve contra la tabla clientes
        if (filtros.comprador !== undefined) {
            condiciones.push("v.id_cliente IN (SELECT id FROM clientes WHERE usuario_id = ?)");
            params.push(filtros.comprador);
        }
        delete filtros.comprador;

        for (const [campo, valor] of Object.entries(filtros)) {
            if (columnasFiltrables.includes(campo)) {
                condiciones.push(`v.${campo} = ?`);
                params.push(valor);
            }
        }

        let query = SELECT_VENTAS;
        if (condiciones.length > 0) {
            query += ` WHERE ${condiciones.join(" AND ")}`;
        }
        query += " ORDER BY v.fecha DESC, v.id DESC";

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener las ventas:", error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener una venta por id
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await pool.query(`${SELECT_VENTAS} WHERE v.id = ?`, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Venta no encontrada" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error al obtener la venta:", error);
        res.status(500).json({ error: error.message });
    }
});

// Crear una nueva venta
router.post("/", async (req, res) => {
    try {
        const { id_vendedor, id_cliente, fecha, total, pago } = req.body;

        // Validar campos requeridos
        if (!id_vendedor || !id_cliente) {
            return res.status(400).json({ error: "Vendedor y cliente son campos requeridos" });
        }

        // Se arma el INSERT dinámicamente: `fecha` solo se incluye si el front
        // la envía; si no, MySQL pone la fecha/hora actual por defecto.
        const columnas = ["id_vendedor", "id_cliente", "total", "pago"];
        const valores = [id_vendedor, id_cliente, total ?? null, pago ?? false];

        if (fecha) {
            columnas.splice(2, 0, "fecha");            // inserta "fecha" en la posición 2
            valores.splice(2, 0, new Date(fecha));
        }

        const [result] = await pool.query(
            `INSERT INTO ventas (${columnas.join(", ")}) VALUES (${columnas.map(() => "?").join(", ")})`,
            valores
        );

        const [rows] = await pool.query(`${SELECT_VENTAS} WHERE v.id = ?`, [result.insertId]);

        // Se responde el objeto tanto anidado (venta) como "aplanado" (...rows[0])
        // para que sirva tanto  data.id  como  data.venta.id  en el front.
        res.status(201).json({
            mensaje: "Venta creada exitosamente",
            id: result.insertId,
            venta: rows[0],
            ...rows[0]
        });
    } catch (error) {
        console.error("Error al crear venta:", error);
        res.status(500).json({ error: error.message });
    }
});

// Actualizar parcialmente una venta. Uso típico: CompraCliente.jsx hace
// PATCH { pago: true } al terminar el checkout para marcarla como pagada.
router.patch("/:id", async (req, res) => {
    try {
        const columnas = ["id_vendedor", "id_cliente", "fecha", "total", "pago"];

        const campos = [];
        const params = [];

        for (const columna of columnas) {
            if (req.body[columna] !== undefined) {
                campos.push(`${columna} = ?`);
                params.push(columna === "fecha" ? new Date(req.body[columna]) : req.body[columna]);
            }
        }

        if (campos.length === 0) {
            return res.status(400).json({ error: "No se enviaron campos para actualizar" });
        }

        params.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE ventas SET ${campos.join(", ")} WHERE id = ?`,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Venta no encontrada" });
        }

        const [rows] = await pool.query(`${SELECT_VENTAS} WHERE v.id = ?`, [req.params.id]);
        res.json(rows[0]);
    } catch (error) {
        console.error("Error al actualizar venta:", error);
        res.status(500).json({ error: error.message });
    }
});

// Eliminar una venta. La FK detalles_venta.id_venta tiene ON DELETE CASCADE,
// así que MySQL borra sus detalles automáticamente.
// (Ojo: esto NO devuelve el stock; para eso hay que borrar los detalles uno a
//  uno con DELETE /api/detalles_venta/:id, que sí repone el inventario.)
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM ventas WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Venta no encontrada" });
        }

        res.json({ mensaje: "Venta eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar venta:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
