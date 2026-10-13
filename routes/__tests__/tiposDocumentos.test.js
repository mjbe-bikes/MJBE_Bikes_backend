// backend/routes/__tests__/tiposDocumentos.test.js
import request from 'supertest';
import express from 'express';
import router from '../tiposDocumentos.js';

// Simulamos el módulo de la base de datos
jest.mock('../../db.js');
import pool from '../../db.js';

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/tipos_documentos', router);

describe('Pruebas de Caja Blanca - Tipos de Documento', () => {

  test('GET / sin búsqueda debe retornar la lista sin WHERE', async () => {
    // Configuramos el mock: una sola llamada devuelve rows
    pool.query.mockResolvedValueOnce([[{ id: 1, sigla: 'CC', nombre_documento: 'Cedula de ciudadania' }]]);

    const res = await request(app).get('/tipos_documentos');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][0]).not.toContain('WHERE');
  });

  test('GET / con búsqueda debe construir query con WHERE en ambos campos', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await request(app).get('/tipos_documentos?search=CC');

    const queryEjecutada = pool.query.mock.calls[0][0];
    expect(queryEjecutada).toContain('WHERE');
    expect(queryEjecutada).toContain('sigla LIKE ? OR nombre_documento LIKE ?');
    expect(pool.query.mock.calls[0][1]).toEqual(['%CC%', '%CC%']);
  });

  test('GET /:id debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/tipos_documentos/99');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Tipo de documento no encontrado');
  });

  test('POST / debe rechazar si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/tipos_documentos')
      .send({ sigla: 'NIT' });

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled(); // No debe tocar la BD
  });

  test('POST / debe crear el tipo de documento y retornar 201', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 4 }]);

    const res = await request(app)
      .post('/tipos_documentos')
      .send({ sigla: 'NIT', nombre_documento: 'Numero de identificacion tributaria' });

    expect(res.statusCode).toBe(201);
    expect(res.body.tipo_documento).toEqual({
      id: 4,
      sigla: 'NIT',
      nombre_documento: 'Numero de identificacion tributaria'
    });
  });

  test('PUT /:id debe retornar el registro actualizado', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .put('/tipos_documentos/2')
      .send({ sigla: 'CE', nombre_documento: 'Cedula de extranjeria' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: 2, sigla: 'CE', nombre_documento: 'Cedula de extranjeria' });
  });

  test('DELETE /:id debe retornar 404 si no existe', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app).delete('/tipos_documentos/99');

    expect(res.statusCode).toBe(404);
  });

  describe('Manejo de errores (catch)', () => {

    beforeEach(() => {
      // Silenciamos el console.error de la ruta para no ensuciar la salida
      jest.spyOn(console, 'error').mockImplementation(() => {});
      // Todas las pruebas de este bloque simulan una falla de la BD
      pool.query.mockRejectedValueOnce(new Error('Fallo de conexion'));
    });

    test('GET / debe retornar 500 si falla la BD', async () => {
      const res = await request(app).get('/tipos_documentos');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
      expect(console.error).toHaveBeenCalled();
    });

    test('GET /:id debe retornar 500 si falla la BD', async () => {
      const res = await request(app).get('/tipos_documentos/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('POST / debe retornar 500 si falla el INSERT', async () => {
      const res = await request(app)
        .post('/tipos_documentos')
        .send({ sigla: 'NIT', nombre_documento: 'Numero de identificacion tributaria' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('PUT /:id debe retornar 500 si falla el UPDATE', async () => {
      const res = await request(app)
        .put('/tipos_documentos/1')
        .send({ sigla: 'CE', nombre_documento: 'Cedula de extranjeria' });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });

    test('DELETE /:id debe retornar 500 si falla el DELETE', async () => {
      const res = await request(app).delete('/tipos_documentos/1');

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Fallo de conexion');
    });
  });
});
