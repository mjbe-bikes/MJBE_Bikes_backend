import request from "supertest";
import express from "express";
import detallesRouter from "../detallesCompra.js";

// Simulamos la base de datos para no modificar el inventario real.
jest.mock("../../db.js");
import pool from "../../db.js";

const mockQuery = pool.query;
const mockBeginTransaction = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockRelease = jest.fn();
const mockGetConnection = pool.getConnection;

const mockConn = {
    query: mockQuery,
    beginTransaction: mockBeginTransaction,
    commit: mockCommit,
    rollback: mockRollback,
    release: mockRelease,
};

const app = express();
app.use(express.json());
app.use("/api/detalles-compra", detallesRouter);

// Datos ficticios reutilizables.
const detalleEjemplo = {
    id: 1,
    id_compra: 2,
    id_producto: 3,
    cantidad: 5,
    precio_unitario_momento: 10000,
    nombre_producto: "Producto de prueba",
};

// Prepara la conexión simulada para las pruebas transaccionales.
function prepararConexion() {
    mockGetConnection.mockResolvedValue(mockConn);
    mockBeginTransaction.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRelease.mockImplementation(() => {});
}

describe("Pruebas del módulo detalles_compra", () => {
    beforeEach(() => {
        jest.resetAllMocks();
        prepararConexion();

        // Evita mostrar en consola los errores que probamos intencionalmente.
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

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
                .query({ id_compra: 2, id_producto: 3 });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("d.id_compra = ? AND d.id_producto = ?"),
                ["2", "3"]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .get("/api/detalles-compra")
                .query({ campo_invalido: "dato" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("campo_invalido"),
                []
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de conexión"));

            const res = await request(app).get("/api/detalles-compra");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de conexión");
        });
    });

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
            expect(res.body.error).toBe("Detalle de compra no encontrado");
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app).get("/api/detalles-compra/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de consulta");
        });
    });

    describe("POST /", () => {
        test("debe crear un detalle y aumentar el stock", async () => {
    mockConn.query
        .mockResolvedValueOnce([[{ id: 3 }], []]) // Busca el producto.
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Aumenta stock.
        .mockResolvedValueOnce([{ insertId: 1 }, []]) // Inserta el detalle.
        .mockResolvedValueOnce([[detalleEjemplo], []]); // Consulta final.

    const res = await request(app)
        .post("/api/detalles-compra")
        .send({
            id_compra: 2,
            id_producto: 3,
            cantidad: 5,
            precio_unitario_momento: 10000,
        });

    expect(res.status).toBe(201);
    expect(res.body.mensaje).toBe("Detalle de compra creado exitosamente");
    expect(res.body.id).toBe(1);
    expect(res.body.detalle).toEqual(detalleEjemplo);
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
});

        test("debe rechazar campos requeridos faltantes", async () => {
            const res = await request(app)
                .post("/api/detalles-compra")
                .send({ id_compra: 2, id_producto: 3 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(
                "Compra, producto y cantidad son campos requeridos"
            );
            expect(mockGetConnection).not.toHaveBeenCalled();
        });

        test.each([ -1, "abc"])(
            "debe rechazar una cantidad inválida: %s",
            async (cantidad) => {
                const res = await request(app)
                    .post("/api/detalles-compra")
                    .send({ id_compra: 2, id_producto: 3, cantidad });

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
                .send({ id_compra: 2, id_producto: 999, cantidad: 5 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(new Error("Error de inventario"));

            const res = await request(app)
                .post("/api/detalles-compra")
                .send({ id_compra: 2, id_producto: 3, cantidad: 5 });

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
                precio_unitario_momento: 12000,
            };

            mockConn.query
                .mockResolvedValueOnce([[
                    { id_compra: 2, id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle anterior.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Resta stock anterior.
                .mockResolvedValueOnce([[{ id: 3 }], []]) // Verifica producto.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Suma stock nuevo.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // Actualiza detalle.

            mockQuery.mockResolvedValueOnce([[detalleActualizado], []]);

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({ cantidad: 8, precio_unitario_momento: 12000 });

            expect(res.status).toBe(200);
            expect(res.body.cantidad).toBe(8);
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockConn.query.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .put("/api/detalles-compra/999")
                .send({ cantidad: 4 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Detalle de compra no encontrado");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test.each([0, -2, "abc"])(
            "debe rechazar una cantidad inválida al actualizar: %s",
            async (cantidad) => {
                mockConn.query.mockResolvedValueOnce([[
                    { id_compra: 2, id_producto: 3, cantidad: 5 },
                ], []]);

                const res = await request(app)
                    .put("/api/detalles-compra/1")
                    .send({ cantidad });

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
                    { id_compra: 2, id_producto: 3, cantidad: 5 },
                ], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Resta stock anterior.
                .mockResolvedValueOnce([[], []]); // No encuentra el nuevo producto.

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({ id_producto: 999, cantidad: 7 });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("El producto no existe");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockCommit).not.toHaveBeenCalled();
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(new Error("Error al actualizar"));

            const res = await request(app)
                .put("/api/detalles-compra/1")
                .send({ cantidad: 7 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al actualizar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });

    describe("DELETE /:id", () => {
        test("debe eliminar el detalle y descontar el stock", async () => {
            mockConn.query
                .mockResolvedValueOnce([[
                    { id_producto: 3, cantidad: 5 },
                ], []]) // Busca el detalle.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // Elimina detalle.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // Resta stock.

            const res = await request(app).delete("/api/detalles-compra/1");

            expect(res.status).toBe(200);
            expect(res.body.mensaje).toBe(
                "Detalle de compra eliminado exitosamente"
            );
            expect(mockCommit).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 404 si el detalle no existe", async () => {
            mockConn.query.mockResolvedValueOnce([[], []]);

            const res = await request(app).delete("/api/detalles-compra/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Detalle de compra no encontrado");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });

        test("debe responder 500 y revertir si falla una consulta", async () => {
            mockConn.query.mockRejectedValueOnce(new Error("Error al eliminar"));

            const res = await request(app).delete("/api/detalles-compra/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al eliminar");
            expect(mockRollback).toHaveBeenCalledTimes(1);
            expect(mockRelease).toHaveBeenCalledTimes(1);
        });
    });
});

