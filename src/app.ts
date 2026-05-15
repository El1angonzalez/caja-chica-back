import express, { Application, Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import path from "path";

// ---------------------- IMPORTACIÓN DE RUTAS ----------------------
import usuarioRoutes from "./routes/usuarios.routes";
import sociosRoutes from "./routes/socios.routes";
import gruposRoutes from "./routes/grupos.routes";
import aportesRoutes from "./routes/aportes.routes";
import periodoRoutes from "./routes/periodo.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import cajaRoutes from "./routes/caja.routes";
import prestamoRoutes from "./routes/prestamo.routes";
// ---------------------- CONFIGURACIÓN DE APP ----------------------
const app: Application = express();

const corsOptions: CorsOptions = {
  origin: ["http://localhost:5173"],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
};

app.use(cors(corsOptions));

app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ---------------------- PERMISSIONS POLICY ----------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Permissions-Policy", "fullscreen=(self)");
  next();
});


// ---------------------- SERVIR ARCHIVOS ESTÁTICOS ----------------------
app.use('/comprobantes', express.static(path.join(__dirname, '../uploads/comprobantes')));

// ---------------------- RUTAS DE LA API ----------------------
app.use("/api/auth", usuarioRoutes);
app.use("/api/socio", sociosRoutes);
app.use("/api/grupo", gruposRoutes);
app.use("/api/input", aportesRoutes);
app.use("/api/periodo", periodoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/prestamo', prestamoRoutes);

// ---------------------- MANEJO DE ERRORES ----------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    message: 'Endpoint not found'
  });
});

export default app;
