import { Request, Response } from 'express';
import { conmysql } from '../db';

export const listarMisPrestamos = async (req: Request, res: Response) => {
  try {
    const { id_socio, id_grupo } = (req as any).usuario;

    if (!id_socio) {
      return res.status(403).json({ mensaje: "El usuario no es un socio" });
    }

    const [rows]: any = await conmysql.query(`
      SELECT 
        p.id_prestamo,
        DATE_FORMAT(p.fecha, '%d-%m-%Y') AS fecha, 
        CAST(p.monto AS DECIMAL(10,2)) AS monto, p.interes AS tasa, p.cuotas AS plazo, p.estado
      FROM prestamo p
      WHERE p.id_socio = ?
      AND p.id_grupo = ?
      ORDER BY p.fecha DESC
    `, [id_socio, id_grupo]);

    const [total]: any = await conmysql.query(`
      SELECT 
        CAST(IFNULL(SUM(monto), 0) AS DECIMAL(10,2)) AS monto_total
      FROM prestamo WHERE id_socio = ? AND id_grupo = ?
    `, [id_socio, id_grupo]);

    res.status(200).json({ mensaje: 'Mis préstamos', data: { prestamos: rows, monto_total: total[0].monto_total } });

  } catch (error) {
    console.error("Error listarMisPrestamos:", error);
    res.status(500).json({ mensaje: 'Error al listar Mis Prestamos', data: null });
  }
};

export const listarMisCuotas = async (req: Request, res: Response) => {
  try {
    const { id_socio, id_grupo } = (req as any).usuario;

    if (!id_socio) {
      return res.status(403).json({
        mensaje: "El usuario no es un socio"
      });
    }

    // Buscar préstamo activo del socio logueado
    const [prestamo]: any = await conmysql.query(`
      SELECT id_prestamo
      FROM prestamo
      WHERE id_socio = ?
      AND id_grupo = ?
      AND estado = 'ACTIVO'
      LIMIT 1
    `, [id_socio, id_grupo]);

    if (prestamo.length === 0) {
      return res.status(404).json({
        mensaje: "No tienes préstamos activos"
      });
    }

    const id_prestamo = prestamo[0].id_prestamo;

    // Obtener cuotas
    const [rows]: any = await conmysql.query(`
      SELECT
        id_cuota,
        numero,
        DATE_FORMAT(fecha_vencimiento, '%d-%m-%Y') AS fecha_vencimiento,

        CAST(cuota AS DECIMAL(10,2)) AS cuota,
        CAST(capital AS DECIMAL(10,2)) AS capital,
        CAST(interes AS DECIMAL(10,2)) AS interes,
        CAST(saldo AS DECIMAL(10,2)) AS saldo,
        CAST(mora AS DECIMAL(10,2)) AS mora,

        dias_atraso,
        estado
      FROM prestamo_cuota
      WHERE id_prestamo = ?
      ORDER BY numero ASC
    `, [id_prestamo]);

    res.status(200).json({
      mensaje: "Mis cuotas",
      data: rows
    });

  } catch (error) {
    console.error("Error listarMisCuotas:", error);

    res.status(500).json({
      mensaje: "Error al obtener cuotas",
      data: null
    });
  }
};

export const registrarPrestamo = async (req: Request, res: Response) => {
  try {
    const {
      id_socio,
      monto,
      cuotas,
      tipo_pago,
      comprobante
    } = req.body;

    const { id_usuario, id_grupo } = (req as any).usuario;

    if (!id_socio || !monto || !cuotas || !tipo_pago) {
      return res.status(400).json({
        mensaje: "Datos incompletos"
      });
    }

    if (
      tipo_pago === "TRANSFERENCIA" &&
      (!comprobante || comprobante.trim() === "")
    ) {
      return res.status(400).json({
        mensaje: "Debe adjuntar comprobante"
      });
    }

    // Validar socio
    const [socio]: any = await conmysql.query(
      `SELECT id_socio
       FROM socio
       WHERE id_socio=? AND id_grupo=?`,
      [id_socio, id_grupo]
    );

    if (socio.length === 0) {
      return res.status(403).json({
        mensaje: "El socio no pertenece al grupo"
      });
    }

    // VALIDAR SI YA TIENE PRÉSTAMO ACTIVO
    const [prestamoActivo]: any = await conmysql.query(
      `SELECT id_prestamo
       FROM prestamo
       WHERE id_socio=?
       AND estado='ACTIVO'
       LIMIT 1`,
      [id_socio]
    );

    if (prestamoActivo.length > 0) {
      return res.status(400).json({
        mensaje: "El socio tiene un préstamo vigente"
      });
    }

    // Configuración activa
    const [config]: any = await conmysql.query(
      `SELECT interes
       FROM configuracion_prestamo
       WHERE id_grupo=?
       AND estado='ACTIVO'
       ORDER BY fecha_inicio DESC
       LIMIT 1`,
      [id_grupo]
    );

    if (config.length === 0) {
      return res.status(400).json({
        mensaje: "No hay configuración activa"
      });
    }

    const interes = Number(config[0].interes);
    const tasa = interes / 100;
    const montoNum = Number(monto);

    // Capital parejo
    const capitalBase = Number(
      (Math.ceil((montoNum / cuotas) * 10) / 10).toFixed(2)
    );

    let saldoCapital = montoNum;
    let capitalAcumulado = 0;
    let total = 0;

    const cuotasGeneradas = [];

    for (let i = 1; i <= cuotas; i++) {
      let capital = capitalBase;

      if (i === cuotas) {
        capital = Number(
          (montoNum - capitalAcumulado).toFixed(2)
        );
      }

      const interesMes = Number(
        (saldoCapital * tasa).toFixed(2)
      );

      const cuotaFinal = Number(
        (capital + interesMes).toFixed(2)
      );

      saldoCapital = Number(
        (saldoCapital - capital).toFixed(2)
      );

      if (saldoCapital < 0) saldoCapital = 0;

      capitalAcumulado += capital;
      total += cuotaFinal;

      cuotasGeneradas.push({
        numero: i,
        cuota: cuotaFinal,
        capital,
        interes: interesMes,
        saldo: saldoCapital
      });
    }

    total = Number(total.toFixed(2));

    // Registrar préstamo
    const [prestamoResult]: any = await conmysql.query(
      `INSERT INTO prestamo (
        id_socio,
        id_usuario,
        id_grupo,
        monto,
        interes,
        total,
        cuotas,
        saldo_actual,
        fecha
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id_socio,
        id_usuario,
        id_grupo,
        montoNum,
        interes,
        total,
        cuotas,
        total
      ]
    );

    const id_prestamo = prestamoResult.insertId;

    // Registrar cuotas (desde próximo mes)
    for (const cuotaItem of cuotasGeneradas) {
      await conmysql.query(
        `INSERT INTO prestamo_cuota (
          id_prestamo,
          numero,
          cuota,
          capital,
          interes,
          saldo,
          fecha_vencimiento
        )
        VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? MONTH))`,
        [
          id_prestamo,
          cuotaItem.numero,
          cuotaItem.cuota,
          cuotaItem.capital,
          cuotaItem.interes,
          cuotaItem.saldo,
          cuotaItem.numero
        ]
      );
    }

    // Registrar salida de caja
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
      VALUES (
        ?,
        ?,
        'EGRESO',
        (
          SELECT id_categoria
          FROM categoria_caja
          WHERE nombre='PRESTAMO'
        ),
        ?,
        ?,
        ?,
        ?,
        'Desembolso de préstamo',
        NOW()
      )`,
      [
        id_grupo,
        id_usuario,
        id_prestamo,
        montoNum,
        tipo_pago,
        tipo_pago === "TRANSFERENCIA"
          ? comprobante
          : null
      ]
    );

    return res.json({
      mensaje: "Préstamo registrado correctamente",
      id_prestamo,
      cuotas: cuotasGeneradas
    });

  } catch (error) {
    console.error("Error registrarPrestamo:", error);

    return res.status(500).json({
      mensaje: "Error al registrar préstamo"
    });
  }
};

export const pagarCuota = async (req: Request, res: Response) => {
  try {
    const { id_cuota, monto, tipo_pago, comprobante } = req.body;
    const { id_usuario, id_grupo } = (req as any).usuario;

    if (!id_cuota || !monto || !tipo_pago) {
      return res.status(400).json({
        mensaje: "Datos incompletos"
      });
    }

    if (
      tipo_pago === "TRANSFERENCIA" &&
      (!comprobante || comprobante.trim() === "")
    ) {
      return res.status(400).json({
        mensaje: "Debe adjuntar comprobante"
      });
    }

    const [cuota]: any = await conmysql.query(
      `SELECT * 
       FROM prestamo_cuota 
       WHERE id_cuota = ?`,
      [id_cuota]
    );

    if (cuota.length === 0) {
      return res.status(404).json({
        mensaje: "Cuota no encontrada"
      });
    }

    const c = cuota[0];

    if (c.estado === "PAGADO") {
      return res.status(400).json({
        mensaje: "La cuota ya está pagada"
      });
    }

    if (Number(monto) < Number(c.cuota)) {
      return res.status(400).json({
        mensaje: "Monto insuficiente"
      });
    }

    // Registrar pago
    const [pago]: any = await conmysql.query(
      `INSERT INTO pago_cuota (
        id_cuota,
        id_usuario,
        monto,
        capital,
        interes,
        mora
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id_cuota,
        id_usuario,
        monto,
        c.capital,
        c.interes,
        c.mora
      ]
    );

    const id_pago = pago.insertId;

    // Marcar cuota pagada
    await conmysql.query(
      `UPDATE prestamo_cuota
       SET estado='PAGADO'
       WHERE id_cuota=?`,
      [id_cuota]
    );

    // ACTUALIZAR SALDO TOTAL (capital + interés)
    await conmysql.query(
      `UPDATE prestamo
       SET saldo_actual = GREATEST(
         ROUND(saldo_actual - ?, 2),
         0
       )
       WHERE id_prestamo = ?`,
      [c.cuota, c.id_prestamo]
    );

    // Recuperación capital
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
      VALUES (
        ?,
        ?,
        'INGRESO',
        (
          SELECT id_categoria
          FROM categoria_caja
          WHERE nombre='RECUPERACION CAPITAL'
        ),
        ?,
        ?,
        ?,
        ?,
        'Recuperación de capital',
        NOW()
      )`,
      [
        id_grupo,
        id_usuario,
        id_pago,
        c.capital,
        tipo_pago,
        tipo_pago === "TRANSFERENCIA" ? comprobante : null
      ]
    );

    // Interés
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
      VALUES (
        ?,
        ?,
        'INGRESO',
        (
          SELECT id_categoria
          FROM categoria_caja
          WHERE nombre='INTERES'
        ),
        ?,
        ?,
        ?,
        ?,
        'Interés de cuota',
        NOW()
      )`,
      [
        id_grupo,
        id_usuario,
        id_pago,
        c.interes,
        tipo_pago,
        tipo_pago === "TRANSFERENCIA" ? comprobante : null
      ]
    );

    // Mora
    if (Number(c.mora) > 0) {
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
        VALUES (
          ?,
          ?,
          'INGRESO',
          (
            SELECT id_categoria
            FROM categoria_caja
            WHERE nombre='MORA'
          ),
          ?,
          ?,
          ?,
          ?,
          'Pago de mora',
          NOW()
        )`,
        [
          id_grupo,
          id_usuario,
          id_pago,
          c.mora,
          tipo_pago,
          tipo_pago === "TRANSFERENCIA" ? comprobante : null
        ]
      );
    }

    // Verificar si terminó
    const [pendientes]: any = await conmysql.query(
      `SELECT COUNT(*) total
       FROM prestamo_cuota
       WHERE id_prestamo=? 
       AND estado!='PAGADO'`,
      [c.id_prestamo]
    );

    if (pendientes[0].total === 0) {
      await conmysql.query(
        `UPDATE prestamo
     SET estado='PAGADO',
         saldo_actual=0
     WHERE id_prestamo=?`,
        [c.id_prestamo]
      );
    }

    res.status(200).json({
      mensaje: "Cuota pagada correctamente",
      id_pago
    });

  } catch (error) {
    console.error("Error pagarCuota:", error);

    res.status(500).json({
      mensaje: "Error al pagar cuota"
    });
  }
};

export const prestamosPorSocio = async (req: Request, res: Response) => {
  try {
    const { id_socio } = req.params;

    const [rows]: any = await conmysql.query(`SELECT * FROM prestamo WHERE id_socio = ? ORDER BY fecha DESC`, [id_socio]);

    res.status(200).json({ mensaje: 'Préstamos del socio encontrados', data: rows, });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al consultar préstamos del socio' });
  }
};

export const listarPrestamos = async (req: Request, res: Response) => {
  try {
    const { id_grupo } = (req as any).usuario;

    const [rows]: any = await conmysql.query(`
      SELECT 
        p.id_prestamo, pe.nombres, pe.apellidos, p.monto, p.total, p.saldo_actual, p.cuotas, p.estado, p.fecha
      FROM prestamo p
      INNER JOIN socio s ON p.id_socio = s.id_socio
      INNER JOIN persona pe ON s.id_persona = pe.id_persona
      WHERE p.id_grupo = ?
      ORDER BY p.fecha DESC
    `, [id_grupo]);

    res.status(200).json({ mensaje: 'Préstamos listados correctamente', data: rows, });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al listar préstamos' });
  }
};

export const verCuotas = async (req: Request, res: Response) => {
  try {
    const { id_prestamo } = req.params;

    const [rows]: any = await conmysql.query(`
      SELECT * FROM prestamo_cuota WHERE id_prestamo = ? ORDER BY numero ASC
    `, [id_prestamo]);

    res.status(200).json({ mensaje: 'Cuotas encontradas', data: rows, });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener cuotas' });
  }
};

export const actualizarMora = async () => {
  try {
    await conmysql.query(`
      UPDATE prestamo_cuota SET estado = 'ATRASADO' WHERE fecha_vencimiento < CURDATE() AND estado = 'PENDIENTE'
    `);

  } catch (error) {
    console.error(error);
  }
};