import { Router } from 'express';
import { listarAportes, listarValorDeAporte, pagarAporte, pagarAportesSeleccionados } from '../controllers/aportesCtrl';
import { verificarToken } from '../middlewares/auth';

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verificarAccesoMenu, verificarRol } from '../middlewares/roles';
const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const ruta = 'uploads/comprobantes/';

    // 🔥 crear carpeta si no existe
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(ruta, { recursive: true });
    }

    cb(null, ruta);
  },
  filename: (req, file, cb) => {
    const nombreUnico = Date.now() + path.extname(file.originalname);
    cb(null, nombreUnico);
  }
});

const upload = multer({ storage });

router.get('/listar-aportes', verificarToken, verificarRol(['ADMIN', 'TESORERO']), listarAportes);
router.post('/pagar-aporte', verificarToken, verificarRol(['TESORERO']), verificarAccesoMenu('/aportes'),
  upload.single('comprobante'), pagarAporte);
router.post('/pagar-aporte-seleccionado', verificarToken, verificarRol(['TESORERO']), verificarAccesoMenu('/aportes'),
  upload.single('comprobante'), pagarAportesSeleccionados);
router.get('/listar-valor-aporte', verificarToken, verificarRol(['ADMIN', 'SOCIO', 'TESORERO']), listarValorDeAporte);

export default router;