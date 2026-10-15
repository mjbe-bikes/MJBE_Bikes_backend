import { jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Simulamos la base de datos para no modificar el inventario real.
const mockQuery = jest.fn();
const mockBeginTransaction = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockRelease = jest.fn();
const mockGetConnection = jest.fn();

// Simulamos la conexión que utiliza las transacciones.
const mockConn = {
    query: mockQuery,
    beginTransaction: mockBeginTransaction,
    commit: mockCommit,
    rollback: mockRollback,
    release: mockRelease,
};

// Reemplazamos db.js antes de importar la ruta.
jest.unstable_mockModule("../../db.js", () => ({
    default: {
        query: mockQuery,
        getConnection: mockGetConnection,
    },
}));

// Importamos la ruta después de configurar la simulación de la base de datos.
const { default: detallesRouter } = await import("../detallesCompra.js");

// Creamos una aplicación Express para probar los endpoints.
const app = express();
app.use(express.json());
app.use("/api/detalles-compra", detallesRouter);

// Datos ficticios reutilizables en las pruebas.
const detalleEjemplo = {
    id: 1,
    id_compra: 2,
    id_producto: 3,
    cantidad: 5,
    precio_unitario_momento: 10000,
    nombre_producto: "Producto de prueba",
};

// Preparamos la conexión simulada para las pruebas con transacciones.
function prepararConexion() {
    mockGetConnection.mockResolvedValue(mockConn);
    mockBeginTransaction.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRelease.mockImplementation(() => {});
}

describe("Pruebas del módulo detalles_compra", () => {
    beforeEach(() => {
        // Limpiamos los mocks antes de cada prueba.
        jest.resetAllMocks();

        // Configuramos nuevamente la conexión simulada.
        prepararConexion();

        // Evitamos mostrar los errores que se provocan intencionalmente.
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        // Restauramos los métodos simulados después de cada prueba.
        jest.restoreAllMocks();
    });

    // =========================================================
    // GET /
    // =========================================================
    describe("GET /", () => {
        test("debe listar todos los detalles", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app).get("/api/detalles-compra");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([detalleEjemplo]);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("ORDER BY d.id ASC"),
                []
            );
        });

        test("debe filtrar por compra y producto", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app)
                .get("/api/detalles-compra")
                .query({
                    id_compra: 2,
                    id_producto: 3,
                });

            expect(res.status).toBe(200);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining(
                    "d.id_compra = ? AND d.id_producto = ?"
                ),
                ["2", "3"]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .get("/api/detalles-compra")
                .query({
                    campo_invalido: "dato",
                });

            expect(res.status).toBe(200);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("campo_invalido"),
                []
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error de conexión")
            );

            const res = await request(app).get("/api/detalles-compra");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de conexión");
        });
    });

    // =========================================================
    // GET /:id
    // =========================================================
    describe("GET /:id", () => {
        test("debe retornar un detalle existente", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app).get("/api/detalles-compra/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(detalleEjemplo);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE d.id = ?"),
                ["1"]
            );
        });

        test("debe responder 404 si no existe el detalle", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/api/detalles-compra/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe(
                "Detalle de compra no encontrado"
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error de consulta")
            );

            const res = await request(app).get("/api/detalles-compra/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de consulta");
        });
    });

    // =========================================================
    // POST /
    // =========================================================
    describe("POST /", () => {
        test("debe crear un detalle y aumentar el stock", async () => {
            // Simulamos la búsqueda del producto, el ajuste del stock,
            // la inserción del detalle y la consulta del resultado.
            mockConn.query
                .mockResolvedValueOnce([[{ id: 3 }], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([{ insertId: 1 }, []])
                .mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app)
                .post("/api/detalles-compra")
                .send({
                    id_compra: 2,
                    id_producto: 3,
                    cantidad: 5,
                    precio_unitario_momento: 10000,
                });

            expect(res.status).toBe(201);
            expect(res.body.mensaje).toBe(
                "Detalle de compra creado exitosamente"
            );
            expect(res.body.id).toBe(1);
            expect(res.body.detalle).toEqual(detalleEjemplo);

            expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe crear el detalle con precio null si no se envía", async () => {
            mockConn.query
                // El producto existe.
                .mockResolvedValueOnce([[{ id: 3 }], []])
                // Se actualiza el inventario.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Se inserta el detalle.
                .mockResolvedValueOnce([{ insertId: 2 }, []])
                // Se consulta el detalle creado.
                .mockResolvedValueOnce([[
                    {
                        ...detalleEjemplo,
                        id: 2,
                        precio_unitario_momento: null,
                    },
                ], []]);

            const res = await request(app)
                .post("/api/detalles-compra")
                .send({
                    id_compra: 2,
                    id_producto: 3,
                    cantidad: 5,
                });

            expect(res.status).toBe(201);

            // El cuarto parámetro del INSERT debe ser null.
            expect(mockConn.query.mock.calls[2][1][3]).toBeNull();
        });

        test("debe rechazar campos requeridos faltantes", async () => {
            const res = await request(app)
                .post("/api/detalles-compra")
                .send({
                    id_compra: 2,
                    id_producto: 3,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(
                "Compra, producto y cantidad son campos requeridos"
            );
            expect(mockGetConnection).not.toHaveBeenCalled();
        });

        test.each([-1, "abc"])(
            "debe rechazar una cantidad inválida: %s",
            async (cantidad) => {
                const res = await request(app)
                    .post("/api/detalles-compra")
                    .send({
                        id_compra: 2,
                        id_producto: 3,
                        cantidad,
                    });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe(
                    "La cantidad debe ser un numero mayor a 0"
                );
                expect(mockGetConnection).not.toHaveBeenCalled();
            }
        );

        test("debe responder 404 y revertir si el producto no existe", async () => {
            mockConn.query.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .post("/api/detalles-compra")
                .send({
                    id_compra: 2,
                    id_producto: 999,
                    cantidad: 5,
                });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(
                new Error("Error de inventario")
            );

            const res = await request(app)
                .post("/api/detalles-compra")
                .send({
                    id_compra: 2,
                    id_producto: 3,
                    cantidad: 5,
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de inventario");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================
    // PUT /:id
    // =========================================================
    describe("PUT /:id", () => {
        test("debe actualizar el detalle y ajustar el stock", async () => {
            const detalleActualizado = {
                ...detalleEjemplo,
                cantidad: 8,
                precio_unitario_momento: 12000,
            };

            mockConn.query
                // Se consulta el detalle anterior.
                .mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                // Se descuenta el stock del producto anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Se busca el producto que quedará asociado.
                .mockResolvedValueOnce([[{ id: 3 }], []])
                // Se actualiza el stock del producto nuevo.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Se actualiza el detalle de compra.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            mockQuery.mockResolvedValueOnce([
                [detalleActualizado],
                [],
            ]);

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({
                    cantidad: 8,
                    precio_unitario_momento: 12000,
                });

            expect(res.status).toBe(200);
            expect(res.body.cantidad).toBe(8);
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe actualizar el detalle con precio null si no se envía", async () => {
            mockConn.query
                .mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[{ id: 3 }], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            mockQuery.mockResolvedValueOnce([[
                {
                    ...detalleEjemplo,
                    cantidad: 7,
                    precio_unitario_momento: null,
                },
            ], []]);

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({
                    cantidad: 7,
                });

            expect(res.status).toBe(200);
            expect(mockConn.query.mock.calls[4][1][3]).toBeNull();
        });

        test("debe conservar el precio enviado al actualizar el detalle", async () => {
            mockConn.query
                .mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[{ id: 3 }], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            mockQuery.mockResolvedValueOnce([[
                {
                    ...detalleEjemplo,
                    cantidad: 7,
                    precio_unitario_momento: 15000,
                },
            ], []]);

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({
                    cantidad: 7,
                    precio_unitario_momento: 15000,
                });

            expect(res.status).toBe(200);
            expect(mockConn.query.mock.calls[4][1][3]).toBe(15000);
        });

        test("debe conservar la cantidad anterior si no se envía una nueva", async () => {
            // Simulamos el detalle existente con 5 unidades.
            mockConn.query
                .mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                // Simulamos el ajuste del inventario anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Simulamos la búsqueda del producto.
                .mockResolvedValueOnce([[{ id: 3 }], []])
                // Simulamos la actualización del inventario.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Simulamos la actualización del detalle.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            // Simulamos la consulta final del detalle actualizado.
            mockQuery.mockResolvedValueOnce([[
                {
                    ...detalleEjemplo,
                    cantidad: 5,
                    precio_unitario_momento: null,
                },
            ], []]);

            // Omitimos cantidad para probar que se reutiliza la anterior.
            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({});

            expect(res.status).toBe(200);

            // La cantidad enviada al UPDATE debe ser 5.
            expect(mockConn.query.mock.calls[4][1][2]).toBe(5);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockConn.query.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .put("/api/detalles-compra/999")
                .send({
                    cantidad: 4,
                });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe(
                "Detalle de compra no encontrado"
            );
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test.each([0, -2, "abc"])(
            "debe rechazar una cantidad inválida al actualizar: %s",
            async (cantidad) => {
                mockConn.query.mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []]);

                const res = await request(app)
                    .put("/api/detalles-compra/1")
                    .send({
                        cantidad,
                    });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe(
                    "La cantidad debe ser un numero mayor a 0"
                );
                expect(mockRollback).toHaveBeenCalledTimes(1);
                expect(mockRelease).toHaveBeenCalledTimes(1);
            }
        );

        test("debe responder 404 y revertir si el nuevo producto no existe", async () => {
            mockConn.query
                .mockResolvedValueOnce([[
                    {
                        id_compra: 2,
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({
                    id_producto: 999,
                    cantidad: 7,
                });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(
                new Error("Error al actualizar")
            );

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({
                    cantidad: 7,
                });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al actualizar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================
    // DELETE /:id
    // =========================================================
    describe("DELETE /:id", () => {
        test("debe eliminar el detalle y descontar el stock", async () => {
            mockConn.query
                .mockResolvedValueOnce([[
                    {
                        id_producto: 3,
                        cantidad: 5,
                    },
                ], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app).delete(
                "/api/detalles-compra/1"
            );

            expect(res.status).toBe(200);
            expect(res.body.mensaje).toBe(
                "Detalle de compra eliminado exitosamente"
            );
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockConn.query.mockResolvedValueOnce([[], []]);

            const res = await request(app).delete(
                "/api/detalles-compra/999"
            );

            expect(res.status).toBe(404);
            expect(res.body.error).toBe(
                "Detalle de compra no encontrado"
            );
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(
                new Error("Error al eliminar")
            );

            const res = await request(app).delete(
                "/api/detalles-compra/1"
            );

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al eliminar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });
});
