// backend/routes/__tests__/ventas.test.js
import request from 'supertest';
import express from 'express';
import router from '../ventas.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/ventas', router);

describe('Pruebas de Caja Blanca - Ventas', () => {

  test('GET / sin filtros debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ id: 1, id_vendedor: 2, id_cliente: 3, total: 50000 }]]);

    const res = await request(app).get('/ventas');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
  });

  test('GET / con user_id debe usarlo como id_vendedor', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/ventas?user_id=5');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE v.id_vendedor = ?');
    expect(queryEjecutada).not.toContain('user_id');
    expect(pool.query.mock.calls[0][1]).toEqual(['5']);
  });

  test('GET / con comprador debe construir subconsulta sobre clientes', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/ventas?comprador=8&pago=1');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('v.id_cliente IN (SELECT id FROM clientes WHERE usuario_id = ?)');
    expect(queryEjecutada).toContain('AND v.pago = ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['8', '1']);
  });

  test('GET /:id debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/ventas/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Venta no encontrada');
  });

  test('POST / debe rechazar si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/ventas')
      .send({ id_vendedor: 1 });

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / sin fecha no debe incluir la columna fecha en el INSERT', async () => {
    // 1ra: INSERT, 2da: SELECT de la venta creada
    pool.query
      .mockResolvedValueOnce([{ insertId: 20 }])
      .mockResolvedValueOnce([[{ id: 20, id_vendedor: 1, id_cliente: 2 }]]);

    const res = await request(app)
      .post('/ventas')
      .send({ id_vendedor: 1, id_cliente: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(20);
    expect(res.body.venta.id).toBe(20);
    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('INSERT INTO ventas (id_vendedor, id_cliente, total, pago)');
    expect(pool.query.mock.calls[0][1]).toEqual([1, 2, null, false]);
  });

  test('POST / con fecha debe incluir la columna fecha en el INSERT', async () => {
    pool.query
      .mockResolvedValueOnce([{ insertId: 21 }])
      .mockResolvedValueOnce([[{ id: 21 }]]);

    await request(app)
      .post('/ventas')
      .send({ id_vendedor: 1, id_cliente: 2, fecha: '2026-10-01', total: 1000, pago: true });

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('(id_vendedor, id_cliente, fecha, total, pago)');
    expect(pool.query.mock.calls[0][1][2]).toBeInstanceOf(Date);
  });

  test('PATCH /:id debe rechazar si no se envían campos', async () => {
    const res = await request(app)
      .patch('/ventas/1')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('PATCH /:id debe marcar la venta como pagada', async () => {
    // 1ra: UPDATE, 2da: SELECT actualizado
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 1, pago: 1 }]]);

    const res = await request(app)
      .patch('/ventas/1')
      .send({ pago: true });

    expect(res.statusCode).toBe(200);
    expect(pool.query.mock.calls[0][0]).toContain('SET pago = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([true, '1']);
  });

  test('PATCH /:id debe retornar 404 si no se actualizó ninguna fila', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .patch('/ventas/99')
      .send({ total: 2000 });

    expect(res.statusCode).toBe(404);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('DELETE /:id debe eliminar la venta', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete('/ventas/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.mensaje).toBe('Venta eliminada exitosamente');
  });

  test('GET / con user_id e id_vendedor debe priorizar id_vendedor', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/ventas?user_id=5&id_vendedor=7');

    expect(pool.query.mock.calls[0][0]).toContain('WHERE v.id_vendedor = ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['7']);
  });

  test('GET / con filtros no permitidos debe ignorarlos', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/ventas?columnaInvalida=x');

    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
    expect(pool.query.mock.calls[0][1]).toEqual([]);
  });

  test('GET /:id debe retornar la venta si existe', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1, vendedor: 'admin', cliente: 'Ana Gomez' }]]);

    const res = await request(app).get('/ventas/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.cliente).toBe('Ana Gomez');
    expect(pool.query.mock.calls[0][1]).toEqual(['1']);
  });

  test('PATCH /:id con fecha debe convertirla a Date', async () => {
    // 1ra: UPDATE, 2da: SELECT actualizado
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await request(app)
      .patch('/ventas/1')
      .send({ fecha: '2026-10-01', total: 3000 });

    expect(pool.query.mock.calls[0][0]).toContain('SET fecha = ?, total = ?');
    expect(pool.query.mock.calls[0][1][0]).toBeInstanceOf(Date);
    expect(pool.query.mock.calls[0][1][1]).toBe(3000);
  });

  test('DELETE /:id debe retornar 404 si la venta no existe', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).delete('/ventas/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Venta no encontrada');
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/ventas');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:id debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/ventas/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/ventas')
        .send({ id_vendedor: 1, id_cliente: 2 });

      expect(res.statusCode).toBe(500);
      expect(pool.query).toHaveBeenCalledTimes(1); // No debe consultar la venta creada
    });

    test('POST / debe retornar 500 si falla el SELECT posterior al INSERT', async () => {
      // 1ra: INSERT correcto, 2da: falla el SELECT de la venta creada
      pool.query
        .mockResolvedValueOnce([{ insertId: 20 }])
        .mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/ventas')
        .send({ id_vendedor: 1, id_cliente: 2 });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('PATCH /:id debe retornar 500 si falla el UPDATE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .patch('/ventas/1')
        .send({ pago: true });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('DELETE /:id debe retornar 500 si falla el DELETE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).delete('/ventas/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
