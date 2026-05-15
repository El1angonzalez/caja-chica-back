import { Response, NextFunction } from 'express';
import { conmysql } from '../db';

export const verificarRol = (rolesPermitidos: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    const usuario = req.usuario;

    if (!usuario?.perfiles) {
      return res.status(403).json({ mensaje: 'No se pudieron validar los roles' });
    }

    const permitido = rolesPermitidos.some(r =>
      usuario.perfiles.includes(r)
    );

    if (!permitido) {
      return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
    }

    next();
  };
};


export const verificarAccesoMenu = (codigo_menu: string) => {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const usuario = req.usuario;

      if (!usuario?.id_usuario) {
        return res.status(401).json({ mensaje: 'Usuario no autenticado' });
      }

      const [rows]: any = await conmysql.query(
        `
        SELECT 1
        FROM usuario_perfil up
        INNER JOIN acceso a ON up.id_perfil = a.id_perfil
        INNER JOIN menu m ON a.id_menu = m.id_menu
        WHERE up.id_usuario = ?
          AND m.url = ?
          AND m.estado = 'ACTIVO'
        LIMIT 1
        `,
        [usuario.id_usuario, codigo_menu]
      );

      if (rows.length === 0) {
        return res.status(403).json({ mensaje: 'No tienes acceso a este recurso' });
      }

      next();
    } catch (error) {
      console.error('Error en verificarAccesoMenu:', error);
      return res.status(500).json({ mensaje: 'Error al validar permisos' });
    }
  };
};