// backend/routes/__tests__/sessions.test.js
import request from 'supertest';
import express from 'express';
import router from '../sessions.js';

// Esta ruta no usa la base de datos (guarda las sesiones en memoria),
// por eso no se simula db.js

// Creamos una app de Express mínima solo para las pruebas
const app = express();
app.use(express.json());
app.use('/sessions', router);

describe('Pruebas de Caja Blanca - Sessions', () => {

  test('GET / al iniciar debe retornar un arreglo vacío', async () => {
    const res = await request(app).get('/sessions');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST / debe crear la sesión con id, fecha y los datos enviados', async () => {
    const res = await request(app)
      .post('/sessions')
      .send({ user_id: 1, login: 'admin' });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.user_id).toBe(1);
    expect(res.body.login).toBe('admin');
    expect(new Date(res.body.creado_en).toISOString()).toBe(res.body.creado_en);
  });

  test('POST / debe asignar ids incrementales y GET / debe acumularlas', async () => {
    // El arreglo en memoria conserva la sesión creada en la prueba anterior
    const res = await request(app)
      .post('/sessions')
      .send({ user_id: 2, login: 'vendedor' });

    expect(res.body.id).toBe(2);

    const lista = await request(app).get('/sessions');
    expect(lista.body).toHaveLength(2);
  });
});
