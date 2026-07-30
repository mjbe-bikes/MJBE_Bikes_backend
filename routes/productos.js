import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const offset = (page - 1) * limit;

        let query = "SELECT * FROM productos";
        let countQuery = "SELECT COUNT(*) AS total FROM productos";
        let params = [];

        if (search) {
            const searchCondition = `WHERE nombre_producto LIKE ? OR
            color_producto LIKE ? OR
            marca_producto LIKE ? OR
            modelo LIKE ?`;

            query += ` ${searchCondition}`;
            countQuery += ` ${searchCondition}`;
            
            const searchParam = `%${search}%`;
            params.push = (searchParam, searchParam, searchParam, searchParam);
        };
    
        query += 'ORDER BY id_producto ASC LIMIT ? OFFSET ?';

        const [rows] = await pool.query(query, [...params, limit, offset]);
        const [countresult] = await pool.query(countQuery, params);
        const total = countresult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            productos: rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: total,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
        });

    } catch (error) {
        console.error('error al obtener los productos:', error);
        res.status(500).json({error: error.message});
    }
});

// Crear un nuevo cliente
router.post ('/', async (req,res) => {
    try{
        const {
            img_producto,
            nombre_producto,
            descripcion,
            color_producto,
            marca_producto,
            cant_producto,
            modelo,
            id_talla,
            id_proveedor,
            id_local,
            valor_unitario,
            estado
        } = req.body;

        // Validar campos requeridos
        if(!nombre_producto || !marca_producto || !modelo ||!id_talla || !id_proveedor || !valor_unitario) {
            return res.status(400).json({
                error: 'Nombre, marca, modelo, talla, proveedor y valor unitario son campos requeridos'
            });
        }

        // Verificar si ya existe el documento
        const [existing] = await pool.query(
            'SELECT id FROM productos WHERE id = ?',
            [id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                error: 'Ya existe este producto'
            });
        }

        await pool.query(
            `INSERT INTO productos ( 
            img_producto,
            nombre_producto,
            descripcion,
            color_producto,
            marca_producto,
            cant_producto,
            modelo,
            id_talla,
            id_proveedor,
            id_local,
            valor_unitario,
            estado
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [img_producto, nombre_producto, descripcion, color_producto, marca_producto, cant_producto,
            modelo, id_talla, id_proveedor, id_local, valor_unitario, estado]
        );

        res.status(201).json({
            mensaje: 'Producto creado exitosamente',
            productos: req.body
        });
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({error: error.message});
    }
});