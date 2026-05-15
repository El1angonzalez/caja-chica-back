import { Router } from 'express';
import { verificarToken } from '../middlewares/auth';
import { listarGrupos } from '../controllers/gruposCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

router.get('/listar-grupos', verificarToken, verificarRol(['ADMIN', 'TESORERO', 'SOCIO']), listarGrupos);

export default router;
