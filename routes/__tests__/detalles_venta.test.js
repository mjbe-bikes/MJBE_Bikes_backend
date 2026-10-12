import { jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Simula la base de datos y la conexión transaccional.
const mockQuery = jest.fn();
const mockBeginTransaction = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockRelease = jest.fn();
const mockGetConnection = jest.fn();

const mockConn = {
    query: mockQuery,
    beginTransaction: mockBeginTransaction,
    commit: mockCommit,
    rollback: mockRollback,
    release: mockRelease,
};

// Sustituye db.js para evitar acceder a la base de datos real.
jest.unstable_mockModule("../../db.js", () => ({
    default: {
        query: mockQuery,
        getConnection: mockGetConnection,
    },
}));

// Importa la ruta después de configurar el mock.
const { default: detallesRouter } = await import("../detallesVenta.js");

const app = express();
app.use(express.json());
app.use("/api/detalles-venta", detallesRouter);

// Datos ficticios para las pruebas.
const detalleEjemplo = {
    id: 1,
    id_venta: 2,
    id_producto: 3,
    cantidad: 5,
    precio_unitario_momento: 10000,
    nombre_producto: "Producto de prueba",
};

// Prepara una conexión simulada nueva para cada prueba.
function prepararConexion() {
    mockGetConnection.mockResolvedValue(mockConn);
    mockBeginTransaction.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRelease.mockImplementation(() => {});
}

describe("Pruebas del módulo detallesVenta", () => {
    beforeEach(() => {
        // Limpia llamadas y resultados pendientes entre pruebas.
        jest.resetAllMocks();
        prepararConexion();

        // Oculta errores esperados durante las pruebas.
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("GET /", () => {
        test("debe listar todos los detalles de venta", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app).get("/api/detalles-venta");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([detalleEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("ORDER BY d.id ASC"),
                []
            );
        });

        test("debe filtrar por venta y producto", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app)
                .get("/api/detalles-venta")
                .query({ id_venta: 2, id_producto: 3 });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("d.id_venta = ? AND d.id_producto = ?"),
                ["2", "3"]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .get("/api/detalles-venta")
                .query({ campo_invalido: "dato" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("campo_invalido"),
                []
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de conexión"));

            const res = await request(app).get("/api/detalles-venta");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de conexión");
        });
    });

    describe("GET /:id", () => {
        test("debe retornar un detalle existente", async () => {
            mockQuery.mockResolvedValueOnce([[detalleEjemplo], []]);

            const res = await request(app).get("/api/detalles-venta/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(detalleEjemplo);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE d.id = ?"),
                ["1"]
            );
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/api/detalles-venta/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Detalle de venta no encontrado");
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app).get("/api/detalles-venta/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de consulta");
        });
    });

    describe("POST /", () => {
        test("debe crear el detalle y descontar el stock", async () => {
            mockQuery
                .mockResolvedValueOnce([[{
                    nombre_producto: "Producto de prueba",
                    cant_producto: 20,
                }], []]) // Busca el producto.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Descuenta stock.
                .mockResolvedValueOnce([{ insertId: 10 }, []]) // Inserta el detalle.
                .mockResolvedValueOnce([[{ ...detalleEjemplo, id: 10 }], []]); // Consulta final.

            const res = await request(app)
                .post("/api/detalles-venta")
                .send({
                    id_venta: 2,
                    id_producto: 3,
                    cantidad: 5,
                    precio_unitario_momento: 10000,
                });

            expect(res.status).toBe(201);
            expect(res.body.mensaje).toBe("Detalle de venta creado exitosamente");
            expect(res.body.id).toBe(10);
            expect(res.body.detalle.id).toBe(10);
            expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe rechazar campos requeridos faltantes", async () => {
            const res = await request(app)
                .post("/api/detalles-venta")
                .send({ id_venta: 2, id_producto: 3 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(
                "Venta, producto y cantidad son campos requeridos"
            );
            expect(mockGetConnection).not.toHaveBeenCalled();
        });

        test.each([-1, "abc"])(
            "debe rechazar una cantidad inválida: %s",
            async (cantidad) => {
                const res = await request(app)
                    .post("/api/detalles-venta")
                    .send({ id_venta: 2, id_producto: 3, cantidad });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe(
                    "La cantidad debe ser un numero mayor a 0"
                );
                expect(mockGetConnection).not.toHaveBeenCalled();
            }
        );

        test("debe responder 404 si el producto no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .post("/api/detalles-venta")
                .send({ id_venta: 2, id_producto: 999, cantidad: 5 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe rechazar una venta cuando el stock es insuficiente", async () => {
            mockQuery.mockResolvedValueOnce([[
                { nombre_producto: "Producto de prueba", cant_producto: 2 },
            ], []]);

            const res = await request(app)
                .post("/api/detalles-venta")
                .send({ id_venta: 2, id_producto: 3, cantidad: 5 });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Stock insuficiente");
            expect(res.body.error).toContain("disponible: 2");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de inventario"));

            const res = await request(app)
                .post("/api/detalles-venta")
                .send({ id_venta: 2, id_producto: 3, cantidad: 5 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de inventario");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });

    describe("PUT /:id", () => {
        test("debe actualizar el detalle y ajustar el stock", async () => {
            const detalleActualizado = {
                ...detalleEjemplo,
                cantidad: 8,
            };

            mockQuery
                .mockResolvedValueOnce([[
                    { id_venta: 2, id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Repone stock anterior.
                .mockResolvedValueOnce([[
                    { nombre_producto: "Producto de prueba", cant_producto: 20 },
                ], []]) // Verifica stock disponible.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Descuenta nuevo stock.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Actualiza el detalle.
                .mockResolvedValueOnce([[detalleActualizado], []]); // Consulta final.

            const res = await request(app)
                .put("/api/detalles-venta/1")
                .send({ cantidad: 8 });

            expect(res.status).toBe(200);
            expect(res.body.cantidad).toBe(8);
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .put("/api/detalles-venta/999")
                .send({ cantidad: 4 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Detalle de venta no encontrado");
            expect(mockRollback).toHaveBeenCalledTimes(1);
        });

        test.each([0, -2, "abc"])(
            "debe rechazar una cantidad inválida al actualizar: %s",
            async (cantidad) => {
                mockQuery.mockResolvedValueOnce([[
                    { id_venta: 2, id_producto: 3, cantidad: 5 },
                ], []]);

                const res = await request(app)
                    .put("/api/detalles-venta/1")
                    .send({ cantidad });

                expect(res.status).toBe(400);
                expect(res.body.error).toBe(
                    "La cantidad debe ser un numero mayor a 0"
                );
                expect(mockRollback).toHaveBeenCalledTimes(1);
                expect(mockRelease).toHaveBeenCalledTimes(1);
            }
        );

        test("debe revertir si no hay stock para el nuevo detalle", async () => {
            mockQuery
                .mockResolvedValueOnce([[
                    { id_venta: 2, id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Repone stock.
                .mockResolvedValueOnce([[
                    { nombre_producto: "Producto de prueba", cant_producto: 2 },
                ], []]); // Stock insuficiente para la nueva cantidad.

            const res = await request(app)
                .put("/api/detalles-venta/1")
                .send({ cantidad: 8 });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain("Stock insuficiente");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
        });

        test("debe responder 404 si el nuevo producto no existe", async () => {
            mockQuery
                .mockResolvedValueOnce([[
                    { id_venta: 2, id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Repone stock.
                .mockResolvedValueOnce([[], []]); // No encuentra el nuevo producto.

            const res = await request(app)
                .put("/api/detalles-venta/1")
                .send({ id_producto: 999, cantidad: 4 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al actualizar"));

            const res = await request(app)
                .put("/api/detalles-venta/1")
                .send({ cantidad: 7 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al actualizar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });

    describe("DELETE /:id", () => {
        test("debe eliminar el detalle y reponer el stock", async () => {
            mockQuery
                .mockResolvedValueOnce([[
                    { id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Elimina el detalle.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // Repone stock.

            const res = await request(app).delete("/api/detalles-venta/1");

            expect(res.status).toBe(200);
            expect(res.body.mensaje).toBe(
                "Detalle de venta eliminado exitosamente"
            );
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).delete("/api/detalles-venta/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Detalle de venta no encontrado");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al eliminar"));

            const res = await request(app).delete("/api/detalles-venta/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al eliminar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });
});

