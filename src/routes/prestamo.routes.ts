import { Router } from 'express';

import { verificarToken } from '../middlewares/auth';
import {
  listarMisPrestamos,
  listarPrestamos,
  pagarCuota,
  prestamosPorSocio,
  registrarPrestamo,
  verCuotas,
  listarMisCuotas
} from '../controllers/prestamoCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

router.get('/mis-cuotas', verificarToken, verificarRol(['SOCIO']), listarMisCuotas);
router.get('/mis-prestamos', verificarToken, verificarRol(['SOCIO']), listarMisPrestamos);
router.post('/prestamos', verificarToken, verificarRol(['TESORERO']), registrarPrestamo);
router.get('/prestamos', verificarToken, listarPrestamos);
router.get('/prestamos/:id_prestamo/cuotas', verificarToken, verificarRol(['TESORERO', 'SOCIO']), verCuotas);
router.get('/socios/:id_socio/prestamos', verificarToken, verificarRol(['TESORERO', 'SOCIO']), prestamosPorSocio);
router.post('/prestamos/cuotas/pago', verificarToken, verificarRol(['TESORERO']), pagarCuota);
export default router;