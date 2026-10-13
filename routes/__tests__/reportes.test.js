// backend/routes/__tests__/reportes.test.js
import request from 'supertest';
import express from 'express';
import router from '../reportes.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/reportes', router);

describe('Pruebas de Caja Blanca - Reportes', () => {

  test('GET /dashboard debe retornar resumen, reportes y novedades', async () => {
    // Configuramos el mock: 7 conteos (una fila cada uno) + últimas ventas
    pool.query
      .mockResolvedValueOnce([[{ totalProductos: 50 }]])
      .mockResolvedValueOnce([[{ totalClientes: 20 }]])
      .mockResolvedValueOnce([[{ totalVentas: 100 }]])
      .mockResolvedValueOnce([[{ ventasHoy: 3 }]])
      .mockResolvedValueOnce([[{ ventasMes: 30 }]])
      .mockResolvedValueOnce([[{ stockBajo: 4 }]])
      .mockResolvedValueOnce([[{ ingresosMes: 500000 }]])
      .mockResolvedValueOnce([[{ id: 7, fecha: '2026-10-01', total: 150000, cliente: 'Ana Gomez' }]]);

    const res = await request(app).get('/reportes/dashboard');

    expect(res.statusCode).toBe(200);
    expect(res.body.resumen).toEqual({
      totalProductos: 50,
      totalClientes: 20,
      totalVentas: 100,
      ventasHoy: 3,
      ventasMes: 30,
      stockBajo: 4,
      ingresosMes: 500000
    });
    expect(res.body.reportes).toHaveLength(1);
    expect(res.body.reportes[0].titulo).toBe('Venta #7');
    expect(res.body.reportes[0].descripcion).toContain('Cliente: Ana Gomez');
    expect(res.body.novedades).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(8);
  });

  test('GET /dashboard sin nombre de cliente debe mostrar N/D', async () => {
    pool.query
      .mockResolvedValueOnce([[{ totalProductos: 0 }]])
      .mockResolvedValueOnce([[{ totalClientes: 0 }]])
      .mockResolvedValueOnce([[{ totalVentas: 1 }]])
      .mockResolvedValueOnce([[{ ventasHoy: 0 }]])
      .mockResolvedValueOnce([[{ ventasMes: 0 }]])
      .mockResolvedValueOnce([[{ stockBajo: 0 }]])
      .mockResolvedValueOnce([[{ ingresosMes: 0 }]])
      .mockResolvedValueOnce([[{ id: 1, fecha: '2026-10-01', total: null, cliente: null }]]);

    const res = await request(app).get('/reportes/dashboard');

    expect(res.statusCode).toBe(200);
    expect(res.body.reportes[0].descripcion).toContain('Cliente: N/D');
  });

  test('GET /dashboard debe retornar 500 si falla la BD', async () => {
    // Silenciamos el console.error de la ruta para no ensuciar la salida
    jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

    const res = await request(app).get('/reportes/dashboard');

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Fallo de conexion');
    expect(pool.query).toHaveBeenCalledTimes(1); // Se detiene en la primera consulta
  });
});
