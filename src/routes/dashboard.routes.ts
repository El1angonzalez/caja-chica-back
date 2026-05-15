import { Router } from 'express';
import { verificarToken } from '../middlewares/auth';

import {
  resumenDashboard,
  aportesDelMes,
  sociosMorosos,
  movimientosRecientes,
  ingresosPorMes,
  sociosNuevos,
  egresosPorMes
} from '../controllers/dashboardCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

// 🔥 1. RESUMEN (cards)
router.get(
  '/resumen',
  verificarToken,
  verificarRol(['TESORERO']),
  resumenDashboard
);

// 🔥 2. APORTES DEL MES
router.get(
  '/aportes-mes',
  verificarToken,
  verificarRol(['TESORERO']),
  aportesDelMes
);

// 🔥 3. SOCIOS MOROSOS
router.get(
  '/morosos',
  verificarToken,
  verificarRol(['TESORERO']),
  sociosMorosos
);

// 🔥 4. MOVIMIENTOS RECIENTES
router.get(
  '/movimientos',
  verificarToken,
  verificarRol(['TESORERO']),
  movimientosRecientes
);

// 🔥 5. INGRESOS POR MES (gráfica)
router.get(
  '/ingresos-mes',
  verificarToken,
  verificarRol(['TESORERO']),
  ingresosPorMes
);

// 🔥 6. SOCIOS NUEVOS
router.get(
  '/socios-nuevos',
  verificarToken,
  verificarRol(['TESORERO']),
  sociosNuevos
);

// 🔥 7. EGRESOS POR MES
router.get(
  '/egresos-mes',
  verificarToken,
  verificarRol(['TESORERO']),
  egresosPorMes
);

export default router;