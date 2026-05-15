import { Request, Response } from 'express';
import { conmysql } from '../db';

export const testActualizarFechas = async (req: Request, res: Response) => {
  try {
    await actualizarFechasAsamblea();

    return res.status(200).json({
      mensaje: "Fechas de asamblea actualizadas correctamente"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      mensaje: "Error al actualizar fechas",
      error
    });
  }
};
export const actualizarFechasAsamblea = async () => {
  try {

    const [periodos]: any = await conmysql.query(`
      SELECT
        p.id_periodo,
        p.id_grupo,
        p.anio,
        p.mes,
        ca.semana,
        ca.dia_semana
      FROM periodo p
      INNER JOIN configuracion_asamblea ca
        ON ca.id_grupo = p.id_grupo
      WHERE p.fecha_asamblea IS NULL
        AND ca.estado = 'ACTIVO'
    `);

    await Promise.all(
      periodos.map(async (item: any) => {

        if (!item.semana || !item.dia_semana) return;

        const fechaAsamblea = calcularFechaAsamblea(
          item.anio,
          item.mes,
          item.semana,
          item.dia_semana
        );

        await conmysql.query(
          `
          UPDATE periodo
          SET fecha_asamblea = ?
          WHERE id_periodo = ?
          `,
          [fechaAsamblea, item.id_periodo]
        );
      })
    );

    console.log("✔ Fechas de asamblea actualizadas");

  } catch (error) {
    console.error("Error:", error);
  }
};

function calcularFechaAsamblea(
  anio: number,
  mes: number,
  semana: string,
  diaSemana: string
): string {

  const diasSemana: Record<string, number> = {
    DOMINGO: 0,
    LUNES: 1,
    MARTES: 2,
    MIERCOLES: 3,
    JUEVES: 4,
    VIERNES: 5,
    SABADO: 6,
  };

  const targetDay = diasSemana[diaSemana];

  const fechas: Date[] = [];

  const fecha = new Date(anio, mes - 1, 1);

  while (fecha.getMonth() === mes - 1) {

    if (fecha.getDay() === targetDay) {
      fechas.push(new Date(fecha));
    }

    fecha.setDate(fecha.getDate() + 1);
  }

  let resultado: Date;

  switch (semana) {

    case "PRIMERA":
      resultado = fechas[0];
      break;

    case "SEGUNDA":
      resultado = fechas[1];
      break;

    case "TERCERA":
      resultado = fechas[2];
      break;

    case "CUARTA":
      resultado = fechas[3];
      break;

    case "ULTIMA":
      resultado = fechas[fechas.length - 1];
      break;

    default:
      resultado = fechas[0];
  }

  return resultado.toISOString().split("T")[0];
}
export const aperturarAnioMeses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { anio, meses } = req.body;

    if (!anio || !Array.isArray(meses) || meses.length === 0) {
      res.status(400).json({ mensaje: "Debe enviar año y meses" });
      return;
    }

    // 🔥 1. Obtener grupos activos
    const [grupos]: any = await conmysql.query(`
      SELECT id_grupo
      FROM grupo
      WHERE estado = 'ACTIVO'
    `);

    let totalPeriodos = 0;
    let totalAportes = 0;

    for (const grupo of grupos) {

      // 🔥 obtener configuración asamblea
      const [configAsamblea]: any = await conmysql.query(`
        SELECT
          semana,
          dia_semana
        FROM configuracion_asamblea
        WHERE id_grupo = ?
        AND estado = 'ACTIVO'
        LIMIT 1
      `, [grupo.id_grupo]);

      for (const mes of meses) {

        // 🔥 validar mes
        if (mes < 1 || mes > 12) continue;

        let fechaAsamblea = null;

        // 🔥 calcular fecha asamblea
        if (configAsamblea.length > 0) {

          const semana = configAsamblea[0].semana;
          const diaSemana = configAsamblea[0].dia_semana;

          fechaAsamblea = calcularFechaAsamblea(
            anio,
            mes,
            semana,
            diaSemana
          );
        }

        // 🔥 2. verificar periodo
        const [existePeriodo]: any = await conmysql.query(`
          SELECT id_periodo
          FROM periodo
          WHERE id_grupo = ?
          AND anio = ?
          AND mes = ?
        `, [grupo.id_grupo, anio, mes]);

        let id_periodo;

        if (existePeriodo.length === 0) {

          const [result]: any = await conmysql.query(`
            INSERT INTO periodo (
              id_grupo,
              anio,
              mes,
              fecha_asamblea,
              estado
            )
            VALUES (?, ?, ?, ?, 'ABIERTO')
          `, [
            grupo.id_grupo,
            anio,
            mes,
            fechaAsamblea
          ]);

          id_periodo = result.insertId;
          totalPeriodos++;

        } else {

          id_periodo = existePeriodo[0].id_periodo;

          // 🔥 actualizar fecha asamblea si existe periodo
          await conmysql.query(`
            UPDATE periodo
            SET fecha_asamblea = ?
            WHERE id_periodo = ?
          `, [fechaAsamblea, id_periodo]);
        }

        // 🔥 3. obtener configuración aporte
        const [config]: any = await conmysql.query(`
          SELECT monto
          FROM configuracion_aporte
          WHERE id_grupo = ?
          AND estado = 'ACTIVO'
          LIMIT 1
        `, [grupo.id_grupo]);

        if (config.length === 0) continue;

        const monto = Number(config[0].monto);

        // 🔥 4. socios activos
        const [socios]: any = await conmysql.query(`
          SELECT id_socio
          FROM socio
          WHERE id_grupo = ?
          AND estado = 'ACTIVO'
        `, [grupo.id_grupo]);

        for (const socio of socios) {

          const [existeAporte]: any = await conmysql.query(`
            SELECT id_aporte
            FROM aporte
            WHERE id_socio = ?
            AND id_periodo = ?
          `, [socio.id_socio, id_periodo]);

          if (existeAporte.length > 0) continue;

          await conmysql.query(`
            INSERT INTO aporte (
              id_socio,
              id_periodo,
              id_usuario,
              monto,
              estado
            )
            VALUES (?, ?, NULL, ?, 'PENDIENTE')
          `, [
            socio.id_socio,
            id_periodo,
            monto
          ]);

          totalAportes++;
        }
      }
    }

    res.status(201).json({
      mensaje: "Apertura global parcial completada",
      periodos_creados: totalPeriodos,
      aportes_creados: totalAportes
    });

  } catch (error: any) {

    console.error("Error:", error);

    res.status(500).json({
      mensaje: "Error del servidor",
      error
    });
  }
};

export const aperturarAnioMeses1 = async (req: Request, res: Response): Promise<void> => {
  try {
    const { anio, meses } = req.body;

    if (!anio || !Array.isArray(meses) || meses.length === 0) {
      res.status(400).json({ mensaje: 'Debe enviar año y meses' });
      return;
    }

    // 🔥 1. Obtener grupos activos
    const [grupos]: any = await conmysql.query(
      `SELECT id_grupo FROM grupo WHERE estado = 'ACTIVO'`
    );

    let totalPeriodos = 0;
    let totalAportes = 0;

    for (const grupo of grupos) {

      for (const mes of meses) {

        // 🔥 validar mes
        if (mes < 1 || mes > 12) continue;

        // 🔥 2. verificar periodo
        const [existePeriodo]: any = await conmysql.query(
          `SELECT id_periodo 
           FROM periodo 
           WHERE id_grupo=? AND anio=? AND mes=?`,
          [grupo.id_grupo, anio, mes]
        );

        let id_periodo;

        if (existePeriodo.length === 0) {
          const [result]: any = await conmysql.query(
            `INSERT INTO periodo (id_grupo, anio, mes, estado)
             VALUES (?, ?, ?, 'ABIERTO')`,
            [grupo.id_grupo, anio, mes]
          );

          id_periodo = result.insertId;
          totalPeriodos++;
        } else {
          id_periodo = existePeriodo[0].id_periodo;
        }

        // 🔥 3. obtener configuración aporte
        const [config]: any = await conmysql.query(
          `SELECT monto 
           FROM configuracion_aporte 
           WHERE id_grupo=? AND estado='ACTIVO'
           LIMIT 1`,
          [grupo.id_grupo]
        );

        if (config.length === 0) continue;

        const monto = config[0].monto;

        // 🔥 4. socios activos
        const [socios]: any = await conmysql.query(
          `SELECT id_socio 
           FROM socio 
           WHERE id_grupo=? AND estado='ACTIVO'`,
          [grupo.id_grupo]
        );

        for (const socio of socios) {

          const [existeAporte]: any = await conmysql.query(
            `SELECT id_aporte
             FROM aporte
             WHERE id_socio=? AND id_periodo=?`,
            [socio.id_socio, id_periodo]
          );

          if (existeAporte.length > 0) continue;

          await conmysql.query(
            `INSERT INTO aporte (
              id_socio,
              id_periodo,
              id_usuario,
              monto,
              estado
            ) VALUES (?, ?, NULL, ?, 'PENDIENTE')`,
            [socio.id_socio, id_periodo, monto]
          );

          totalAportes++;
        }
      }
    }

    res.status(201).json({
      mensaje: 'Apertura global parcial completada',
      periodos_creados: totalPeriodos,
      aportes_creados: totalAportes
    });

  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ mensaje: 'Error del servidor', error });
  }
};

export const aperturarAnioGlobal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { anio } = req.body;

    if (!anio) {
      res.status(400).json({ mensaje: 'Debe enviar el año' });
      return;
    }

    // 🔥 1. Obtener grupos activos
    const [grupos]: any = await conmysql.query(
      `SELECT id_grupo FROM grupo WHERE estado = 'ACTIVO'`
    );

    let totalPeriodos = 0;
    let totalAportes = 0;

    for (const grupo of grupos) {

      // 🔥 2. Crear los 12 meses
      for (let mes = 1; mes <= 12; mes++) {

        // evitar duplicados de periodo
        const [existePeriodo]: any = await conmysql.query(
          `SELECT id_periodo 
           FROM periodo 
           WHERE id_grupo=? AND anio=? AND mes=?`,
          [grupo.id_grupo, anio, mes]
        );

        let id_periodo;

        if (existePeriodo.length === 0) {
          const [result]: any = await conmysql.query(
            `INSERT INTO periodo (id_grupo, anio, mes, estado)
             VALUES (?, ?, ?, 'ABIERTO')`,
            [grupo.id_grupo, anio, mes]
          );

          id_periodo = result.insertId;
          totalPeriodos++;
        } else {
          id_periodo = existePeriodo[0].id_periodo;
        }

        // 🔥 3. Obtener monto del aporte
        const [config]: any = await conmysql.query(
          `SELECT monto 
           FROM configuracion_aporte 
           WHERE id_grupo=? AND estado='ACTIVO'
           LIMIT 1`,
          [grupo.id_grupo]
        );

        if (config.length === 0) continue;

        const monto = config[0].monto;

        // 🔥 4. Obtener socios activos
        const [socios]: any = await conmysql.query(
          `SELECT id_socio 
           FROM socio 
           WHERE id_grupo=? AND estado='ACTIVO'`,
          [grupo.id_grupo]
        );

        for (const socio of socios) {

          // evitar duplicados
          const [existeAporte]: any = await conmysql.query(
            `SELECT id_aporte
             FROM aporte
             WHERE id_socio=? AND id_periodo=?`,
            [socio.id_socio, id_periodo]
          );

          if (existeAporte.length > 0) continue;

          await conmysql.query(
            `INSERT INTO aporte (
              id_socio,
              id_periodo,
              id_usuario,
              monto,
              estado
            ) VALUES (?, ?, NULL, ?, 'PENDIENTE')`,
            [socio.id_socio, id_periodo, monto]
          );

          totalAportes++;
        }
      }
    }

    res.status(201).json({
      mensaje: 'Año aperturado correctamente',
      periodos_creados: totalPeriodos,
      aportes_creados: totalAportes
    });

  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ mensaje: 'Error del servidor', error });
  }
};

export const listarAnios = async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows]: any = await conmysql.query(`
      SELECT DISTINCT anio
      FROM periodo
      ORDER BY anio DESC
    `);

    res.json({
      mensaje: "Años disponibles",
      data: rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};

export const listarMeses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { anio, id_grupo } = req.query;

    if (!anio) {
      res.status(400).json({ mensaje: 'Debe enviar el año' });
      return;
    }

    const [rows]: any = await conmysql.query(`
      SELECT DISTINCT 
        mes,
        CASE mes
          WHEN 1 THEN 'Enero'
          WHEN 2 THEN 'Febrero'
          WHEN 3 THEN 'Marzo'
          WHEN 4 THEN 'Abril'
          WHEN 5 THEN 'Mayo'
          WHEN 6 THEN 'Junio'
          WHEN 7 THEN 'Julio'
          WHEN 8 THEN 'Agosto'
          WHEN 9 THEN 'Septiembre'
          WHEN 10 THEN 'Octubre'
          WHEN 11 THEN 'Noviembre'
          WHEN 12 THEN 'Diciembre'
        END AS nombre_mes
      FROM periodo
      WHERE anio = ?
      AND (? IS NULL OR id_grupo = ?)
      ORDER BY mes ASC
    `, [anio, id_grupo || null, id_grupo || null]);

    res.json({ mensaje: "Meses disponibles", data: rows });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
};