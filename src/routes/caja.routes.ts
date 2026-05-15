import { Router } from 'express';

import { verificarToken } from '../middlewares/auth';
import { listarCategoriasCaja, registrarEgresoCaja } from '../controllers/cajaCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

router.post('/registrar-egreso', verificarToken, verificarRol(['TESORERO']), registrarEgresoCaja);
router.get('/listar-categoria', verificarToken, verificarRol(['TESORERO']), listarCategoriasCaja);


export default router;