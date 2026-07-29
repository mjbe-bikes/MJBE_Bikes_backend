import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "./db.js";

// rutas

const app = express();
const PORT = process.env.PORT || 5000;

app.use (cors());
app.use(express.json());

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});

app.get ("/", (req, res) => {
    res.send("Bienvenido");
});