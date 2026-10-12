
import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";

// Simulamos la base de datos para no modificar registros reales.
const mockQuery = jest.fn();

jest.unstable_mockModule("../../db.js", () => ({
    default: { query: mockQuery },
}));

// Importamos la ruta después de configurar el mock de la base de datos.
const { default: localesRouter } = await import("../locales.js");

const app = express();
app.use(express.json());
app.use("/", localesRouter);

// Datos de ejemplo reutilizados en las pruebas.
const localEjemplo = {
    id: 1,
    nombre_local: "Local principal",
    direccion_local: "Calle 10 # 20-30",
    correo: "principal@mjbe.com",
    telefono: "3001234567",
    estado: "activo",
};

const localActualizado = {
    ...localEjemplo,
    nombre_local: "Local actualizado",
};

beforeEach(() => {
    // Limpia el historial y las respuestas anteriores de los mocks.
    jest.resetAllMocks();

    // Evita llenar la consola con errores esperados durante las pruebas.
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Pruebas del módulo locales", () => {
    // ---------------------------------------------------------
    // GET /
    // ---------------------------------------------------------
    describe("GET /", () => {
        test("debe listar todos los locales", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app).get("/");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([localEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("FROM locales"),
                []
            );
        });

        test("debe buscar locales usando search", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ search: "principal" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([localEjemplo]);

            // Se buscan coincidencias en las cinco columnas permitidas.
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("nombre_local LIKE ?"),
                [
                    "%principal%",
                    "%principal%",
                    "%principal%",
                    "%principal%",
                    "%principal%",
                ]
            );
        });

        test("debe filtrar por estado", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ estado: "activo" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("estado = ?"),
                ["activo"]
            );
        });

        test("debe combinar búsqueda y filtro por estado", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ search: "principal", estado: "activo" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("AND estado = ?"),
                [
                    "%principal%",
                    "%principal%",
                    "%principal%",
                    "%principal%",
                    "%principal%",
                    "activo",
                ]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ nombre_local: "Local principal" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("WHERE"),
                []
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de conexión"));

            const res = await request(app).get("/");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error de conexión" });
        });
    });

    // ---------------------------------------------------------
    // GET /:id
    // ---------------------------------------------------------
    describe("GET /:id", () => {
        test("debe retornar un local existente", async () => {
            mockQuery.mockResolvedValueOnce([[localEjemplo], []]);

            const res = await request(app).get("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(localEjemplo);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = ?"),
                ["1"]
            );
        });

        test("debe responder 404 si el local no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Local no encontrado" });
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app).get("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error de consulta" });
        });
    });

    // ---------------------------------------------------------
    // POST /
    // ---------------------------------------------------------
    describe("POST /", () => {
        test("debe crear un local con estado activo por defecto", async () => {
            mockQuery.mockResolvedValueOnce([{ insertId: 5 }, []]);

            const nuevoLocal = {
                nombre_local: "Local nuevo",
                direccion_local: "Carrera 5 # 10-20",
                correo: "nuevo@mjbe.com",
                telefono: "3101234567",
            };

            const res = await request(app).post("/").send(nuevoLocal);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                mensaje: "Local creado exitosamente",
                id: 5,
                local: {
                    id: 5,
                    ...nuevoLocal,
                    estado: "activo",
                },
            });

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO locales"),
                [
                    nuevoLocal.nombre_local,
                    nuevoLocal.direccion_local,
                    nuevoLocal.correo,
                    nuevoLocal.telefono,
                    "activo",
                ]
            );
        });

        test("debe conservar el estado enviado al crear", async () => {
            mockQuery.mockResolvedValueOnce([{ insertId: 6 }, []]);

            const nuevoLocal = {
                nombre_local: "Local inactivo",
                direccion_local: "Calle 1",
                correo: "inactivo@mjbe.com",
                telefono: "3111234567",
                estado: "inactivo",
            };

            const res = await request(app).post("/").send(nuevoLocal);

            expect(res.status).toBe(201);
            expect(res.body.local.estado).toBe("inactivo");
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("INSERT INTO locales"),
                [
                    nuevoLocal.nombre_local,
                    nuevoLocal.direccion_local,
                    nuevoLocal.correo,
                    nuevoLocal.telefono,
                    "inactivo",
                ]
            );
        });

        test.each([
            ["nombre_local", {
                direccion_local: "Calle 10",
                correo: "local@mjbe.com",
                telefono: "3001234567",
            }],
            ["direccion_local", {
                nombre_local: "Local",
                correo: "local@mjbe.com",
                telefono: "3001234567",
            }],
            ["correo", {
                nombre_local: "Local",
                direccion_local: "Calle 10",
                telefono: "3001234567",
            }],
            ["telefono", {
                nombre_local: "Local",
                direccion_local: "Calle 10",
                correo: "local@mjbe.com",
            }],
        ])("debe rechazar la solicitud si falta %s", async (_campo, body) => {
            const res = await request(app).post("/").send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "Nombre, direccion, correo y telefono son campos requeridos",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 500 si falla la creación", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al insertar"));

            const res = await request(app).post("/").send({
                nombre_local: "Local nuevo",
                direccion_local: "Calle 10",
                correo: "nuevo@mjbe.com",
                telefono: "3001234567",
            });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al insertar" });
        });
    });

    // ---------------------------------------------------------
    // PUT /:id
    // ---------------------------------------------------------
    describe("PUT /:id", () => {
        const datosActualizacion = {
            nombre_local: "Local actualizado",
            direccion_local: "Carrera 20",
            correo: "actualizado@mjbe.com",
            telefono: "3201234567",
            estado: "activo",
        };

        test("debe actualizar un local existente", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[localActualizado], []]);

            const res = await request(app)
                .put("/1")
                .send(datosActualizacion);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(localActualizado);

            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining("UPDATE locales SET"),
                [
                    datosActualizacion.nombre_local,
                    datosActualizacion.direccion_local,
                    datosActualizacion.correo,
                    datosActualizacion.telefono,
                    datosActualizacion.estado,
                    "1",
                ]
            );

            expect(mockQuery).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining("SELECT id"),
                ["1"]
            );
        });

        test("debe responder 404 si el local no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app)
                .put("/999")
                .send(datosActualizacion);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Local no encontrado" });
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 si falla la actualización", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al actualizar"));

            const res = await request(app)
                .put("/1")
                .send(datosActualizacion);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al actualizar" });
        });

        test("debe responder 500 si falla la consulta posterior", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar local"));

            const res = await request(app)
                .put("/1")
                .send(datosActualizacion);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al consultar local" });
        });
    });

    // ---------------------------------------------------------
    // PATCH /:id
    // ---------------------------------------------------------
    describe("PATCH /:id", () => {
        test("debe actualizar únicamente los campos enviados", async () => {
            const cambios = { nombre_local: "Nombre parcial" };
            const resultado = {
                ...localEjemplo,
                nombre_local: "Nombre parcial",
            };

            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[resultado], []]);

            const res = await request(app).patch("/1").send(cambios);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(resultado);

            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                "UPDATE locales SET nombre_local = ? WHERE id = ?",
                ["Nombre parcial", "1"]
            );

            expect(mockQuery).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining("SELECT id"),
                ["1"]
            );
        });

        test("debe actualizar varios campos enviados", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[localActualizado], []]);

            const res = await request(app).patch("/1").send({
                nombre_local: "Local actualizado",
                estado: "inactivo",
            });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                "UPDATE locales SET nombre_local = ?, estado = ? WHERE id = ?",
                ["Local actualizado", "inactivo", "1"]
            );
        });

        test("debe rechazar una solicitud sin campos para actualizar", async () => {
            const res = await request(app).patch("/1").send({});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "No se enviaron campos para actualizar",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 404 si el local no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app)
                .patch("/999")
                .send({ estado: "inactivo" });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Local no encontrado" });
        });

        test("debe responder 500 si falla la actualización parcial", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error en PATCH"));

            const res = await request(app)
                .patch("/1")
                .send({ estado: "inactivo" });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error en PATCH" });
        });

        test("debe responder 500 si falla la consulta posterior", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar"));

            const res = await request(app)
                .patch("/1")
                .send({ estado: "inactivo" });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al consultar" });
        });
    });

    // ---------------------------------------------------------
    // DELETE /:id
    // ---------------------------------------------------------
    describe("DELETE /:id", () => {
        test("debe eliminar un local existente", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app).delete("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                mensaje: "Local eliminado exitosamente",
            });
            expect(mockQuery).toHaveBeenCalledWith(
                "DELETE FROM locales WHERE id = ?",
                ["1"]
            );
        });

        test("debe responder 404 si el local no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app).delete("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Local no encontrado" });
        });

        test("debe responder 500 si falla la eliminación", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al eliminar"));

            const res = await request(app).delete("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al eliminar" });
        });
    });
});