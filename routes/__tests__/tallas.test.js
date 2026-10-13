// backend/routes/__tests__/tallas.test.js
import request from 'supertest';
import express from 'express';
import router from '../tallas.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/tallas', router);

describe('Pruebas de Caja Blanca - Tallas', () => {

  test('GET / sin filtros debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ id: 1, medida_id: 1, talla: 'M', tipo_medida: 'Ropa' }]]);

    const res = await request(app).get('/tallas');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
  });

  test('GET / con búsqueda y medida_id debe combinar condiciones con AND', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/tallas?search=M&medida_id=2&columnaInvalida=x');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE (t.talla LIKE ?)');
    expect(queryEjecutada).toContain('AND t.medida_id = ?');
    expect(queryEjecutada).not.toContain('columnaInvalida'); // Filtros no permitidos se ignoran
    expect(pool.query.mock.calls[0][1]).toEqual(['%M%', '2']);
  });

  test('GET /:id debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/tallas/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Talla no encontrada');
  });

  test('POST / debe rechazar si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/tallas')
      .send({ talla: 'L' });

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / debe crear la talla y retornar 201', async () => {
    // 1ra: INSERT, 2da: SELECT de la talla creada
    pool.query
      .mockResolvedValueOnce([{ insertId: 8 }])
      .mockResolvedValueOnce([[{ id: 8, medida_id: 1, talla: 'L', tipo_medida: 'Ropa' }]]);

    const res = await request(app)
      .post('/tallas')
      .send({ medida_id: 1, talla: 'L' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(8);
    expect(res.body.talla.talla).toBe('L');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('PUT /:id debe retornar 404 si no se actualizó ninguna fila', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .put('/tallas/99')
      .send({ medida_id: 1, talla: 'XL' });

    expect(res.statusCode).toBe(404);
    expect(pool.query).toHaveBeenCalledTimes(1); // No debe consultar la talla actualizada
  });

  test('PUT /:id debe retornar la talla actualizada', async () => {
    // 1ra: UPDATE, 2da: SELECT actualizado
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 2, medida_id: 1, talla: 'XL' }]]);

    const res = await request(app)
      .put('/tallas/2')
      .send({ medida_id: 1, talla: 'XL' });

    expect(res.statusCode).toBe(200);
    expect(res.body.talla).toBe('XL');
    expect(pool.query.mock.calls[0][1]).toEqual([1, 'XL', '2']);
  });

  test('DELETE /:id debe eliminar la talla', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete('/tallas/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.mensaje).toBe('Talla eliminada exitosamente');
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/tallas');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:id debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/tallas/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/tallas')
        .send({ medida_id: 1, talla: 'L' });

      expect(res.statusCode).toBe(500);
      expect(pool.query).toHaveBeenCalledTimes(1); // No debe consultar la talla creada
    });

    test('POST / debe retornar 500 si falla el SELECT posterior al INSERT', async () => {
      // 1ra: INSERT correcto, 2da: falla el SELECT de la talla creada
      pool.query
        .mockResolvedValueOnce([{ insertId: 8 }])
        .mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/tallas')
        .send({ medida_id: 1, talla: 'L' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('PUT /:id debe retornar 500 si falla el UPDATE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .put('/tallas/1')
        .send({ medida_id: 1, talla: 'XL' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('DELETE /:id debe retornar 500 si falla el DELETE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).delete('/tallas/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
