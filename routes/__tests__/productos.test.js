import request from "supertest";
import express from "express";
import productosRouter from "../productos.js";

// Simulamos la conexión a la BD (usa __mocks__/db.js).
// Así las pruebas no necesitan conectarse a MySQL.
jest.mock("../../db.js");
import pool from "../../db.js";

const mockQuery = pool.query;

const app = express();
app.use(express.json());
app.use("/", productosRouter);

// Producto válido para reutilizarlo en POST y PUT.
const productoEjemplo = {
    id: 1,
    img_producto: "producto.jpg",
    nombre_producto: "Bicicleta MTB",
    descripcion: "Bicicleta de montaña",
    color_producto: "Negro",
    marca_producto: "GW",
    cant_producto: 10,
    modelo: "2026",
    id_talla: 1,
    id_medida: 1,
    id_proveedor: 2,
    id_local: 1,
    valor_unitario: 850000,
    estado: "activo",
};

// Datos válidos para crear o reemplazar un producto.
const datosProducto = {
    img_producto: "producto.jpg",
    nombre_producto: "Bicicleta MTB",
    descripcion: "Bicicleta de montaña",
    color_producto: "Negro",
    marca_producto: "GW",
    cant_producto: 10,
    modelo: "2026",
    id_talla: 1,
    id_proveedor: 2,
    id_local: 1,
    valor_unitario: 850000,
    estado: "activo",
};

beforeEach(() => {
    // Limpia los resultados y llamadas de cada prueba.
    jest.resetAllMocks();

    // Evita mostrar errores esperados durante las pruebas.
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    // Restaura console.error después de cada prueba.
    jest.restoreAllMocks();
});

describe("Pruebas del módulo productos", () => {
    // ---------------------------------------------------------
    // GET /
    // ---------------------------------------------------------
    describe("GET /", () => {
        test("debe listar los productos", async () => {
            mockQuery.mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app).get("/");

            expect(res.status).toBe(200);
            expect(res.body).toEqual([productoEjemplo]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("FROM productos"),
                []
            );
        });

        test("debe buscar productos por texto", async () => {
            mockQuery.mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ search: "bicicleta" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("nombre_producto LIKE ?"),
                [
                    "%bicicleta%",
                    "%bicicleta%",
                    "%bicicleta%",
                    "%bicicleta%",
                ]
            );
        });

        test("debe ignorar una búsqueda vacía", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/").query({ search: "" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("WHERE"),
                []
            );
        });

        test("debe rechazar search cuando no es texto", async () => {
            const res = await request(app)
                .get("/")
                .query({ search: ["bicicleta", "camiseta"] });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: "search debe ser texto" });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe filtrar por estado y proveedor", async () => {
            mockQuery.mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ estado: "activo", id_proveedor: "2" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("estado = ? AND id_proveedor = ?"),
                ["activo", "2"]
            );
        });

        test("debe ignorar filtros no permitidos", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .get("/")
                .query({ nombre_producto: "Bicicleta MTB" });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.not.stringContaining("WHERE"),
                []
            );
        });

        // Comprueba que los filtros de ID rechacen valores inválidos.
        test.each([
            ["id_talla", "0"],
            ["id_proveedor", "-2"],
            ["id_local", "1.5"],
            ["id_talla", "abc"],
        ])("debe rechazar el filtro inválido %s=%s", async (campo, valor) => {
            const res = await request(app)
                .get("/")
                .query({ [campo]: valor });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(
                `${campo} debe ser un número entero positivo`
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe rechazar filtros de texto que no sean texto", async () => {
            const res = await request(app)
                .get("/")
                .query({ estado: ["activo", "inactivo"] });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: "estado debe ser texto" });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Comprueba los filtros permitidos individualmente.
        test.each([
            ["marca_producto", "GW"],
            ["color_producto", "Negro"],
            ["modelo", "2026"],
            ["id_talla", "1"],
            ["id_local", "1"],
        ])("debe filtrar correctamente por %s", async (campo, valor) => {
            mockQuery.mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app)
                .get("/")
                .query({ [campo]: valor });

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining(`${campo} = ?`),
                [valor]
            );
        });

        // Se envían dos valores para asegurar que Express reciba un array.
        // Un array no es válido para estos filtros de texto.
        test.each([
            ["marca_producto", ["GW", "Trek"]],
            ["color_producto", ["Negro", "Rojo"]],
            ["modelo", ["2026", "2025"]],
        ])(
            "debe rechazar el filtro %s cuando no es texto",
            async (campo, valor) => {
                const res = await request(app)
                    .get("/")
                    .query({ [campo]: valor });

                expect(res.status).toBe(400);
                expect(res.body).toEqual({
                    error: `${campo} debe ser texto`,
                });
                expect(mockQuery).not.toHaveBeenCalled();
            }
        );

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app).get("/");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error de consulta" });
        });
    });

    // ---------------------------------------------------------
    // GET /:id
    // ---------------------------------------------------------
    describe("GET /:id", () => {
        test("debe obtener un producto por ID", async () => {
            mockQuery.mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app).get("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual(productoEjemplo);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = ?"),
                ["1"]
            );
        });

        test.each(["0", "-1", "abc", "1.5"])(
            "debe rechazar el ID inválido %s",
            async (id) => {
                const res = await request(app).get(`/${id}`);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({
                    error: "El ID del producto debe ser un número entero positivo",
                });
                expect(mockQuery).not.toHaveBeenCalled();
            }
        );

        test("debe responder 404 si el producto no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app).get("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Producto no encontrado" });
        });

        test("debe responder 500 si falla la consulta", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al consultar"));

            const res = await request(app).get("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al consultar" });
        });
    });

    // ---------------------------------------------------------
    // POST /
    // ---------------------------------------------------------
    describe("POST /", () => {
        test("debe crear un producto y devolverlo", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 10 }, []])
                .mockResolvedValueOnce([[
                    { ...productoEjemplo, id: 10 },
                ], []]);

            const res = await request(app)
                .post("/")
                .send(datosProducto);

            expect(res.status).toBe(201);
            expect(res.body.mensaje).toBe("Producto creado exitosamente");
            expect(res.body.id).toBe(10);
            expect(res.body.producto).toEqual({
                ...productoEjemplo,
                id: 10,
            });

            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining("INSERT INTO productos"),
                [
                    datosProducto.img_producto,
                    datosProducto.nombre_producto,
                    datosProducto.descripcion,
                    datosProducto.color_producto,
                    datosProducto.marca_producto,
                    datosProducto.cant_producto,
                    datosProducto.modelo,
                    datosProducto.id_talla,
                    datosProducto.id_proveedor,
                    datosProducto.id_local,
                    datosProducto.valor_unitario,
                    datosProducto.estado,
                ]
            );
        });

        test("debe aceptar id_medida como alternativa a id_talla", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 11 }, []])
                .mockResolvedValueOnce([[
                    { ...productoEjemplo, id: 11 },
                ], []]);

            const { id_talla, ...datos } = datosProducto;
            datos.id_medida = 1;

            const res = await request(app).post("/").send(datos);

            expect(res.status).toBe(201);
            expect(mockQuery.mock.calls[0][1][7]).toBe(1);
        });

        // Verifica que los campos opcionales reciban sus valores
        // predeterminados cuando no se incluyen en el cuerpo.
        test("debe aplicar valores predeterminados para campos opcionales", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 12 }, []])
                .mockResolvedValueOnce([[
                    {
                        ...productoEjemplo,
                        id: 12,
                        cant_producto: 0,
                        estado: "activo",
                    },
                ], []]);

            const datos = {
                nombre_producto: "Producto nuevo",
                marca_producto: "Marca",
                modelo: "Modelo",
                id_talla: 1,
                id_proveedor: 2,
                valor_unitario: 1000,
            };

            const res = await request(app).post("/").send(datos);

            expect(res.status).toBe(201);

            expect(mockQuery.mock.calls[0][1]).toEqual([
                null,
                "Producto nuevo",
                null,
                null,
                "Marca",
                0,
                "Modelo",
                1,
                2,
                null,
                1000,
                "activo",
            ]);

            expect(res.body.producto.cant_producto).toBe(0);
            expect(res.body.producto.estado).toBe("activo");
        });

        test("debe rechazar un body que no sea un objeto", async () => {
            const res = await request(app).post("/").send([]);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "Los datos del producto deben enviarse como un objeto",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Debe rechazar cantidades negativas.
        test("debe rechazar una cantidad negativa", async () => {
            const res = await request(app)
                .post("/")
                .send({
                    ...datosProducto,
                    cant_producto: -1,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain(
                "cant_producto no puede ser negativo"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Debe rechazar precios negativos.
        test("debe rechazar un precio negativo", async () => {
            const res = await request(app)
                .post("/")
                .send({
                    ...datosProducto,
                    valor_unitario: -1,
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain(
                "valor_unitario no puede ser negativo"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Comprueba las validaciones de los campos con valores incorrectos.
        test.each([
            ["nombre_producto", { ...datosProducto, nombre_producto: "" }],
            ["id_talla", { ...datosProducto, id_talla: "1" }],
            ["id_proveedor", { ...datosProducto, id_proveedor: -1 }],
            ["cant_producto", { ...datosProducto, cant_producto: -1 }],
            ["valor_unitario", { ...datosProducto, valor_unitario: "100" }],
            ["estado", { ...datosProducto, estado: "pendiente" }],
            ["marca_producto", { ...datosProducto, marca_producto: 123 }],
        ])("debe rechazar datos inválidos en %s", async (_campo, datos) => {
            const res = await request(app).post("/").send(datos);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles.length).toBeGreaterThan(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Solo se prueban como obligatorios los campos que el router exige.
        // estado y cant_producto son opcionales y tienen valores predeterminados.
        test.each([
            [
                "nombre_producto",
                (({ nombre_producto, ...datos }) => datos)(datosProducto),
            ],
            [
                "id_talla",
                (({ id_talla, ...datos }) => datos)(datosProducto),
            ],
            [
                "id_proveedor",
                (({ id_proveedor, ...datos }) => datos)(datosProducto),
            ],
            [
                "valor_unitario",
                (({ valor_unitario, ...datos }) => datos)(datosProducto),
            ],
        ])("debe rechazar la ausencia de %s", async (_campo, datos) => {
            const res = await request(app)
                .post("/")
                .send(datos);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles.length).toBeGreaterThan(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // El ID local opcional, si se envía, debe ser entero positivo.
        test("debe rechazar id_local si no es un entero", async () => {
            const res = await request(app)
                .post("/")
                .send({ ...datosProducto, id_local: 1.5 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles.length).toBeGreaterThan(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // El estado debe enviarse como texto si se proporciona.
        test("debe rechazar un estado que no sea texto", async () => {
            const res = await request(app)
                .post("/")
                .send({ ...datosProducto, estado: 123 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain("estado debe ser texto");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 500 si falla la inserción", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al insertar"));

            const res = await request(app).post("/").send(datosProducto);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al insertar" });
        });

        test("debe responder 500 si falla la consulta posterior a la creación", async () => {
            mockQuery
                .mockResolvedValueOnce([{ insertId: 10 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar creado"));

            const res = await request(app).post("/").send(datosProducto);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al consultar creado" });
        });
    });

    // ---------------------------------------------------------
    // PUT /:id
    // ---------------------------------------------------------
    describe("PUT /:id", () => {
        test("debe actualizar un producto completo", async () => {
            mockQuery
                .mockResolvedValueOnce([[{ id: 1 }], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app)
                .put("/1")
                .send(datosProducto);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(productoEjemplo);
            expect(mockQuery).toHaveBeenCalledTimes(3);
            expect(mockQuery.mock.calls[1][0]).toContain("UPDATE productos SET");
        });

        // Cubre la validación de un body que no sea un objeto en PUT.
        test("debe rechazar un body que no sea un objeto", async () => {
            // PUT consulta primero si el producto existe.
            mockQuery.mockResolvedValueOnce([[{ id: 1 }], []]);

            const res = await request(app)
                .put("/1")
                .send([]);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "Los datos del producto deben enviarse como un objeto",
            });
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        test("debe rechazar un ID inválido", async () => {
            const res = await request(app)
                .put("/abc")
                .send(datosProducto);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "El ID del producto debe ser un número entero positivo",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 404 si el producto no existe", async () => {
            mockQuery.mockResolvedValueOnce([[], []]);

            const res = await request(app)
                .put("/999")
                .send(datosProducto);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Producto no encontrado" });
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        test("debe rechazar datos inválidos", async () => {
            mockQuery.mockResolvedValueOnce([[{ id: 1 }], []]);

            const res = await request(app)
                .put("/1")
                .send({ ...datosProducto, id_proveedor: "2" });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });

        // estado es opcional en el router: si se omite, debe quedar en "activo".
        test("debe usar estado activo cuando no se envía estado al actualizar", async () => {
            mockQuery
                // Primera consulta: comprobar que el producto exista.
                .mockResolvedValueOnce([[{ id: 1 }], []])
                // Segunda consulta: ejecutar la actualización.
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                // Tercera consulta: devolver el producto actualizado.
                .mockResolvedValueOnce([[
                    { ...productoEjemplo, estado: "activo" },
                ], []]);

            const { estado, ...datosSinEstado } = datosProducto;

            const res = await request(app)
                .put("/1")
                .send(datosSinEstado);

            expect(res.status).toBe(200);
            expect(res.body.estado).toBe("activo");

            // El penúltimo parámetro de UPDATE corresponde al estado;
            // el último corresponde al ID del producto.
            const parametrosUpdate = mockQuery.mock.calls[1][1];

            expect(parametrosUpdate[parametrosUpdate.length - 2]).toBe("activo");
            expect(parametrosUpdate[parametrosUpdate.length - 1]).toBe("1");
            expect(mockQuery).toHaveBeenCalledTimes(3);
        });

        test("debe responder 500 si falla la consulta inicial", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error de consulta"));

            const res = await request(app)
                .put("/1")
                .send(datosProducto);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error de consulta" });
        });

        test("debe responder 500 si falla la actualización", async () => {
            mockQuery
                .mockResolvedValueOnce([[{ id: 1 }], []])
                .mockRejectedValueOnce(new Error("Error al actualizar"));

            const res = await request(app)
                .put("/1")
                .send(datosProducto);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al actualizar" });
        });

        test("debe responder 500 si falla la consulta posterior", async () => {
            mockQuery
                .mockResolvedValueOnce([[{ id: 1 }], []])
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockRejectedValueOnce(new Error("Error al consultar actualizado"));

            const res = await request(app)
                .put("/1")
                .send(datosProducto);

            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: "Error al consultar actualizado",
            });
        });
    });

    // ---------------------------------------------------------
    // PATCH /:id
    // ---------------------------------------------------------
    describe("PATCH /:id", () => {
        test("debe actualizar solo los campos enviados", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[
                    { ...productoEjemplo, estado: "inactivo" },
                ], []]);

            const res = await request(app)
                .patch("/1")
                .send({ estado: "inactivo" });

            expect(res.status).toBe(200);
            expect(res.body.estado).toBe("inactivo");
            expect(mockQuery).toHaveBeenNthCalledWith(
                1,
                "UPDATE productos SET estado = ? WHERE id = ?",
                ["inactivo", "1"]
            );
        });

        test("debe aceptar id_medida como alternativa a id_talla", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[productoEjemplo], []]);

            const res = await request(app)
                .patch("/1")
                .send({ id_medida: 3 });

            expect(res.status).toBe(200);
            expect(mockQuery.mock.calls[0][1]).toEqual([3, "1"]);
            expect(mockQuery.mock.calls[0][0]).toContain("id_talla = ?");
        });

        test("debe rechazar un ID inválido", async () => {
            const res = await request(app)
                .patch("/0")
                .send({ estado: "activo" });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "El ID del producto debe ser un número entero positivo",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe rechazar un body que no sea un objeto", async () => {
            const res = await request(app).patch("/1").send([]);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "Los datos deben enviarse como un objeto",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe rechazar una solicitud sin campos para actualizar", async () => {
            const res = await request(app).patch("/1").send({});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "No se enviaron campos para actualizar",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe rechazar valores inválidos", async () => {
            const res = await request(app)
                .patch("/1")
                .send({ cant_producto: -5 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain(
                "cant_producto no puede ser negativo"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // La cantidad debe ser un entero y no puede enviarse como texto.
        test.each([
            ["texto", "10"],
            ["decimal", 2.5],
        ])("debe rechazar una cantidad de tipo %s", async (_tipo, cantidad) => {
            const res = await request(app)
                .patch("/1")
                .send({ cant_producto: cantidad });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles.length).toBeGreaterThan(0);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // El precio debe ser numérico.
        test("debe rechazar un precio que no sea numérico", async () => {
            const res = await request(app)
                .patch("/1")
                .send({ valor_unitario: "1000" });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain(
                "valor_unitario debe ser un número"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // Envía JSON directamente para que 1e309 llegue como Infinity
        // después de que Express lo analice.
        test("debe rechazar un precio que no sea un número finito", async () => {
            const res = await request(app)
                .patch("/1")
                .set("Content-Type", "application/json")
                .send('{"valor_unitario":1e309}');

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain(
                "valor_unitario debe ser un número válido"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        // El estado se valida sin distinguir entre mayúsculas y minúsculas.
        test("debe aceptar un estado escrito en mayúsculas", async () => {
            mockQuery
                .mockResolvedValueOnce([{ affectedRows: 1 }, []])
                .mockResolvedValueOnce([[
                    { ...productoEjemplo, estado: "ACTIVO" },
                ], []]);

            const res = await request(app)
                .patch("/1")
                .send({ estado: "ACTIVO" });

            expect(res.status).toBe(200);
            expect(mockQuery.mock.calls[0][1]).toEqual(["ACTIVO", "1"]);
        });

        // El estado debe ser texto.
        test("debe rechazar un estado que no sea texto", async () => {
            const res = await request(app)
                .patch("/1")
                .send({ estado: 123 });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe("Datos del producto inválidos");
            expect(res.body.detalles).toContain("estado debe ser texto");
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 404 si no se actualiza ningún producto", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app)
                .patch("/999")
                .send({ estado: "inactivo" });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Producto no encontrado" });
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
        test("debe eliminar un producto existente", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

            const res = await request(app).delete("/1");

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                mensaje: "Producto eliminado exitosamente",
            });
            expect(mockQuery).toHaveBeenCalledWith(
                "DELETE FROM productos WHERE id = ?",
                ["1"]
            );
        });

        test("debe rechazar un ID inválido", async () => {
            const res = await request(app).delete("/abc");

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                error: "El ID del producto debe ser un número entero positivo",
            });
            expect(mockQuery).not.toHaveBeenCalled();
        });

        test("debe responder 404 si el producto no existe", async () => {
            mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

            const res = await request(app).delete("/999");

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "Producto no encontrado" });
        });

        test("debe responder 500 si falla la eliminación", async () => {
            mockQuery.mockRejectedValueOnce(new Error("Error al eliminar"));

            const res = await request(app).delete("/1");

            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Error al eliminar" });
        });
    });
});