import { Router } from 'express';
import { verificarToken } from '../middlewares/auth';
import { editarSocio, listarSocios, obtenerMiProximoPago, listarMisAportes, obtenerSocioPorId, registrarSocio, listarAportesGrupo } from '../controllers/sociosCtrl';
import { verificarRol } from '../middlewares/roles';

const router = Router();

router.get('/apotes-grupo', verificarToken, verificarRol(['TESORERO', 'SOCIO']), listarAportesGrupo);
router.get('/mis-aportes', verificarToken, verificarRol(['SOCIO', 'TESORERO']), listarMisAportes);
router.get('/mi-proximo-pago', verificarToken, verificarRol(['SOCIO', 'TESORERO']), obtenerMiProximoPago);
router.post('/registrar-socios', verificarToken, verificarRol(['ADMIN', 'TESORERO']), registrarSocio);
router.put('/editar-socio/:id_socio', verificarToken, verificarRol(['ADMIN', 'TESORERO']), editarSocio);
router.get('/listar-socios', verificarToken, verificarRol(['ADMIN', 'TESORERO']), listarSocios);
router.get('/socio/:id_socio', verificarToken, verificarRol(['ADMIN', 'TESORERO']), obtenerSocioPorId);

export default router;
