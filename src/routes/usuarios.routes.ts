import { Router } from 'express';
import { iniciarSesion, initUsuarios} from '../controllers/usuariosCtrl';

const router = Router();

router.post('/login', iniciarSesion);

router.post('/init-usuarios', initUsuarios);

export default router;
