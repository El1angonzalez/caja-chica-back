import { Request, Response } from 'express';
import { conmysql } from '../db';

export const listarCategoriasCaja = async (req: Request, res: Response): Promise<void> => {
  try {

    const sql = `SELECT  id_categoria, nombre, tipo FROM categoria_caja ORDER BY tipo, nombre`;

    const [rows]: any = await conmysql.query(sql);

    res.status(200).json({ mensaje: 'Categorías encontradas', data: rows });

  } catch (error) {
    console.error('Error al listar categorías:', error);
    res.status(500).json({ mensaje: 'Error al listar categorías' });
  }
};

export const registrarEgresoCaja = async (req: Request, res: Response) => {
  try {
    const id_usuario = (req as any).usuario.id_usuario;
    const id_grupo = (req as any).usuario.id_grupo;

    const { monto, descripcion, comprobante, id_categoria, fecha, tipo_pago } = req.body;

    if (!monto || !descripcion || !id_categoria || !fecha || !tipo_pago) {
      return res.status(400).json({
        mensaje: 'Faltan datos (monto, descripcion, id_categoria, fecha, tipo_pago)'
      });
    }

    if (isNaN(Date.parse(fecha))) {
      return res.status(400).json({ mensaje: 'Fecha inválida' });
    }

    if (!['EFECTIVO', 'TRANSFERENCIA'].includes(tipo_pago)) {
      return res.status(400).json({
        mensaje: 'Tipo de pago inválido (EFECTIVO o TRANSFERENCIA)'
      });
    }

    const sqlCategoria = `SELECT id_categoria, tipo, nombre FROM categoria_caja WHERE id_categoria = ?`;

    const [cat]: any = await conmysql.query(sqlCategoria, [id_categoria]);

    if (cat.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no existe' });
    }

    if (cat[0].tipo !== 'EGRESO') {
      return res.status(400).json({ mensaje: 'La categoría no es de EGRESO' });
    }

    if (cat[0].nombre === 'PRESTAMO') {
      return res.status(400).json({
        mensaje: 'No puedes registrar egresos manuales en categoría PRESTAMO'
      });
    }

    const sqlInsert = `
      INSERT INTO caja (
        id_grupo, id_usuario, tipo, id_categoria, id_origen, monto, tipo_pago, comprobante, descripcion, fecha
      )
      VALUES (?, ?, 'EGRESO', ?, NULL, ?, ?, ?, ?, ?)
    `;

    const [result]: any = await conmysql.query(sqlInsert, [
      id_grupo, id_usuario, id_categoria, monto, tipo_pago, comprobante || null, descripcion, fecha
    ]);

    return res.json({ mensaje: 'Egreso registrado correctamente', id_movimiento: result.insertId });

  } catch (error) {
    console.error('Error registrarEgresoCaja:', error);
    return res.status(500).json({ mensaje: 'Error al registrar egreso' });
  }
};

/* export const registrarEgresoCaja = async (req: Request, res: Response) => {
  try {
    const id_usuario = (req as any).usuario.id_usuario;
    const id_grupo = (req as any).usuario.id_grupo;

    const { monto, descripcion, comprobante, id_categoria, fecha } = req.body;

    // 🔴 validaciones básicas
    if (!monto || !descripcion || !id_categoria || !fecha) {
      return res.status(400).json({
        mensaje: 'Faltan datos (monto, descripcion, id_categoria, fecha)'
      });
    }

    if (isNaN(Date.parse(fecha))) {
      return res.status(400).json({ mensaje: 'Fecha inválida' });
    }

    // 🔥 validar que la categoría exista y sea EGRESO
    const [cat]: any = await conmysql.query(
      `SELECT id_categoria, tipo 
       FROM categoria_caja 
       WHERE id_categoria = ?`,
      [id_categoria]
    );

    if (cat.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no existe' });
    }

    if (cat[0].tipo !== 'EGRESO') {
      return res.status(400).json({ mensaje: 'La categoría no es de EGRESO' });
    }

    // 🔥 insertar egreso en caja
    const [result]: any = await conmysql.query(
      `INSERT INTO caja (
        id_grupo,
        id_usuario,
        tipo,
        id_categoria,
        id_origen,
        monto,
        tipo_pago,
        comprobante,
        descripcion,
        fecha
      )
      VALUES (?, ?, 'EGRESO', ?, NULL, ?, NULL, ?, ?, ?)`,
      [
        id_grupo,
        id_usuario,
        id_categoria,
        monto,
        comprobante || null,
        descripcion,
        fecha
      ]
    );

    return res.json({
      mensaje: 'Egreso registrado correctamente',
      id_movimiento: result.insertId
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({ mensaje: 'Error al registrar egreso' });
  }
}; */