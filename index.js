import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool from './db.js';

// rutas
import productosRouter from './routes/productos.js';
import rolesRouter from './routes/roles.js';
import tiposDocumentosRouter from './routes/tiposDocumentos.js';
import localesRouter from './routes/locales.js';
import medidasRouter from './routes/medidas.js';
import tallasRouter from './routes/tallas.js';
import usuariosRouter from './routes/usuarios.js';
import rolesSecundariosRouter from './routes/rolesSecundarios.js';
import clientesRouter from './routes/clientes.js';
import proveedoresRouter from './routes/proveedores.js';
import ventasRouter from './routes/ventas.js';
import detallesVentaRouter from './routes/detallesVenta.js';
import comprasRouter from './routes/compras.js';
import detallesCompraRouter from './routes/detallesCompra.js';
import sessionsRouter from './routes/sessions.js';
import reportesRouter from './routes/reportes.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Bienvenido');
});

// Verificar conexion a la base de datos
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.use('/api/productos', productosRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/tipos_documentos', tiposDocumentosRouter);
app.use('/api/locales', localesRouter);
app.use('/api/medidas', medidasRouter);
app.use('/api/tallas', tallasRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/roles_secundarios', rolesSecundariosRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/detalles_venta', detallesVentaRouter);
app.use('/api/compras', comprasRouter);
app.use('/api/detalles_compra', detallesCompraRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/reportes', reportesRouter);

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
