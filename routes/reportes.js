import { Router } from "express";
import pool from "../db.js";

const router = Router();

// GET /api/reportes/dashboard
router.get("/dashboard", async (req, res) => {
    try {
        // Cada consulta devuelve UNA fila con UNA columna nombrada (alias).
        // pool.query -> [filas, meta];  filas[0] -> primera fila;
        // por eso el patrón  const [[{ alias }]] = await pool.query(...)
        // "desestructura" directamente el valor.
        const [[{ totalProductos }]] = await pool.query(
            "SELECT COUNT(*) AS totalProductos FROM productos"
        );
        const [[{ totalClientes }]] = await pool.query(
            "SELECT COUNT(*) AS totalClientes FROM clientes"
        );
        const [[{ totalVentas }]] = await pool.query(
            "SELECT COUNT(*) AS totalVentas FROM ventas"
        );
        // Ventas de hoy: fecha (sin hora) = fecha actual
        const [[{ ventasHoy }]] = await pool.query(
            "SELECT COUNT(*) AS ventasHoy FROM ventas WHERE DATE(fecha) = CURDATE()"
        );
        // Ventas de este mes
        const [[{ ventasMes }]] = await pool.query(
            `SELECT COUNT(*) AS ventasMes FROM ventas
             WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())`
        );
        // Productos con poco stock (5 o menos)
        const [[{ stockBajo }]] = await pool.query(
            "SELECT COUNT(*) AS stockBajo FROM productos WHERE cant_producto <= 5"
        );
        // Ingresos del mes (COALESCE -> si SUM es NULL, devuelve 0)
        const [[{ ingresosMes }]] = await pool.query(
            `SELECT COALESCE(SUM(total), 0) AS ingresosMes FROM ventas
             WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())`
        );

        // Las 5 ventas más recientes, con el nombre del cliente (JOIN)
        const [ultimasVentas] = await pool.query(
            `SELECT v.id, v.fecha, v.total,
                    CONCAT(c.nombres, ' ', c.apellidos) AS cliente
             FROM ventas v
             LEFT JOIN clientes c ON c.id = v.id_cliente
             ORDER BY v.fecha DESC, v.id DESC
             LIMIT 5`
        );

        // Respuesta con la forma exacta que espera InicioAdmin.jsx
        res.json({
            resumen: {
                totalProductos,
                totalClientes,
                totalVentas,
                ventasHoy,
                ventasMes,
                stockBajo,
                ingresosMes
            },
            // "reportes" = las últimas ventas transformadas a {titulo, descripcion, fecha}
            reportes: ultimasVentas.map((venta) => ({
                id: venta.id,
                titulo: `Venta #${venta.id}`,
                descripcion: `Cliente: ${venta.cliente || "N/D"} - Total: $${Number(venta.total || 0).toLocaleString("es-CO")}`,
                fecha: venta.fecha
            })),
            novedades: []   // el front lo espera como array; aquí no hay novedades
        });
    } catch (error) {
        console.error("Error al obtener el dashboard:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
