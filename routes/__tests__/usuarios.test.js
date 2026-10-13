// backend/routes/__tests__/usuarios.test.js
import request from 'supertest';
import express from 'express';
import router from '../usuarios.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/usuarios', router);

describe('Pruebas de Caja Blanca - Usuarios', () => {

  test('GET / sin filtros debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ id: 1, login: 'admin', email: 'admin@test.com' }]]);

    const res = await request(app).get('/usuarios');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
  });

  test('GET / con búsqueda y filtros debe combinar condiciones con AND', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/usuarios?search=juan&estado=activo&columnaInvalida=x');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE');
    expect(queryEjecutada).toContain('u.login LIKE ?');
    expect(queryEjecutada).toContain('AND u.estado = ?');
    expect(queryEjecutada).not.toContain('columnaInvalida'); // Filtros no permitidos se ignoran
    expect(pool.query.mock.calls[0][1]).toEqual(['%juan%', '%juan%', '%juan%', 'activo']);
  });

  test('GET /:id debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/usuarios/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Usuario no encontrado');
  });

  test('POST / debe rechazar si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/usuarios')
      .send({ login: 'incompleto' });

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / debe rechazar si el login o email ya existen', async () => {
    // 1ra llamada (verificación de duplicado) devuelve una fila existente
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

    const res = await request(app)
      .post('/usuarios')
      .send({ login: 'admin', email: 'admin@test.com', password_harsh: '123', rol_id: 1 });

    expect(res.statusCode).toBe(400);
    expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al INSERT
  });

  test('POST / debe crear el usuario con valores por defecto', async () => {
    // 1ra: sin duplicados, 2da: INSERT, 3ra: SELECT del usuario creado
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[{ id: 10, login: 'nuevo', estado: 'activo' }]]);

    const res = await request(app)
      .post('/usuarios')
      .send({ login: 'nuevo', email: 'nuevo@test.com', password_harsh: '123', rol_id: 2 });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(10);
    expect(res.body.usuario.login).toBe('nuevo');
    // Los campos opcionales que no se enviaron toman su valor por defecto
    expect(pool.query.mock.calls[1][1]).toEqual(['nuevo', 'nuevo@test.com', '123', null, '', '', '', 2, 'activo']);
  });

  test('PUT /:id debe retornar 404 si el usuario no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .put('/usuarios/99')
      .send({ login: 'otro' });

    expect(res.statusCode).toBe(404);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('PUT /:id debe rechazar si no se envían campos', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

    const res = await request(app)
      .put('/usuarios/1')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al UPDATE
  });

  test('PUT /:id debe actualizar solo los campos enviados', async () => {
    // 1ra: existe, 2da: UPDATE, 3ra: SELECT actualizado
    pool.query
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 1, email: 'cambio@test.com' }]]);

    const res = await request(app)
      .put('/usuarios/1')
      .send({ email: 'cambio@test.com' });

    expect(res.statusCode).toBe(200);
    const queryEjecutada = pool.query.mock.calls[1][0];
    expect(queryEjecutada).toContain('SET email = ?');
    expect(queryEjecutada).not.toContain('password_harsh'); // La contraseña no se toca
  });

  test('PATCH /:id debe retornar 404 si no se actualizó ninguna fila', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .patch('/usuarios/99')
      .send({ estado: 'inactivo' });

    expect(res.statusCode).toBe(404);
  });

  test('PATCH /:id debe rechazar si no se envían campos', async () => {
    const res = await request(app)
      .patch('/usuarios/1')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('DELETE /:id debe eliminar el usuario', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app).delete('/usuarios/1');

    expect(res.statusCode).toBe(200);
    expect(res.body.mensaje).toBe('Usuario eliminado exitosamente');
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/usuarios');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:id debe retornar 500 si falla la BD', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).get('/usuarios/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla la verificación de duplicado', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/usuarios')
        .send({ login: 'nuevo', email: 'nuevo@test.com', password_harsh: '123', rol_id: 2 });

      expect(res.statusCode).toBe(500);
      expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al INSERT
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      // 1ra: sin duplicados, 2da: falla el INSERT
      pool.query
        .mockResolvedValueOnce([[]])
        .mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .post('/usuarios')
        .send({ login: 'nuevo', email: 'nuevo@test.com', password_harsh: '123', rol_id: 2 });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('PUT /:id debe retornar 500 si falla la verificación de existencia', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .put('/usuarios/1')
        .send({ email: 'cambio@test.com' });

      expect(res.statusCode).toBe(500);
      expect(pool.query).toHaveBeenCalledTimes(1); // No debe llegar al UPDATE
    });

    test('PUT /:id debe retornar 500 si falla el UPDATE', async () => {
      // 1ra: el usuario existe, 2da: falla el UPDATE
      pool.query
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .put('/usuarios/1')
        .send({ email: 'cambio@test.com' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('PATCH /:id debe retornar 500 si falla el UPDATE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app)
        .patch('/usuarios/1')
        .send({ estado: 'inactivo' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('DELETE /:id debe retornar 500 si falla el DELETE', async () => {
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));

      const res = await request(app).delete('/usuarios/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
