import { Request, Response } from 'express';
import { conmysql } from '../db';

export const resumenDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    // 🔥 PERIODO ACTIVO
    const [[periodo]]: any = await conmysql.query(
      `SELECT id_periodo, anio, mes
       FROM periodo
       WHERE id_grupo=? AND estado='ABIERTO'
       LIMIT 1`,
      [id_grupo]
    );

    if (!periodo) {
      res.status(400).json({ mensaje: 'No hay periodo activo' });
      return;
    }

    // 👥 SOCIOS ACTIVOS
    const [[socios]]: any = await conmysql.query(
      `SELECT COUNT(*) total
       FROM socio
       WHERE id_grupo=? AND estado='ACTIVO'`,
      [id_grupo]
    );

    // ⏳ APORTES PENDIENTES
    const [[pendientes]]: any = await conmysql.query(
      `SELECT COUNT(*) total
       FROM aporte a
       INNER JOIN socio s ON a.id_socio = s.id_socio
       WHERE s.id_grupo=?
       AND a.id_periodo=?
       AND a.estado='PENDIENTE'`,
      [id_grupo, periodo.id_periodo]
    );

    // 💰 INGRESOS TOTALES
    const [[ingresos]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM caja
       WHERE id_grupo=? AND tipo='INGRESO'`,
      [id_grupo]
    );

    // 💰 INGRESOS POR APORTES
    const [[ingresosAportes]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM caja
       WHERE id_grupo=?
       AND tipo='INGRESO'
       AND id_categoria = (
         SELECT id_categoria
         FROM categoria_caja
         WHERE nombre='APORTE'
         LIMIT 1
       )`,
      [id_grupo]
    );

    // 💸 EGRESOS TOTALES
    const [[egresos]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM caja
       WHERE id_grupo=? AND tipo='EGRESO'`,
      [id_grupo]
    );

    // ⚖️ SALDO CAJA
    const [[saldo]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(
        CASE
          WHEN tipo='INGRESO' THEN monto
          ELSE -monto
        END
      ),0) total
       FROM caja
       WHERE id_grupo=?`,
      [id_grupo]
    );

    // 📅 INGRESOS MES
    const [[ingresosMes]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM caja
       WHERE id_grupo=?
       AND tipo='INGRESO'
       AND MONTH(fecha)=?
       AND YEAR(fecha)=?`,
      [id_grupo, periodo.mes, periodo.anio]
    );

    // 📅 EGRESOS MES
    const [[egresosMes]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM caja
       WHERE id_grupo=?
       AND tipo='EGRESO'
       AND MONTH(fecha)=?
       AND YEAR(fecha)=?`,
      [id_grupo, periodo.mes, periodo.anio]
    );

    // =========================
    // 🏦 PRESTAMOS
    // =========================

    // Capital prestado histórico
    const [[capitalPrestado]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(monto),0) total
       FROM prestamo
       WHERE id_grupo=?`,
      [id_grupo]
    );

    // Capital pendiente de cobro
    const [[capitalPorCobrar]]: any = await conmysql.query(
      `SELECT IFNULL(SUM(saldo_actual),0) total
       FROM prestamo
       WHERE id_grupo=?
       AND estado='ACTIVO'`,
      [id_grupo]
    );

    // Total prestamos otorgados
    const [[prestamosOtorgados]]: any = await conmysql.query(
      `SELECT COUNT(*) total
       FROM prestamo
       WHERE id_grupo=?`,
      [id_grupo]
    );

    // Prestamos activos
    const [[prestamosActivos]]: any = await conmysql.query(
      `SELECT COUNT(*) total
       FROM prestamo
       WHERE id_grupo=?
       AND estado='ACTIVO'`,
      [id_grupo]
    );

    res.status(200).json({
      mensaje: 'Resumen dashboard tesorero',
      data: {
        socios: socios.total,
        aportes_pendientes: pendientes.total,

        ingresos_total: ingresos.total,
        ingresos_aportes: ingresosAportes.total,
        egresos_total: egresos.total,
        saldo_caja: saldo.total,

        ingresos_mes: ingresosMes.total,
        egresos_mes: egresosMes.total,

        capital_prestado: capitalPrestado.total,
        capital_por_cobrar: capitalPorCobrar.total,

        prestamos_otorgados: prestamosOtorgados.total,
        prestamos_activos: prestamosActivos.total
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: 'Error del servidor'
    });
  }
};

export const aportesDelMes = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [[periodo]]: any = await conmysql.query(
      `SELECT id_periodo, mes, anio
       FROM periodo
       WHERE id_grupo=? AND estado='ABIERTO'
       LIMIT 1`,
      [id_grupo]
    );

    if (!periodo) {
      return res.status(400).json({ mensaje: 'No hay periodo activo' });
    }

    const [rows]: any = await conmysql.query(
      `SELECT 
        a.id_aporte,
        CONCAT(p.nombres,' ',p.apellidos) AS socio,
        a.estado,
        ? AS mes,
        ? AS anio
       FROM aporte a
       INNER JOIN socio s ON a.id_socio = s.id_socio
       INNER JOIN persona p ON s.id_persona = p.id_persona
       WHERE s.id_grupo=? 
       AND a.id_periodo=?`,
      [periodo.mes, periodo.anio, id_grupo, periodo.id_periodo]
    );

    res.status(200).json({
      mensaje: 'Aportes del mes',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
};

export const sociosMorosos = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [[periodo]]: any = await conmysql.query(
      `SELECT anio, mes
       FROM periodo
       WHERE id_grupo=? AND estado='ABIERTO'
       LIMIT 1`,
      [id_grupo]
    );

    if (!periodo) {
      return res.status(400).json({ mensaje: 'No hay periodo activo' });
    }

    const [rows]: any = await conmysql.query(
      `SELECT 
        s.id_socio,
        CONCAT(p.nombres,' ',p.apellidos) socio,
        COUNT(a.id_aporte) pendientes
       FROM aporte a
       INNER JOIN socio s ON a.id_socio = s.id_socio
       INNER JOIN persona p ON s.id_persona = p.id_persona
       INNER JOIN periodo pe ON a.id_periodo = pe.id_periodo
       WHERE s.id_grupo=? 
       AND pe.anio=? 
       AND pe.mes <= ?
       AND a.estado='PENDIENTE'
       GROUP BY s.id_socio
       HAVING pendientes > 0
       ORDER BY pendientes DESC`,
      [id_grupo, periodo.anio, periodo.mes]
    );

    res.status(200).json({
      mensaje: 'Socios morosos',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
};

export const movimientosRecientes = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    const [rows]: any = await conmysql.query(
      `
      SELECT 
        c.tipo,
        c.id_categoria,
        cat.nombre AS categoria,
        c.monto,
        c.fecha,

        CASE 
          WHEN cat.nombre = 'APORTE' THEN 
            CONCAT(
              'Aporte de ', p.nombres, ' ', p.apellidos,
              ' mes ',
              ELT(pe.mes,
                'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
                'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
              ),
              ' - ', pe.anio
            )

          WHEN cat.nombre = 'INTERES' THEN 
            CONCAT(
              'Interés generado por préstamo de ', p2.nombres, ' ', p2.apellidos
            )

          WHEN cat.nombre = 'PRESTAMO' THEN 
            CONCAT(
              'Préstamo otorgado a ', p3.nombres, ' ', p3.apellidos
            )

          ELSE c.descripcion
        END AS descripcion

      FROM caja c

      INNER JOIN categoria_caja cat 
        ON c.id_categoria = cat.id_categoria

      -- 🔵 APORTE
      LEFT JOIN aporte a 
        ON c.id_origen = a.id_aporte

      LEFT JOIN socio s 
        ON a.id_socio = s.id_socio

      LEFT JOIN persona p 
        ON s.id_persona = p.id_persona

      LEFT JOIN periodo pe 
        ON a.id_periodo = pe.id_periodo

      -- 🟡 INTERÉS (desde pago_cuota)
      LEFT JOIN pago_cuota pc 
        ON c.id_origen = pc.id_pago

      LEFT JOIN prestamo_cuota prc 
        ON pc.id_cuota = prc.id_cuota

      LEFT JOIN prestamo pr 
        ON prc.id_prestamo = pr.id_prestamo

      LEFT JOIN socio s2 
        ON pr.id_socio = s2.id_socio

      LEFT JOIN persona p2 
        ON s2.id_persona = p2.id_persona

      -- 🔴 PRÉSTAMO
      LEFT JOIN prestamo pr2 
        ON c.id_origen = pr2.id_prestamo

      LEFT JOIN socio s3 
        ON pr2.id_socio = s3.id_socio

      LEFT JOIN persona p3 
        ON s3.id_persona = p3.id_persona

      WHERE c.id_grupo = ?
      ORDER BY c.fecha DESC, c.id_movimiento DESC
      LIMIT ? OFFSET ?
      `,
      [id_grupo, limit, offset]
    );

    res.status(200).json({ mensaje: "Movimientos recientes", data: rows, });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al obtener movimientos" });
  }
};

/* export const movimientosRecientes = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    const [rows]: any = await conmysql.query(
      `SELECT 
        tipo,
        id_categoria,
        monto,
        descripcion,
        fecha
       FROM caja
       WHERE id_grupo=?
       ORDER BY fecha DESC, id_movimiento DESC
       LIMIT ? OFFSET ?`,
      [id_grupo, limit, offset]
    );

    res.status(200).json({
      mensaje: "Movimientos recientes",
      data: rows,
    });

  } catch (error) {
    res.status(500).json({ mensaje: "Error" });
  }
}; */

export const ingresosPorMes = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;
    const { anio } = req.query;

    const anioFiltro = anio || new Date().getFullYear();

    const [rows]: any = await conmysql.query(
      `SELECT 
        p.mes,
        p.anio,
        IFNULL(SUM(c.monto), 0) AS total
       FROM periodo p
       LEFT JOIN caja c 
         ON c.id_grupo = p.id_grupo
         AND c.tipo = 'INGRESO'
         AND MONTH(c.fecha) = p.mes
         AND YEAR(c.fecha) = p.anio
       WHERE p.id_grupo = ?
       AND p.anio = ?
       GROUP BY p.anio, p.mes
       ORDER BY p.mes ASC`,
      [id_grupo, anioFiltro]
    );

    res.status(200).json({
      mensaje: 'Ingresos por mes',
      data: rows
    });

  } catch (error) {
    console.error('Error ingresosPorMes:', error);

    res.status(500).json({
      mensaje: 'Error del servidor'
    });
  }
};
export const ingresosPorMes1 = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [rows]: any = await conmysql.query(
      `SELECT 
        p.mes,
        p.anio,
        IFNULL(SUM(c.monto),0) AS total
       FROM periodo p
       LEFT JOIN caja c 
         ON c.id_grupo = p.id_grupo
         AND c.tipo = 'INGRESO'
         AND MONTH(c.fecha) = p.mes
         AND YEAR(c.fecha) = p.anio
       WHERE p.id_grupo = ?
       GROUP BY p.anio, p.mes
       ORDER BY p.anio, p.mes`,
      [id_grupo]
    );

    res.status(200).json({
      mensaje: 'Ingresos por mes',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
};

/* export const ingresosPorMes = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [rows]: any = await conmysql.query(
      `SELECT 
        MONTH(fecha) AS mes,
        YEAR(fecha) AS anio,
        SUM(monto) AS total
       FROM caja
       WHERE id_grupo = ?
       AND tipo = 'INGRESO'
       GROUP BY anio, mes
       ORDER BY anio, mes`,
      [id_grupo]
    );

    res.status(200).json({
      mensaje: 'Ingresos por mes',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
}; */

export const sociosNuevos = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [rows]: any = await conmysql.query(
      `SELECT 
        CONCAT(p.nombres,' ',p.apellidos) AS socio,
        s.fecha_ingreso
       FROM socio s
       INNER JOIN persona p ON s.id_persona = p.id_persona
       WHERE s.id_grupo=?
       ORDER BY s.fecha_ingreso DESC
       LIMIT 5`,
      [id_grupo]
    );

    res.status(200).json({
      mensaje: 'Socios nuevos',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
};

export const egresosPorMes = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;
    const { anio } = req.query;

    const anioFiltro = anio || new Date().getFullYear();

    const [rows]: any = await conmysql.query(
      `SELECT 
        p.mes,
        p.anio,
        IFNULL(SUM(c.monto), 0) AS total
       FROM periodo p
       LEFT JOIN caja c 
         ON c.id_grupo = p.id_grupo
         AND c.tipo = 'EGRESO'
         AND MONTH(c.fecha) = p.mes
         AND YEAR(c.fecha) = p.anio
       WHERE p.id_grupo = ?
       AND p.anio = ?
       GROUP BY p.anio, p.mes
       ORDER BY p.mes ASC`,
      [id_grupo, anioFiltro]
    );

    res.status(200).json({
      mensaje: 'Egresos por mes',
      data: rows
    });

  } catch (error) {
    console.error('Error egresosPorMes:', error);

    res.status(500).json({
      mensaje: 'Error del servidor'
    });
  }
};

export const egresosPorMes1 = async (req: Request, res: Response) => {
  try {
    const id_grupo = (req as any).usuario.id_grupo;

    const [rows]: any = await conmysql.query(
      `SELECT 
        p.mes,
        p.anio,
        IFNULL(SUM(c.monto),0) AS total
       FROM periodo p
       LEFT JOIN caja c 
         ON c.id_grupo = p.id_grupo
         AND c.tipo = 'EGRESO'
         AND MONTH(c.fecha) = p.mes
         AND YEAR(c.fecha) = p.anio
       WHERE p.id_grupo = ?
       GROUP BY p.anio, p.mes
       ORDER BY p.anio, p.mes`,
      [id_grupo]
    );

    res.status(200).json({
      mensaje: 'Egresos por mes',
      data: rows
    });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error' });
  }
};