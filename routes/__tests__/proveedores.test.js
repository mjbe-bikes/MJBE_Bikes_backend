import request from "supertest";
import express from "express";
import router from "../proveedores.js";

// Simulamos la conexión a la BD (usa __mocks__/db.js).
// Así las pruebas no necesitan conectarse a MySQL.
jest.mock("../../db.js");
import pool from "../../db.js";

const mockQuery = pool.query;

const app = express();

app.use(express.json());
app.use("/proveedores", router);

describe("Pruebas de Caja Blanca - Proveedores", () => {

    beforeEach(() => {
        jest.resetAllMocks();
    });

    test("GET / debe retornar la lista de proveedores", async () => {

        pool.query.mockResolvedValueOnce([
            [
                {
                    id: 1,
                    nombre_proveedor: "Proveedor de prueba",
                    tipo_documento_id: 1,
                    numero_identidad: "123456",
                    direccion: "Calle 1",
                    telefono_prv: "3001234567",
                    telefono: "3001234567",
                    estado: "activo"
                }
            ]
        ]);

        const res = await request(app)
            .get("/proveedores");

        expect(res.statusCode).toBe(200);

        expect(res.body).toHaveLength(1);

        expect(res.body[0].nombre_proveedor)
            .toBe("Proveedor de prueba");

        expect(pool.query).toHaveBeenCalledTimes(1);
    });


    test("GET / con búsqueda debe construir la consulta con WHERE", async () => {

        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get("/proveedores?search=Juan");

        expect(res.statusCode).toBe(200);

        const queryEjecutada = pool.query.mock.calls[0][0];

        expect(queryEjecutada).toContain("WHERE");

        expect(queryEjecutada)
            .toContain("p.nombre_proveedor LIKE ?");

        expect(queryEjecutada)
            .toContain("p.numero_identidad LIKE ?");

        expect(pool.query.mock.calls[0][1])
            .toEqual([
                "%Juan%",
                "%Juan%",
                "%Juan%",
                "%Juan%"
            ]);
    });


    test("POST / debe rechazar la solicitud si faltan campos requeridos", async () => {

        const res = await request(app)
            .post("/proveedores")
            .send({
                nombre_proveedor: "Proveedor incompleto"
            });

        expect(res.statusCode).toBe(400);

        expect(res.body.mensaje)
            .toContain("son campos requeridos");

        expect(pool.query).not.toHaveBeenCalled();
    });


test("GET /:id debe retornar un proveedor cuando existe", async () => {

    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1,
                nombre_proveedor: "Proveedor encontrado",
                tipo_documento_id: 1,
                numero_identidad: "123456",
                direccion: "Calle 1",
                telefono_prv: "3001234567",
                telefono: "3001234567",
                estado: "activo"
            }
        ]
    ]);

    const res = await request(app)
        .get("/proveedores/1");

    expect(res.statusCode).toBe(200);

    expect(res.body.id).toBe(1);

    expect(res.body.nombre_proveedor)
        .toBe("Proveedor encontrado");

    expect(pool.query).toHaveBeenCalledTimes(1);
});



test("GET /:id debe retornar 404 cuando el proveedor no existe", async () => {

    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
        .get("/proveedores/999");

    expect(res.statusCode).toBe(404);

    expect(res.body.error)
        .toBe("Proveedor no encontrado");

    expect(pool.query).toHaveBeenCalledTimes(1);
});


test("GET /:id debe retornar 500 cuando ocurre un error en la BD", async () => {

    pool.query.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .get("/proveedores/1");

    expect(res.statusCode).toBe(500);

    expect(res.body.error)
        .toBe("Error de conexión a la BD");

    expect(pool.query).toHaveBeenCalledTimes(1);
});
test("POST / debe crear un proveedor correctamente", async () => {

    // 1. SELECT para comprobar identidad repetida
    pool.query.mockResolvedValueOnce([[]]);

    // 2. INSERT
    pool.query.mockResolvedValueOnce([
        {
            insertId: 10
        }
    ]);

    // 3. SELECT del proveedor creado
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 10,
                nombre_proveedor: "Proveedor nuevo",
                tipo_documento_id: 1,
                numero_identidad: "999999",
                direccion: "Calle 10",
                telefono_prv: "3009999999",
                telefono: "3009999999",
                estado: "activo"
            }
        ]
    ]);

    const res = await request(app)
        .post("/proveedores")
        .send({
            nombre_proveedor: "Proveedor nuevo",
            tipo_documento_id: 1,
            numero_identidad: "999999",
            direccion: "Calle 10",
            telefono: "3009999999"
        });

    expect(res.statusCode).toBe(201);

    expect(res.body.mensaje)
        .toBe("Proveedor creado exitosamente");

    expect(res.body.id)
        .toBe(10);

    expect(res.body.proveedor.nombre_proveedor)
        .toBe("Proveedor nuevo");

    expect(pool.query).toHaveBeenCalledTimes(3);
});


test("POST / debe rechazar un proveedor con identidad repetida", async () => {

    // La primera consulta encuentra un proveedor existente
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 5
            }
        ]
    ]);

    const res = await request(app)
        .post("/proveedores")
        .send({
            nombre_proveedor: "Proveedor duplicado",
            tipo_documento_id: 1,
            numero_identidad: "123456",
            direccion: "Calle 20",
            telefono: "3001111111"
        });

    expect(res.statusCode).toBe(400);

    expect(res.body.mensaje)
        .toBe("Ya existe un proveedor con esa identidad");

    // Solo debe ejecutar la consulta de comprobación
    expect(pool.query).toHaveBeenCalledTimes(1);
});


test("POST / debe retornar 500 cuando ocurre un error en la BD", async () => {

    pool.query.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .post("/proveedores")
        .send({
            nombre_proveedor: "Proveedor error",
            tipo_documento_id: 1,
            numero_identidad: "777777",
            direccion: "Calle 30",
            telefono: "3002222222"
        });

    expect(res.statusCode).toBe(500);

    expect(res.body.error)
        .toBe("Error de conexión a la BD");
});


test("POST / debe aceptar telefono_prv como teléfono del proveedor", async () => {

    pool.query.mockResolvedValueOnce([[]]);

    pool.query.mockResolvedValueOnce([
        {
            insertId: 20
        }
    ]);

    pool.query.mockResolvedValueOnce([
        [
            {
                id: 20,
                nombre_proveedor: "Proveedor teléfono",
                telefono_prv: "3015555555"
            }
        ]
    ]);

    const res = await request(app)
        .post("/proveedores")
        .send({
            nombre_proveedor: "Proveedor teléfono",
            tipo_documento_id: 1,
            numero_identidad: "888888",
            direccion: "Calle 40",
            telefono_prv: "3015555555"
        });

    expect(res.statusCode).toBe(201);

    expect(res.body.id).toBe(20);

    // Comprobamos que el INSERT recibió el teléfono
    const parametrosInsert = pool.query.mock.calls[1][1];

    expect(parametrosInsert)
        .toContain("3015555555");
});
test("PUT /:id debe actualizar un proveedor correctamente", async () => {
    // Primera consulta: verifica que el proveedor existe
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1
            }
        ]
    ]);

    // Segunda consulta: realiza el UPDATE
    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 1
        }
    ]);

    // Tercera consulta: obtiene el proveedor actualizado
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1,
                nombre_proveedor: "Proveedor actualizado",
                tipo_documento_id: 1,
                numero_identidad: "123456",
                direccion: "Calle actualizada",
                telefono_prv: "3009999999",
                telefono: "3009999999",
                estado: "activo"
            }
        ]
    ]);

    const res = await request(app)
        .put("/proveedores/1")
        .send({
            nombre_proveedor: "Proveedor actualizado",
            tipo_documento_id: 1,
            numero_identidad: "123456",
            direccion: "Calle actualizada",
            telefono: "3009999999",
            estado: "activo"
        });

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.nombre_proveedor)
        .toBe("Proveedor actualizado");

    expect(pool.query).toHaveBeenCalledTimes(3);
});


test("PUT /:id debe retornar 404 cuando el proveedor no existe", async () => {
    // La primera consulta devuelve una lista vacía
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
        .put("/proveedores/999")
        .send({
            nombre_proveedor: "Proveedor inexistente",
            tipo_documento_id: 1,
            numero_identidad: "999999",
            direccion: "Calle 99",
            telefono: "3001111111",
            estado: "activo"
        });

    expect(res.statusCode).toBe(404);
    expect(res.body.error)
        .toBe("Proveedor no encontrado");

    // Como no existe, nunca debe llegar al UPDATE
    expect(pool.query).toHaveBeenCalledTimes(1);
});


test("PUT /:id debe retornar 500 cuando ocurre un error en la BD", async () => {
    pool.query.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .put("/proveedores/1")
        .send({
            nombre_proveedor: "Proveedor error",
            tipo_documento_id: 1,
            numero_identidad: "777777",
            direccion: "Calle 30",
            telefono: "3002222222",
            estado: "activo"
        });

    expect(res.statusCode).toBe(500);
    expect(res.body.error)
        .toBe("Error de conexión a la BD");
});


test("PUT /:id debe aceptar telefono_prv en lugar de telefono", async () => {
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1
            }
        ]
    ]);

    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 1
        }
    ]);

    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1,
                nombre_proveedor: "Proveedor teléfono",
                telefono_prv: "3015555555"
            }
        ]
    ]);

    const res = await request(app)
        .put("/proveedores/1")
        .send({
            nombre_proveedor: "Proveedor teléfono",
            tipo_documento_id: 1,
            numero_identidad: "888888",
            direccion: "Calle 40",
            telefono_prv: "3015555555",
            estado: "activo"
        });

    expect(res.statusCode).toBe(200);

    // La segunda llamada corresponde al UPDATE.
    // Verificamos que recibió el teléfono enviado mediante telefono_prv.
    const parametrosUpdate = pool.query.mock.calls[1][1];

    expect(parametrosUpdate)
        .toContain("3015555555");
});
test("GET / debe aplicar filtros de estado y tipo_documento_id", async () => {
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1,
                nombre_proveedor: "Proveedor filtrado",
                estado: "activo",
                tipo_documento_id: 1
            }
        ]
    ]);

    const res = await request(app)
        .get("/proveedores?estado=activo&tipo_documento_id=1");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);

    const queryEjecutada = pool.query.mock.calls[0][0];
    const parametros = pool.query.mock.calls[0][1];

    expect(queryEjecutada)
        .toContain("p.estado = ?");

    expect(queryEjecutada)
        .toContain("p.tipo_documento_id = ?");

    expect(parametros)
        .toEqual(["activo", "1"]);
});
test("PATCH /:id debe actualizar los campos enviados", async () => {
    // UPDATE exitoso
    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 1
        }
    ]);

    // Consulta del proveedor actualizado
    pool.query.mockResolvedValueOnce([
        [
            {
                id: 1,
                nombre_proveedor: "Proveedor modificado",
                estado: "inactivo"
            }
        ]
    ]);

    const res = await request(app)
        .patch("/proveedores/1")
        .send({
            nombre_proveedor: "Proveedor modificado",
            estado: "inactivo"
        });

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.nombre_proveedor)
        .toBe("Proveedor modificado");

    expect(pool.query).toHaveBeenCalledTimes(2);

    // La primera consulta es el UPDATE.
    const parametrosUpdate = pool.query.mock.calls[0][1];

    expect(parametrosUpdate)
        .toEqual(["Proveedor modificado", "inactivo", "1"]);
});


test("PATCH /:id debe retornar 400 cuando no se envían campos", async () => {
    const res = await request(app)
        .patch("/proveedores/1")
        .send({});

    expect(res.statusCode).toBe(400);

    expect(res.body.error)
        .toBe("No se enviaron campos para actualizar");

    // No debe consultar la BD porque no hay nada que actualizar.
    expect(pool.query).not.toHaveBeenCalled();
});


test("PATCH /:id debe retornar 404 cuando el proveedor no existe", async () => {
    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 0
        }
    ]);

    const res = await request(app)
        .patch("/proveedores/999")
        .send({
            estado: "inactivo"
        });

    expect(res.statusCode).toBe(404);

    expect(res.body.error)
        .toBe("Proveedor no encontrado");

    expect(pool.query).toHaveBeenCalledTimes(1);
});


test("PATCH /:id debe retornar 500 cuando ocurre un error en la BD", async () => {
    pool.query.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .patch("/proveedores/1")
        .send({
            estado: "inactivo"
        });

    expect(res.statusCode).toBe(500);

    expect(res.body.error)
        .toBe("Error de conexión a la BD");
});
test("DELETE /:id debe eliminar un proveedor correctamente", async () => {
    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 1
        }
    ]);

    const res = await request(app)
        .delete("/proveedores/1");

    expect(res.statusCode).toBe(200);

    expect(res.body.mensaje)
        .toBe("Proveedor eliminado exitosamente");

    expect(pool.query).toHaveBeenCalledTimes(1);
});


test("DELETE /:id debe retornar 404 cuando el proveedor no existe", async () => {
    pool.query.mockResolvedValueOnce([
        {
            affectedRows: 0
        }
    ]);

    const res = await request(app)
        .delete("/proveedores/999");

    expect(res.statusCode).toBe(404);
});


test("DELETE /:id debe retornar 500 cuando ocurre un error en la BD", async () => {
    pool.query.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .delete("/proveedores/1");

    expect(res.statusCode).toBe(500);

    expect(res.body.error)
        .toBe("Error de conexión a la BD");
});

test("GET / debe retornar 500 cuando ocurre un error en la BD", async () => {
    // Simulamos un fallo al consultar la lista de proveedores.
    mockQuery.mockRejectedValueOnce(
        new Error("Error de conexión a la BD")
    );

    const res = await request(app)
        .get("/proveedores");

    // Verificamos que la ruta responda con error 500.
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Error de conexión a la BD");

    expect(mockQuery).toHaveBeenCalledTimes(1);
});
});