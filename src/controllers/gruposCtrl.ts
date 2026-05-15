import { Request, Response } from 'express';
import { conmysql } from '../db';

export const listarGrupos = async (req: Request, res: Response): Promise<void> => {
  try {
    const sql = `
      SELECT
        g.id_grupo,
        g.nombre,
        DATE_FORMAT(g.created_at, '%d/%m/%Y') AS fecha_creacion,
        g.estado,
        g.id_tesorero
      FROM grupo g
      WHERE g.estado = 'ACTIVO'
      ORDER BY g.nombre
    `;

    const [rows]: any = await conmysql.query(sql);

    res.status(200).json({ mensaje: 'Grupos encontrados', data: rows, });
  } catch (error) {
    console.error("Error al listar grupos:", error);
    res.status(500).json({ mensaje: "Error del servidor", error });
  }
};