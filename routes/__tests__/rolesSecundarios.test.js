// backend/routes/__tests__/rolesSecundarios.test.js
import request from 'supertest';
import express from 'express';
import router from '../rolesSecundarios.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/roles_secundarios', router);

describe('Pruebas de Caja Blanca - Roles Secundarios', () => {

  test('GET / sin filtro debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ usuario_id: 1, rol_secundario: 2, login: 'admin', tipo_rol: 'Vendedor' }]]);

    const res = await request(app).get('/roles_secundarios');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
  });

  test('GET / con usuario_id debe construir query con WHERE', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/roles_secundarios?usuario_id=3');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE rs.usuario_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['3']);
  });

  test('GET /:usuario_id debe filtrar por el usuario de la URL', async () => {
    pool.query.mockResolvedValueOnce([[{ usuario_id: 3, rol_secundario: 1 }]]);

    const res = await request(app).get('/roles_secundarios/3');

    expect(res.statusCode).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual(['3']);
  });

  test('POST / debe rechazar si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/roles_secundarios')
      .send({ usuario_id: 1 });

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / debe rechazar si el usuario ya tiene ese rol', async () => {
    // 1ra llamada (verificación de duplicado) devuelve una fila existente
    pool.query.mockResolvedValueOnce([[{ usuario_id: 1 }]]);

    const res = await request(app)
      .post('/roles_secundarios')
      .send({ usuario_id: 1, rol_secundario: 2 });

    expect(res.statusCode).toBe(400);
    expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al INSERT
  });

  test('POST / debe asignar el rol y retornar 201', async () => {
    // 1ra llamada: no hay duplicado, 2da llamada: INSERT
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/roles_secundarios')
      .send({ usuario_id: 1, rol_secundario: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.rol_secundario).toEqual({ usuario_id: 1, rol_secundario: 2 });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('DELETE /:usuario_id/:rol_secundario debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).delete('/roles_secundarios/1/9');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Asignacion no encontrada');
  });

  test('DELETE /:usuario_id/:rol_secundario debe quitar el rol secundario', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete('/roles_secundarios/1/2');

    expect(res.statusCode).toBe(200);
    expect(res.body.mensaje).toBe('Rol secundario eliminado exitosamente');
    expect(pool.query.mock.calls[0][1]).toEqual(['1', '2']);
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/roles_secundarios');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:usuario_id debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/roles_secundarios/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla la verificación de duplicado', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/roles_secundarios')
        .send({ usuario_id: 1, rol_secundario: 2 });

      expect(res.statusCode).toBe(500);
      expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al INSERT
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      // 1ra llamada: no hay duplicado, 2da llamada: falla el INSERT
      pool.query
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/roles_secundarios')
        .send({ usuario_id: 1, rol_secundario: 2 });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('DELETE /:usuario_id/:rol_secundario debe retornar 500 si falla el DELETE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).delete('/roles_secundarios/1/2');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
