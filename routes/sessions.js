import { Router } from "express";   // no se importa pool: no hay BD aquí

const router = Router();

// "Base de datos" en memoria: se vacía al reiniciar el proceso de Node
const sesiones = [];

// GET /api/sessions -> devuelve el historial acumulado en esta ejecución
router.get("/", (req, res) => {
    res.json(sesiones);
});

// POST /api/sessions -> añade un registro con lo que mande el front + fecha
router.post("/", (req, res) => {
    const sesion = {
        id: sesiones.length + 1,           // id incremental simple
        creado_en: new Date().toISOString(),
        ...req.body                        // user_id, login, email, rol_id, ... (lo que envíe Login.jsx)
    };

    sesiones.push(sesion);
    res.status(201).json(sesion);
});

export default router;
