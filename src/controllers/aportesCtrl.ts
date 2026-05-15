import { Request, Response } from 'express';
import { conmysql } from '../db';
import { resolverGrupoPermitido } from '../utils/scopes';

const obtenerNombreMes = (mes: number) => {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return meses[mes - 1] || 'Mes inválido';
};

export const pagarAportesSeleccionados = async (req: Request, res: Response): Promise<void> => {
  try {
    const { aportes, tipo_pago } = req.body;

    if (!Array.isArray(aportes) || aportes.length === 0) {
      res.status(400).json({ mensaje: 'Debe enviar aportes' });
      return;
    }

    if (!['EFECTIVO', 'TRANSFERENCIA'].includes(tipo_pago)) {
      res.status(400).json({ mensaje: 'Tipo de pago inválido' });
      return;
    }

    const id_usuario = (req as any).usuario?.id_usuario || 1;

    let comprobante: string | null = null;

    if (tipo_pago === 'TRANSFERENCIA') {
      comprobante = (req as any).file?.filename || null;

      if (!comprobante) {
        res.status(400).json({ mensaje: 'Debe subir comprobante' });
        return;
      }
    }

    const [rows]: any = await conmysql.query(
      `SELECT 
         a.id_aporte, 
         a.estado, 
         s.id_grupo,
         p.mes,
         p.anio
       FROM aporte a
       INNER JOIN socio s ON a.id_socio = s.id_socio
       INNER JOIN periodo p ON a.id_periodo = p.id_periodo
       WHERE a.id_aporte IN (?)`,
      [aportes]
    );

    if (rows.length !== aportes.length) {
      res.status(400).json({ mensaje: 'Algunos aportes no existen' });
      return;
    }

    const id_grupo = rows[0].id_grupo;

    for (const r of rows) {
      if (r.id_grupo !== id_grupo) {
        res.status(400).json({ mensaje: 'Aportes de diferentes grupos' });
        return;
      }
    }

    // 🔥 configuración aporte
    const [config]: any = await conmysql.query(
      `SELECT monto 
       FROM configuracion_aporte 
       WHERE id_grupo=? AND estado='ACTIVO' 
       LIMIT 1`,
      [id_grupo]
    );

    if (config.length === 0) {
      res.status(400).json({ mensaje: 'No hay configuración de aporte' });
      return;
    }

    const montoAporte = parseFloat(config[0].monto);

    // 🔥 categoría caja
    const [catRows]: any = await conmysql.query(
      `SELECT id_categoria 
       FROM categoria_caja 
       WHERE nombre = 'APORTE'
       LIMIT 1`
    );

    if (catRows.length === 0) {
      res.status(500).json({ mensaje: 'Categoría APORTE no configurada' });
      return;
    }

    const id_categoria = catRows[0].id_categoria;

    let total = 0;
    let montoTotal = 0;

    for (const aporte of rows) {

      if (aporte.estado === 'PAGADO') continue;

      const nombreMes = obtenerNombreMes(aporte.mes);

      const descripcion = `APORTE MENSUAL - ${nombreMes} ${aporte.anio}`;

      // 🔥 UPDATE con fecha del servidor
      await conmysql.query(
        `UPDATE aporte
         SET estado='PAGADO',
             fecha_pago=NOW(),
             id_usuario=?,
             tipo_pago=?
         WHERE id_aporte=?`,
        [id_usuario, tipo_pago, aporte.id_aporte]
      );

      // 🔥 INSERT caja con fecha del servidor
      await conmysql.query(
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
        VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id_grupo,
          id_usuario,
          id_categoria,
          aporte.id_aporte,
          montoAporte,
          tipo_pago,
          comprobante,
          descripcion
        ]
      );

      total++;
      montoTotal += montoAporte;
    }

    if (total === 0) {
      res.status(400).json({
        mensaje: 'Todos ya estaban pagados'
      });
      return;
    }

    res.json({ mensaje: 'Aportes pagados correctamente', data: { total_aportes: total, monto_total: montoTotal } });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};

export const pagarAporte = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_aporte, monto, tipo_pago, fecha_pago } = req.body;

    const montoNumero = parseFloat(monto);

    if (!id_aporte || isNaN(montoNumero) || !tipo_pago || !fecha_pago) {
      res.status(400).json({ mensaje: "Datos inválidos" });
      return;
    }

    if (!["EFECTIVO", "TRANSFERENCIA"].includes(tipo_pago)) {
      res.status(400).json({ mensaje: "Tipo de pago inválido" });
      return;
    }

    const fechaSQL = fecha_pago.replace("T", " ");

    const fecha = new Date(fechaSQL);

    if (isNaN(fecha.getTime())) {
      res.status(400).json({ mensaje: "Fecha inválida" });
      return;
    }

    const [rows]: any = await conmysql.query(
      `SELECT a.estado, s.id_grupo
       FROM aporte a
       INNER JOIN socio s ON a.id_socio = s.id_socio
       WHERE a.id_aporte = ?`,
      [id_aporte]
    );

    if (rows.length === 0) {
      res.status(404).json({
        mensaje: "Aporte no encontrado",
      });
      return;
    }

    const aporte = rows[0];

    if (aporte.estado === "PAGADO") {
      res.status(400).json({
        mensaje: "El aporte ya está pagado",
      });
      return;
    }

    const id_usuario = (req as any).usuario?.id_usuario || 1;

    let comprobante: string | null = null;

    if (tipo_pago === "TRANSFERENCIA") {
      comprobante = (req as any).file?.filename || null;

      if (!comprobante) {
        res.status(400).json({
          mensaje: "Debe subir comprobante para transferencia",
        });
        return;
      }
    }

    await conmysql.query(
      `UPDATE aporte
       SET estado='PAGADO',
           monto=?,
           fecha_pago=?,
           id_usuario=?,
           tipo_pago=?
       WHERE id_aporte=?`,
      [montoNumero, fechaSQL, id_usuario, tipo_pago, id_aporte]
    );

    const [catRows]: any = await conmysql.query(
      `SELECT id_categoria
       FROM categoria_caja
       WHERE nombre = 'APORTE'
       LIMIT 1`
    );

    if (catRows.length === 0) {
      res.status(500).json({
        mensaje: "Categoría APORTE no configurada",
      });
      return;
    }

    const id_categoria = catRows[0].id_categoria;

    await conmysql.query(
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
      VALUES (?, ?, 'INGRESO', ?, ?, ?, ?, ?, ?, ?)`,
      [
        aporte.id_grupo,
        id_usuario,
        catRows[0].id_categoria,
        id_aporte,
        montoNumero,
        tipo_pago,
        comprobante,
        "Pago de aporte",
        fechaSQL,
      ]
    );

    res.json({ mensaje: "Pago registrado correctamente", data: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error del servidor" });
  }
};

export const listarValorDeAporte = async (req: Request, res: Response): Promise<void> => {
  try {

    const { id_grupo } = (req as any).usuario;

    const [rows]: any = await conmysql.query(`
      SELECT 
        ca.id_config, ca.id_grupo,
        g.nombre AS nombre_grupo,
        CAST(ca.monto AS DECIMAL(10,2)) AS monto,
        DATE_FORMAT(ca.fecha_inicio, '%d-%m-%Y') AS fecha_inicio,
        ca.estado
      FROM configuracion_aporte ca
      INNER JOIN grupo g 
        ON ca.id_grupo = g.id_grupo
      WHERE ca.id_grupo = ? AND ca.estado = 'ACTIVO' ORDER BY ca.id_config DESC
    `, [id_grupo]);

    res.status(200).json({ mensaje: "Configuración de aportes encontrada.", data: rows });

  } catch (error) {
    console.error("Error listarValorDeAporte:", error);
    res.status(500).json({ mensaje: 'Error del servidor al listar valor de aporte', data: null });
  }
};

export const listarAportes = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario = (req as any).usuario;
    const { id_grupo, anio, mes, estado } = req.query;

    const anioFiltro = anio || new Date().getFullYear();

    const grupoFiltro = resolverGrupoPermitido(usuario, id_grupo);

    let query = `
      SELECT 
        a.id_aporte, a.monto, a.estado,
        DATE_FORMAT(a.fecha_pago, '%d/%m/%Y') AS fecha_pago,
        pe.anio, pe.mes, p.cedula,
        CONCAT(p.apellidos, ' ', p.nombres) AS nombre_completo,
        g.id_grupo, g.nombre
      FROM aporte a
      INNER JOIN socio s ON a.id_socio = s.id_socio
      INNER JOIN persona p ON s.id_persona = p.id_persona
      INNER JOIN grupo g ON s.id_grupo = g.id_grupo
      INNER JOIN periodo pe ON a.id_periodo = pe.id_periodo
      WHERE pe.anio = ?
    `;

    const params: any[] = [anioFiltro];

    if (grupoFiltro) { query += ` AND g.id_grupo = ?`; params.push(grupoFiltro); }

    if (mes) { query += ` AND pe.mes = ?`; params.push(mes); }

    if (estado) { query += ` AND a.estado = ?`; params.push(estado); }

    query += ` ORDER BY pe.mes ASC, p.apellidos ASC`;

    const [rows]: any = await conmysql.query(query, params);

    res.json({ mensaje: 'Aportes encontrados.', data: rows });

  } catch (error) {
    console.error('Error listarAportes:', error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};