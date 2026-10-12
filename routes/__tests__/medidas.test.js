
import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";

// Simulamos la base de datos para no modificar datos reales.
const mockQuery = jest.fn();

jest.unstable_mockModule("../../db.js", () => ({
    default: { query: mockQuery },
}));

// Importamos la ruta después de configurar el mock.
const { default: medidasRouter } = await import("../medidas.js");

const app = express();
app.use(express.json());
app.use("/", medidasRouter);

// Medida de ejemplo reutilizable.
const medidaEjemplo = {
    id: 1,
    tipo_medida: "Centímetros",
};

beforeEach(() => {
    jest.resetAllMocks();

    // Evitamos mostrar errores esperados en la consola.
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Pruebas del módulo medidas", () => {
    // ---------------------------------------------------------
    // GET /
    // ---------------------------------------------------------
    describe("GET /", () => {
        test("debe listar todas las medidas", async () => {
            mockQuery.mockResolvedValueOnce([[medidaEjemplo], []]);

            const res = await request(app).get("/");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([medidaEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("FROM medidas"),
                []
            );
        });

        test("debe buscar medidas por tipo_medida", async () => {
            mockQuery.mockResolvedValueOnce([[medidaEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ search: "Cent" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([medidaEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("tipo_medida LIKE ?"),
                ["%Cent%"]
            );
        });

        test("debe listar todas las medidas si search está vacío", async () => {
            mockQuery.mockResolvedValueOnce([[medidaEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ search: "" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("WHERE"),
                []
            );
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error al consultar medidas")
            );

            const res = await request(app).get("/");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al consultar medidas",
            });
        });
    });

    // ---------------------------------------------------------
    // GET /:id
    // ---------------------------------------------------------
    describe("GET /:id", () => {
        test("debe retornar una medida existente", async () => {
            mockQuery.mockResolvedValueOnce([[medidaEjemplo], []]);

            const res = await request(app).get("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(medidaEjemplo);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = ?"),
                ["1"]
            );
        });

        test("debe responder 404 si la medida no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                error: "Medida no encontrada",
            });
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error al consultar medida")
            );

            const res = await request(app).get("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al consultar medida",
            });
        });
    });

    // ---------------------------------------------------------
    // POST /
    // ---------------------------------------------------------
    describe("POST /", () => {
        test("debe crear una medida correctamente", async () => {
            mockQuery.mockResolvedValueOnce([{ insertId: 5 }, []]);

            const res = await request(app)
                .post("/")
                .send({ tipo_medida: "Metros" });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                mensaje: "Medida creada exitosamente",
                id: 5,
                medida: {
                    id: 5,
                    tipo_medida: "Metros",
                },
            });

            expect(mockQuery).toHaveBeenCalledWith(
                "INSERT INTO medidas (tipo_medida) VALUES (?)",
                ["Metros"]
            );
        });

        test.each([
            ["campo ausente", {}],
            ["cadena vacía", { tipo_medida: "" }],
            ["valor null", { tipo_medida: null }],
        ])("debe rechazar el tipo de medida cuando está vacío o falta (%s)", async (_caso, body) => {
            const res = await request(app).post("/").send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "El tipo de medida es un campo requerido",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 500 si falla la creación", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error al crear medida")
            );

            const res = await request(app)
                .post("/")
                .send({ tipo_medida: "Metros" });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al crear medida",
            });
        });
    });

    // ---------------------------------------------------------
    // PUT /:id
    // ---------------------------------------------------------
    describe("PUT /:id", () => {
        test("debe actualizar una medida existente", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app)
                .put("/1")
                .send({ tipo_medida: "Milímetros" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                id: 1,
                tipo_medida: "Milímetros",
            });

            expect(mockQuery).toHaveBeenCalledWith(
                "UPDATE medidas SET tipo_medida = ? WHERE id = ?",
                ["Milímetros", "1"]
            );
        });

        test("debe responder 404 si la medida no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app)
                .put("/999")
                .send({ tipo_medida: "Metros" });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                error: "Medida no encontrada",
            });
        });

        test("debe responder 500 si falla la actualización", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error al actualizar medida")
            );

            const res = await request(app)
                .put("/1")
                .send({ tipo_medida: "Metros" });

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al actualizar medida",
            });
        });
    });

    // ---------------------------------------------------------
    // DELETE /:id
    // ---------------------------------------------------------
    describe("DELETE /:id", () => {
        test("debe eliminar una medida existente", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app).delete("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                mensaje: "Medida eliminada exitosamente",
            });

            expect(mockQuery).toHaveBeenCalledWith(
                "DELETE FROM medidas WHERE id = ?",
                ["1"]
            );
        });

        test("debe responder 404 si la medida no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app).delete("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                error: "Medida no encontrada",
            });
        });

        test("debe responder 500 si falla la eliminación", async () => {
            mockQuery.mockRejectedValueOnce(
                new Error("Error al eliminar medida")
            );

            const res = await request(app).delete("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al eliminar medida",
            });
        });
    });
});