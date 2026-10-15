import request from "supertest";
import express from "express";
import clientesRouter from "../clientes.js";

// Simulamos la conexión a la BD (usa __mocks__/db.js).
// Así las pruebas no necesitan conectarse a MySQL.
jest.mock("../../db.js");
import pool from "../../db.js";

const mockQuery = pool.query;

// Creamos una aplicación Express exclusiva para las pruebas.
const app = express();
app.use(express.json());
app.use("/api/clientes", clientesRouter);

// Datos de ejemplo reutilizables.
const clienteEjemplo = {
    id: 1,
    id_cliente: 1,
    usuario_id: 10,
    tipo_documento_id: 1,
    tipo_documento: "CC",
    numero_documento: "123456789",
    nombres: "Carlos",
    apellidos: "Gomez",
    direccion: "Calle 10",
    telefono_clnt: "3001234567",
};

const datosNuevoCliente = {
    usuario_id: 10,
    tipo_documento_id: 1,
    numero_documento: "123456789",
    nombres: "Carlos",
    apellidos: "Gomez",
    direccion: "Calle 10",
    telefono_clnt: "3001234567",
};

describe("Pruebas del módulo clientes", () => {
    // Limpiamos los mocks antes de cada prueba para evitar
    // que una consulta de una prueba afecte a la siguiente.
    beforeEach(() => {
        mockQuery.mockReset();

        // Los errores esperados se registran con console.error
        // en el router; evitamos llenar la terminal con esas trazas.
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // --------------------------------------------------
    // GET /api/clientes
    // --------------------------------------------------

    test("GET / debe retornar la lista de clientes", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app).get("/api/clientes");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([clienteEjemplo]);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([]);
    });

    test("GET / debe filtrar clientes por búsqueda", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app)
            .get("/api/clientes")
            .query({ search: "Carlos" });

        expect(res.status).toBe(200);

        // La búsqueda se aplica a nombres, apellidos y documento.
        expect(mockQuery.mock.calls[0][0]).toContain("LIKE ?");
        expect(mockQuery.mock.calls[0][1]).toEqual([
            "%Carlos%",
            "%Carlos%",
            "%Carlos%",
        ]);
    });

    test("GET / debe filtrar por id_cliente", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app)
            .get("/api/clientes")
            .query({ id_cliente: 1 });

        expect(res.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain("c.id = ?");
        expect(mockQuery.mock.calls[0][1]).toEqual(["1"]);
    });

    test("GET / debe filtrar por usuario_id", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app)
            .get("/api/clientes")
            .query({ usuario_id: 10 });

        expect(res.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain("c.usuario_id = ?");
        expect(mockQuery.mock.calls[0][1]).toEqual(["10"]);
    });

    test("GET / debe combinar los filtros enviados", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app)
            .get("/api/clientes")
            .query({
                search: "Carlos",
                id_cliente: 1,
                usuario_id: 10,
            });

        expect(res.status).toBe(200);
        expect(mockQuery.mock.calls[0][0]).toContain(" AND ");
        expect(mockQuery.mock.calls[0][1]).toEqual([
            "%Carlos%",
            "%Carlos%",
            "%Carlos%",
            "1",
            "10",
        ]);
    });

    test("GET / debe retornar 500 si falla la base de datos", async () => {
        mockQuery.mockRejectedValueOnce(
            new Error("Error de conexión a la BD")
        );

        const res = await request(app).get("/api/clientes");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error de conexión a la BD");
    });

    // --------------------------------------------------
    // GET /api/clientes/:id
    // --------------------------------------------------

    test("GET /:id debe retornar un cliente existente", async () => {
        mockQuery.mockResolvedValueOnce([[clienteEjemplo], []]);

        const res = await request(app).get("/api/clientes/1");

        expect(res.status).toBe(200);
        expect(res.body).toEqual(clienteEjemplo);
        expect(mockQuery.mock.calls[0][1]).toEqual(["1"]);
    });

    test("GET /:id debe retornar 404 si no existe el cliente", async () => {
        mockQuery.mockResolvedValueOnce([[], []]);

        const res = await request(app).get("/api/clientes/999");

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Cliente no encontrado");
    });

    test("GET /:id debe retornar 500 si falla la consulta", async () => {
        mockQuery.mockRejectedValueOnce(new Error("Error de conexión a la BD"));

        const res = await request(app).get("/api/clientes/1");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error de conexión a la BD");
    });

    // --------------------------------------------------
    // POST /api/clientes
    // --------------------------------------------------

    test("POST / debe crear un cliente correctamente", async () => {
        mockQuery
            .mockResolvedValueOnce([[], []]) // No existe documento repetido.
            .mockResolvedValueOnce([{ insertId: 5 }, []]) // INSERT.
            .mockResolvedValueOnce([[{ ...clienteEjemplo, id: 5, id_cliente: 5 }], []]);

        const res = await request(app)
            .post("/api/clientes")
            .send(datosNuevoCliente);

        expect(res.status).toBe(201);
        expect(res.body.mensaje).toBe("Cliente creado exitosamente");
        expect(res.body.id).toBe(5);
        expect(res.body.id_cliente).toBe(5);
        expect(res.body.cliente.id).toBe(5);
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    test("POST / debe rechazar los campos obligatorios faltantes", async () => {
        const res = await request(app)
            .post("/api/clientes")
            .send({ nombres: "Carlos" });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("campos requeridos");

        // No debe consultar ni insertar nada.
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("POST / debe rechazar un documento duplicado", async () => {
        mockQuery.mockResolvedValueOnce([[{ id: 1 }], []]);

        const res = await request(app)
            .post("/api/clientes")
            .send(datosNuevoCliente);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "Ya existe un cliente con ese documento"
        );

        // Solo se consulta si el documento existe.
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test("POST / debe retornar 500 si falla la consulta de duplicados", async () => {
        mockQuery.mockRejectedValueOnce(new Error("Error de conexión a la BD"));

        const res = await request(app)
            .post("/api/clientes")
            .send(datosNuevoCliente);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error de conexión a la BD");
    });

    test("POST / debe retornar 500 si falla el INSERT", async () => {
        mockQuery
            .mockResolvedValueOnce([[], []])
            .mockRejectedValueOnce(new Error("Error al insertar"));

        const res = await request(app)
            .post("/api/clientes")
            .send(datosNuevoCliente);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error al insertar");
    });

    // --------------------------------------------------
    // PUT /api/clientes/:id
    // --------------------------------------------------

    test("PUT /:id debe actualizar un cliente existente", async () => {
        mockQuery
            .mockResolvedValueOnce([[{ id: 1 }], []]) // Comprueba existencia.
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // UPDATE.
            .mockResolvedValueOnce([[clienteEjemplo], []]); // Consulta final.

        const res = await request(app)
            .put("/api/clientes/1")
            .send(datosNuevoCliente);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(clienteEjemplo);
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    test("PUT /:id debe retornar 404 si el cliente no existe", async () => {
        mockQuery.mockResolvedValueOnce([[], []]);

        const res = await request(app)
            .put("/api/clientes/999")
            .send(datosNuevoCliente);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Cliente no encontrado");
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test("PUT /:id debe rechazar los campos obligatorios faltantes", async () => {
        mockQuery.mockResolvedValueOnce([[{ id: 1 }], []]);

        const res = await request(app)
            .put("/api/clientes/1")
            .send({ nombres: "Carlos" });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("campos requeridos");
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test("PUT /:id debe retornar 500 si falla la consulta inicial", async () => {
        mockQuery.mockRejectedValueOnce(new Error("Error de conexión a la BD"));

        const res = await request(app)
            .put("/api/clientes/1")
            .send(datosNuevoCliente);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error de conexión a la BD");
    });

    test("PUT /:id debe retornar 500 si falla la actualización", async () => {
        mockQuery
            .mockResolvedValueOnce([[{ id: 1 }], []])
            .mockRejectedValueOnce(new Error("Error al actualizar"));

        const res = await request(app)
            .put("/api/clientes/1")
            .send(datosNuevoCliente);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error al actualizar");
    });

    // --------------------------------------------------
    // DELETE /api/clientes/:id
    // --------------------------------------------------

    test("DELETE /:id debe eliminar un cliente existente", async () => {
        mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const res = await request(app).delete("/api/clientes/1");

        expect(res.status).toBe(200);
        expect(res.body.mensaje).toBe("Cliente eliminado exitosamente");
        expect(mockQuery.mock.calls[0][1]).toEqual(["1"]);
    });

    test("DELETE /:id debe retornar 404 si el cliente no existe", async () => {
        mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

        const res = await request(app).delete("/api/clientes/999");

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Cliente no encontrado");
    });

    test("DELETE /:id debe retornar 500 si falla la consulta", async () => {
        mockQuery.mockRejectedValueOnce(new Error("Error de conexión a la BD"));

        const res = await request(app).delete("/api/clientes/1");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Error de conexión a la BD");
    });
});