import request from "supertest";
import express from "express";
import comprasRouter from "../compras.js";

// Simulamos la conexión a la BD (usa __mocks__/db.js).
// Así las pruebas no necesitan conectarse a MySQL.
jest.mock("../../db.js");
import pool from "../../db.js";

const mockQuery = pool.query;

const app = express();
app.use(express.json());
app.use("/api/compras", comprasRouter);

// Compra de ejemplo reutilizada en las pruebas.
const compraEjemplo = {
    id: 1,
    id_proveedor: 2,
    fecha: "2026-10-12",
    total_compra: 150000,
    pago: false,
    proveedor: "Proveedor de prueba",
};

describe("Pruebas del módulo compras", () => {
    beforeEach(() => {
        mockQuery.mockReset();
        // Evita imprimir errores esperados durante las pruebas.
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // GET /: listar compras y aplicar filtros.
    describe("GET /", () => {
        test("debe retornar todas las compras", async () => {
            mockQuery.mockResolvedValueOnce([[compraEjemplo], []]);

            const res = await request(app).get("/api/compras");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([compraEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("ORDER BY co.fecha DESC, co.id DESC"),
                []
            );
        });

        test("debe filtrar por proveedor y pago", async () => {
            mockQuery.mockResolvedValueOnce([[compraEjemplo], []]);

            const res = await request(app)
                .get("/api/compras")
                .query({ id_proveedor: 2, pago: "0" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("co.id_proveedor = ? AND co.pago = ?"),
                ["2", "0"]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .get("/api/compras")
                .query({ campo_invalido: "dato" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("campo_invalido"),
                []
            );
        });

        test("debe retornar 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de conexión"));

            const res = await request(app).get("/api/compras");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de conexión");
        });
    });

    // GET /:id: buscar una compra específica.
    describe("GET /:id", () => {
        test("debe retornar la compra existente", async () => {
            mockQuery.mockResolvedValueOnce([[compraEjemplo], []]);

            const res = await request(app).get("/api/compras/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(compraEjemplo);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE co.id = ?"),
                ["1"]
            );
        });

        test("debe retornar 404 si la compra no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/api/compras/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Compra no encontrada");
        });

        test("debe retornar 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app).get("/api/compras/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error de consulta");
        });
    });

    // POST /: crear una compra y consultar el registro creado.
    describe("POST /", () => {
        test("debe crear una compra correctamente", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 10 }, []])
                .mockResolvedValueOnce([[{ ...compraEjemplo, id: 10 }], []]);

            const res = await request(app)
                .post("/api/compras")
                .send({
                    id_proveedor: 2,
                    total_compra: 150000,
                    pago: false,
                });

            expect(res.status).toBe(201);
            expect(res.body.mensaje).toBe("Compra creada exitosamente");
            expect(res.body.id).toBe(10);
            expect(res.body.compra.id).toBe(10);
            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining("INSERT INTO compras"),
                [2, 150000, false]
            );
        });

        test("debe permitir crear una compra con fecha", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 11 }, []])
                .mockResolvedValueOnce([[compraEjemplo], []]);

            const res = await request(app)
                .post("/api/compras")
                .send({
                    id_proveedor: 2,
                    fecha: "2026-10-12",
                    total_compra: 150000,
                    pago: true,
                });

            expect(res.status).toBe(201);

            const parametros = mockQuery.mock.calls[0][1];
            expect(parametros[0]).toBe(2);
            expect(parametros[1]).toBeInstanceOf(Date);
            expect(parametros[2]).toBe(150000);
            expect(parametros[3]).toBe(true);
        });

        test("debe rechazar una compra sin proveedor", async () => {
            const res = await request(app)
                .post("/api/compras")
                .send({ total_compra: 150000 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("El proveedor es un campo requerido");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe retornar 500 si falla el INSERT", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al insertar"));

            const res = await request(app)
                .post("/api/compras")
                .send({ id_proveedor: 2 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al insertar");
        });

        test("debe retornar 500 si falla la consulta posterior al INSERT", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 12 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar compra"));

            const res = await request(app)
                .post("/api/compras")
                .send({ id_proveedor: 2 });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al consultar compra");
        });
    });

    // PATCH /:id: actualizar solo los campos enviados.
    describe("PATCH /:id", () => {
        test("debe actualizar una compra existente", async () => {
            const compraActualizada = {
                ...compraEjemplo,
                total_compra: 200000,
            };

            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[compraActualizada], []]);

            const res = await request(app)
                .patch("/api/compras/1")
                .send({ total_compra: 200000 });

            expect(res.status).toBe(200);
            expect(res.body.total_compra).toBe(200000);
            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                "UPDATE compras SET total_compra = ? WHERE id = ?",
                [200000, "1"]
            );
        });

        test("debe convertir la fecha a Date al actualizar", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[compraEjemplo], []]);

            const res = await request(app)
                .patch("/api/compras/1")
                .send({ fecha: "2026-10-12" });

            expect(res.status).toBe(200);
            expect(mockQuery.mock.calls[0][1][0]).toBeInstanceOf(Date);
        });

        test("debe rechazar una actualización sin campos", async () => {
            const res = await request(app)
                .patch("/api/compras/1")
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(
                "No se enviaron campos para actualizar"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe retornar 404 si la compra no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app)
                .patch("/api/compras/999")
                .send({ pago: true });

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Compra no encontrada");
        });

        test("debe retornar 500 si falla la actualización", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al actualizar"));

            const res = await request(app)
                .patch("/api/compras/1")
                .send({ pago: true });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al actualizar");
        });

        test("debe retornar 500 si falla la consulta posterior", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar"));

            const res = await request(app)
                .patch("/api/compras/1")
                .send({ pago: true });

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al consultar");
        });
    });

    // DELETE /:id: eliminar una compra.
    describe("DELETE /:id", () => {
        test("debe eliminar una compra existente", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app).delete("/api/compras/1");

            expect(res.status).toBe(200);
            expect(res.body.mensaje).toBe("Compra eliminada exitosamente");
            expect(mockQuery).toHaveBeenCalledWith(
                "DELETE FROM compras WHERE id = ?",
                ["1"]
            );
        });

        test("debe retornar 404 si la compra no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app).delete("/api/compras/999");

            expect(res.status).toBe(404);
            expect(res.body.error).toBe("Compra no encontrada");
        });

        test("debe retornar 500 si falla la eliminación", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al eliminar"));

            const res = await request(app).delete("/api/compras/1");

            expect(res.status).toBe(500);
            expect(res.body.error).toBe("Error al eliminar");
        });
    });
});