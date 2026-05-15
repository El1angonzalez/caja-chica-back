import { Router } from 'express';
import { verificarToken } from '../middlewares/auth';
import { aperturarAnioGlobal, aperturarAnioMeses, listarAnios, listarMeses, testActualizarFechas } from '../controllers/periodoCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

router.get('/listar-anios', verificarToken, verificarRol(['ADMIN', 'TESORERO', 'SOCIO']), listarAnios);
router.get('/listar-meses', verificarToken, verificarRol(['ADMIN', 'TESORERO', 'SOCIO']), listarMeses);
router.post('/aperturar-anio', verificarToken, verificarRol(['ADMIN']), aperturarAnioGlobal);
router.post('/apertura-prueba', aperturarAnioMeses);
router.get("/test-asamblea", testActualizarFechas);
/* router.post('/apertura-prueba', verificarToken, verificarRol(['ADMIN']), aperturarAnioMeses); */
export default router;
