import dotenv from "dotenv";
import app from "./app";
import { conmysql } from "./db";

dotenv.config();

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, async () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);

    try {
        const connection = await conmysql.getConnection();
        console.log("Conectado exitosamente a la base de datos.");
        connection.release();
    } catch (error: any) {
        console.error("No se pudo conectar a la base de datos:", error.message);
    }
});
