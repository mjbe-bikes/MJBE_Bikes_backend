// backend/routes/__tests__/roles.test.js
import request from 'supertest';
import express from 'express';
import router from '../roles.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/roles', router);

describe('Pruebas de Caja Blanca - Roles', () => {

  test('GET / sin búsqueda debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ id_rol: 1, tipo_rol: 'Administrador' }]]);

    const res = await request(app).get('/roles');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).not.toContain('WHERE');
    expect(pool.query.mock.calls[0][1]).toEqual([]);
  });

  test('GET / con búsqueda debe construir query con WHERE', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/roles?search=Admin');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE');
    expect(queryEjecutada).toContain('tipo_rol LIKE ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['%Admin%']);
  });

  test('GET /:id debe retornar 404 si el rol no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/roles/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Rol no encontrado');
  });

  test('POST / debe rechazar si falta tipo_rol', async () => {
    const res = await request(app)
      .post('/roles')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / debe crear el rol y retornar 201', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 5 }]);

    const res = await request(app)
      .post('/roles')
      .send({ tipo_rol: 'Vendedor' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(5);
    expect(res.body.rol).toEqual({ id_rol: 5, tipo_rol: 'Vendedor' });
  });

  test('PUT /:id debe retornar 404 si no se actualizó ninguna fila', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .put('/roles/99')
      .send({ tipo_rol: 'Otro' });

    expect(res.statusCode).toBe(404);
  });

  test('DELETE /:id debe eliminar el rol', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete('/roles/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.mensaje).toBe('Rol eliminado exitosamente');
  });

  test('GET /:id debe retornar el rol si existe', async () => {
    pool.query.mockResolvedValueOnce([[{ id_rol: 1, tipo_rol: 'Administrador' }]]);

    const res = await request(app).get('/roles/1');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id_rol: 1, tipo_rol: 'Administrador' });
    expect(pool.query.mock.calls[0][1]).toEqual(['1']);
  });

  test('PUT /:id debe retornar el rol actualizado', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .put('/roles/2')
      .send({ tipo_rol: 'Cajero' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id_rol: 2, tipo_rol: 'Cajero' });
  });

  test('DELETE /:id debe retornar 404 si el rol no existe', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).delete('/roles/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Rol no encontrado');
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
      // Todas las pruebas de este bloque simulan una falla de la BD
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      const res = await request(app).get('/roles');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:id debe retornar 500 si falla la BD', async () => {
      const res = await request(app).get('/roles/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      const res = await request(app)
        .post('/roles')
        .send({ tipo_rol: 'Vendedor' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('PUT /:id debe retornar 500 si falla el UPDATE', async () => {
      const res = await request(app)
        .put('/roles/1')
        .send({ tipo_rol: 'Otro' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('DELETE /:id debe retornar 500 si falla el DELETE', async () => {
      const res = await request(app).delete('/roles/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
