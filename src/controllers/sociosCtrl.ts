import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { conmysql } from '../db';
import { sendEmail } from '../services/emailService';
import { resolverGrupoPermitido } from '../utils/scopes';

export const listarAportesGrupo = async (req: Request, res: Response) => {
  try {

    // 🔥 id_grupo desde token
    const { id_grupo } = (req as any).usuario;

    // 🔥 obtener monto actual aporte
    const [config]: any = await conmysql.query(
      `
      SELECT monto
      FROM configuracion_aporte
      WHERE id_grupo = ?
        AND estado = 'ACTIVO'
      ORDER BY fecha_inicio DESC
      LIMIT 1
      `,
      [id_grupo]
    );

    const montoAporte = Number(config[0]?.monto || 0);

    // 🔥 listar TODOS los socios + periodos
    const [rows]: any = await conmysql.query(
      `
      SELECT

        s.id_socio,

        CONCAT(
          p2.nombres,
          ' ',
          p2.apellidos
        ) AS socio,

        DATE_FORMAT(
          p.fecha_asamblea,
          '%d-%m-%Y'
        ) AS fecha_asamblea,

        CAST(
          COALESCE(a.monto, ?)
          AS DECIMAL(10,2)
        ) AS monto,

        CASE

          WHEN a.estado = 'PAGADO'
            THEN 'PAGADO'

          WHEN a.estado IS NOT NULL
            THEN a.estado

          ELSE 'PENDIENTE'

        END AS estado,

        p.estado AS estado_periodo

      FROM socio s

      INNER JOIN persona p2
        ON p2.id_persona = s.id_persona

      INNER JOIN periodo p
        ON p.id_grupo = s.id_grupo

      LEFT JOIN aporte a
        ON a.id_periodo = p.id_periodo
        AND a.id_socio = s.id_socio

      WHERE s.id_grupo = ?

        -- 🔥 desde ingreso del socio
        AND p.fecha_asamblea >= s.fecha_ingreso

        AND (
          -- 🔥 mostrar abiertos/cerrados
          p.estado IN ('ABIERTO', 'CERRADO')

          -- 🔥 o pagos adelantados
          OR a.estado = 'PAGADO'
        )

      ORDER BY
        p.fecha_asamblea DESC,
        socio ASC
      `,
      [
        montoAporte,
        id_grupo
      ]
    );

    // 🔥 formatear
    const data = rows

      .map((item: any) => ({
        id_socio: item.id_socio,
        socio: item.socio,
        fecha_asamblea: item.fecha_asamblea,
        monto: Number(item.monto),
        estado: item.estado,
        estado_periodo: item.estado_periodo,
      }))

      // 🔥 no mostrar pendientes futuros
      .filter((item: any) => {
        return !(
          item.estado === "PENDIENTE" &&
          item.estado_periodo === "PENDIENTE"
        );
      });

    // 🔥 total dinero pagado
    const totalPagado = data
      .filter((item: any) => item.estado === "PAGADO")
      .reduce((acc: number, item: any) => acc + item.monto, 0);

    // 🔥 total dinero pendiente
    const totalPendiente = data
      .filter((item: any) =>
        item.estado === "PENDIENTE" ||
        item.estado === "ATRASADO"
      )
      .reduce((acc: number, item: any) => acc + item.monto, 0);

    // 🔥 cantidad pagados
    const cantidadPagados = data.filter(
      (item: any) => item.estado === "PAGADO"
    ).length;

    // 🔥 cantidad pendientes
    const cantidadPendientes = data.filter(
      (item: any) =>
        item.estado === "PENDIENTE" ||
        item.estado === "ATRASADO"
    ).length;

    return res.status(200).json({
      mensaje: "Aportes del grupo",

      totalPagado,
      totalPendiente,

      cantidadPagados,
      cantidadPendientes,

      data,
    });

  } catch (error) {

    console.error("Error listarAportesGrupo:", error);

    return res.status(500).json({
      mensaje: "Error al listar aportes del grupo",
      data: null
    });

  }
};
export const listarMisAportes1 = async (req: Request, res: Response) => {
  try {
    const { id_socio, id_grupo } = (req as any).usuario;

    if (!id_socio) {
      return res.status(403).json({ mensaje: "El usuario no es un socio" });
    }

    const [socio]: any = await conmysql.query(`SELECT fecha_ingreso FROM socio WHERE id_socio = ? AND id_grupo = ?`, [id_socio, id_grupo]);

    if (!socio.length) {
      return res.status(404).json({ mensaje: "Socio no encontrado" });
    }

    const fechaIngreso = socio[0].fecha_ingreso;

    const [rows]: any = await conmysql.query(
      `
      SELECT
        DATE_FORMAT(p.fecha_asamblea, '%d-%m-%Y') AS fecha_asamblea,
        CAST(a.monto AS DECIMAL(10,2)) AS monto, a.estado
      FROM aporte a
      INNER JOIN periodo p ON p.id_periodo = a.id_periodo
      WHERE a.id_socio = ?
        AND p.id_grupo = ?
        AND p.fecha_asamblea >= ?
        AND a.estado = 'PAGADO'
        AND p.estado = 'CERRADO'
      ORDER BY p.fecha_asamblea DESC
      `,
      [id_socio, id_grupo, fechaIngreso]
    );

    const data = rows.map((item: any) => ({ ...item, monto: Number(item.monto) }));

    const totalMonto = data.reduce((acc: number, item: any) => acc + item.monto, 0);

    return res.status(200).json({ mensaje: "Mis Aportes pagados", totalMonto, data });

  } catch (error) {
    console.error("Error listarMisAportes:", error);
    return res.status(500).json({ mensaje: "Error al listar aportes", data: null });
  }
};

export const listarMisAportes = async (req: Request, res: Response) => {
  try {

    const { id_socio, id_grupo } = (req as any).usuario;

    if (!id_socio) {
      return res.status(403).json({ mensaje: "El usuario no es un socio" });
    }

    const [socio]: any = await conmysql.query(`SELECT fecha_ingreso FROM socio WHERE id_socio = ? AND id_grupo = ?`, [id_socio, id_grupo]);

    if (!socio.length) {
      return res.status(404).json({ mensaje: "Socio no encontrado" });
    }

    const fechaIngreso = socio[0].fecha_ingreso;

    const [config]: any = await conmysql.query(`SELECT monto FROM configuracion_aporte WHERE id_grupo = ? AND estado = 'ACTIVO' 
      ORDER BY fecha_inicio DESC LIMIT 1`, [id_grupo]
    );

    const montoAporte = Number(config[0]?.monto || 0);

    const [rows]: any = await conmysql.query(
      `
      SELECT
        DATE_FORMAT(p.fecha_asamblea, '%d-%m-%Y') AS fecha_asamblea,
        CAST(
          COALESCE(a.monto, ?)
          AS DECIMAL(10,2)
        ) AS monto,
        CASE
          WHEN a.estado = 'PAGADO'
            THEN 'PAGADO'
          WHEN a.estado IS NOT NULL
            THEN a.estado
          ELSE 'PENDIENTE'
        END AS estado
      FROM periodo p
      LEFT JOIN aporte a
        ON a.id_periodo = p.id_periodo
        AND a.id_socio = ?
      WHERE p.id_grupo = ?
        AND p.fecha_asamblea >= ?
        AND (
          p.estado IN ('ABIERTO', 'CERRADO')
          OR a.estado = 'PAGADO'
        )
      ORDER BY p.fecha_asamblea DESC
      `,
      [montoAporte, id_socio, id_grupo, fechaIngreso]
    );

    const data = rows
      .map((item: any) => ({
        fecha_asamblea: item.fecha_asamblea, monto: Number(item.monto), estado: item.estado, estado_periodo: item.estado_periodo,
      }))

      .filter((item: any) => {
        return !(item.estado === "PENDIENTE" && item.estado_periodo === "PENDIENTE");
      });

    const totalPagado = data
      .filter((item: any) => item.estado === "PAGADO")
      .reduce((acc: number, item: any) => acc + item.monto, 0);

    const totalPendiente = data
      .filter((item: any) => item.estado === "PENDIENTE")
      .reduce((acc: number, item: any) => acc + item.monto, 0);

    return res.status(200).json({ mensaje: "Mis aportes", totalPagado, totalPendiente, data });

  } catch (error) {
    console.error("Error listarMisAportes:", error);
    return res.status(500).json({ mensaje: "Error al listar aportes", data: null });

  }
};

export const obtenerMiProximoPago = async (req: Request, res: Response) => {
  try {
    const { id_socio, id_grupo } = (req as any).usuario;

    if (!id_socio) {
      return res.status(403).json({ mensaje: "El usuario no es un socio" });
    }

    const [aporteRows]: any = await conmysql.query(
      `
      SELECT
        CAST(a.monto AS DECIMAL(10,2)) AS monto
      FROM aporte a
      INNER JOIN periodo p
        ON p.id_periodo = a.id_periodo
      WHERE a.id_socio = ?
      AND p.id_grupo = ?
      AND a.estado IN ('PENDIENTE', 'ATRASADO')
      ORDER BY p.anio ASC, p.mes ASC
      LIMIT 1
      `,
      [id_socio, id_grupo]
    );

    const [cuotaRows]: any = await conmysql.query(
      `
      SELECT
        CAST(pc.cuota AS DECIMAL(10,2)) AS cuota,
        CAST(pc.mora AS DECIMAL(10,2)) AS mora
      FROM prestamo_cuota pc
      INNER JOIN prestamo pr
        ON pr.id_prestamo = pc.id_prestamo
      WHERE pr.id_socio = ?
      AND pr.id_grupo = ?
      AND pr.estado = 'ACTIVO'
      AND pc.estado IN ('PENDIENTE', 'ATRASADO')
      ORDER BY pc.numero ASC
      LIMIT 1
      `,
      [id_socio, id_grupo]
    );

    const aporteMensual = aporteRows[0] ? Number(aporteRows[0].monto) : 0;

    const cuotaPrestamo = cuotaRows[0] ? Number(cuotaRows[0].cuota) : 0;

    const mora = cuotaRows[0] ? Number(cuotaRows[0].mora) : 0;
    const total = aporteMensual + cuotaPrestamo + mora;

    res.status(200).json({
      mensaje: "Mi próximo pago",
      data: { aporte_mensual: aporteMensual, cuota_prestamo: cuotaPrestamo, mora, total },
    });
  } catch (error) {
    console.error("Error obtenerMiProximoPago:", error);
    res.status(500).json({ mensaje: "Error al obtener el próximo pago", data: null });
  }
};

export const editarSocio = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario = (req as any).usuario;
    const { id_socio } = req.params;

    const { nombres, apellidos, correo, telefono, direccion, estado } = req.body;

    const [socio]: any = await conmysql.query(`SELECT s.id_socio, s.id_grupo, s.id_persona FROM socio s
      WHERE s.id_socio = ?`, [id_socio]
    );

    if (socio.length === 0) {
      res.status(404).json({ mensaje: 'Socio no encontrado' }); return;
    }

    const socioData = socio[0];

    const grupoPermitido = resolverGrupoPermitido(usuario, socioData.id_grupo);

    if (grupoPermitido !== socioData.id_grupo) {
      res.status(403).json({ mensaje: 'No tienes permisos' }); return;
    }

    await conmysql.query(`UPDATE persona
      SET nombres = ?, apellidos = ?, correo = ?, telefono = ?, direccion = ?
      WHERE id_persona = ?`,
      [nombres, apellidos, correo, telefono, direccion, socioData.id_persona]
    );

    if (estado !== undefined) {
      await conmysql.query(`UPDATE socio SET estado = ? WHERE id_socio = ?`, [estado, id_socio]);
    }

    res.status(200).json({ mensaje: 'Socio actualizado correctamente', data: null });

  } catch (error) {
    console.error('Error editarSocio:', error);
    res.status(500).json({ mensaje: 'Error del servidor', data: null });
  }
};

export const registrarSocio = async (req: Request, res: Response): Promise<void> => {
  const conn = await conmysql.getConnection();

  try {
    const usuarioAuth = (req as any).usuario;

    const { identificacion, nombres, apellidos, correo, telefono, direccion, id_grupo, fecha_ingreso } = req.body;

    if (!identificacion || !nombres || !apellidos || !correo || !id_grupo || !direccion) {
      res.status(400).json({ mensaje: 'Faltan datos obligatorios.', data: null }); return;
    }

    const grupoPermitido = resolverGrupoPermitido(usuarioAuth, id_grupo);

    if (!grupoPermitido) {
      res.status(400).json({ mensaje: 'Grupo inválido.' }); return;
    }

    await conn.beginTransaction();

    const [perfilSocio]: any = await conn.query(`SELECT id_perfil FROM perfil WHERE nombre = 'SOCIO' LIMIT 1`);

    if (perfilSocio.length === 0) {
      throw new Error('Perfil SOCIO no existe.');
    }

    const id_perfil_socio = perfilSocio[0].id_perfil;

    const [existeUsuario]: any = await conn.query(
      `SELECT u.id_usuario FROM usuario u INNER JOIN persona p ON u.id_persona = p.id_persona WHERE p.cedula = ?`, [identificacion]
    );

    if (existeUsuario.length > 0) {
      await conn.rollback();

      res.status(409).json({ mensaje: 'Usuario ya existe.' }); return;
    }

    const [personaExistente]: any = await conn.query(`SELECT id_persona FROM persona WHERE cedula = ?`, [identificacion]);

    let id_persona: number;

    if (personaExistente.length > 0) {
      id_persona = personaExistente[0].id_persona;

      await conn.query(
        `UPDATE persona
          SET nombres = ?, apellidos = ?, telefono = ?, direccion = ?, correo = ?
        WHERE id_persona = ?`,
        [nombres, apellidos, telefono, direccion, correo, id_persona]
      );
    } else {
      const [persona]: any = await conn.query(
        `
        INSERT INTO persona (nombres,apellidos, cedula, telefono, direccion, correo)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [nombres, apellidos, identificacion, telefono, direccion, correo]
      );

      id_persona = persona.insertId;
    }

    const [existeSocio]: any = await conn.query(`SELECT id_socio FROM socio WHERE id_persona = ? AND id_grupo = ?`, [id_persona, grupoPermitido]);

    if (existeSocio.length > 0) {
      await conn.rollback();

      res.status(409).json({ mensaje: 'Ya es socio en este grupo.' }); return;
    }

    const contrasenaTemporal = identificacion;

    const hashedPassword = await bcrypt.hash(contrasenaTemporal, 10);

    const [usuario]: any = await conn.query(`INSERT INTO usuario (id_persona, clave) VALUES (?, ?)`, [id_persona, hashedPassword]);

    const id_usuario = usuario.insertId;

    await conn.query(`INSERT INTO usuario_perfil (id_usuario, id_perfil) VALUES (?, ?)`, [id_usuario, id_perfil_socio]);

    const [socio]: any = await conn.query(`INSERT INTO socio (id_persona, id_grupo, fecha_ingreso) VALUES (?, ?, ?)`,
      [id_persona, grupoPermitido, fecha_ingreso || new Date().toISOString().split('T')[0]]
    );

    const id_socio = socio.insertId;

    const [grupo]: any = await conn.query(`SELECT nombre FROM grupo WHERE id_grupo = ?`, [grupoPermitido]);

    const nombre_grupo = grupo[0]?.nombre || 'SIN GRUPO';

    await conn.commit();

    const nombreCompleto = `${nombres} ${apellidos}`.toUpperCase();

    const emailContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="text-align: center; margin-bottom: 15px;">
          <h2 style="color: #0056b3;">Bienvenido(a) al Grupo de Ahorro "${nombre_grupo}"</h2>
        </div>

        <p>Estimado(a) <strong>${nombreCompleto}</strong>,</p>

        <p>
          Se ha registrado como socio del grupo de ahorro y caja chica 
          <strong>"${nombre_grupo}"</strong>. 
          A partir de ahora podrá realizar sus aportes mensuales y acceder a préstamos.
        </p>

        <p><strong>Datos de acceso:</strong></p>

        <ul style="list-style: none; padding-left: 0;">
          <li><strong>Usuario:</strong> ${identificacion}</li>
          <li><strong>Contraseña temporal:</strong>
            <span style="font-size: 16px; color: #007bff;">${contrasenaTemporal}</span>
          </li>
        </ul>

        <p>⚠️ Cambie su contraseña al ingresar por primera vez.</p>

        <br/>

        <p><strong>Atentamente,</strong><br/>
        Administración - "${nombre_grupo}"</p>
      </div>
    `;

    try {
      await sendEmail(correo, `Bienvenido(a) al Grupo de Ahorro "${nombre_grupo}"`, emailContent);
    } catch (emailError) {
      console.error('Error enviando correo:', emailError);
    }

    res.status(201).json({ mensaje: 'Socio registrado correctamente', data: { id_usuario, id_socio, id_grupo: grupoPermitido, nombre_grupo } });
  } catch (error) {
    await conn.rollback();
    console.error('Error al registrar socio:', error);
    res.status(500).json({ mensaje: 'Error del servidor', data: null });
  } finally {
    conn.release();
  }
};

export const listarSocios = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario = (req as any).usuario;
    const { id_grupo } = req.query;

    const idGrupo = id_grupo ? Number(id_grupo) : undefined;

    const grupoFiltro = resolverGrupoPermitido(usuario, idGrupo);

    let sql = `
      SELECT
        s.id_socio, p.cedula,
        CONCAT(p.apellidos, ' ', p.nombres) AS nombre_completo,
        p.correo, p.telefono,
        DATE_FORMAT(s.fecha_ingreso, '%d/%m/%Y') AS fecha_ingreso,
        s.estado, g.id_grupo, g.nombre
      FROM socio s
      INNER JOIN persona p ON s.id_persona = p.id_persona
      INNER JOIN grupo g ON s.id_grupo = g.id_grupo
      WHERE 1=1
    `;

    const params: any[] = [];

    if (grupoFiltro !== null && grupoFiltro !== undefined) {
      sql += ` AND s.id_grupo = ?`;
      params.push(grupoFiltro);
    }

    sql += ` ORDER BY g.nombre, p.apellidos, p.nombres`;

    const [rows]: any = await conmysql.query(sql, params);

    res.status(200).json({ mensaje: 'Socios encontrados', data: rows });

  } catch (error) {
    console.error('Error listarSocios:', error);
    res.status(500).json({ mensaje: 'Error del servidor', data: null });
  }
};

export const obtenerSocioPorId = async (req: Request, res: Response): Promise<void> => {
  try {
    const usuario = (req as any).usuario;
    const { id_socio } = req.params;

    const idSocio = Number(id_socio);

    const grupoFiltro = resolverGrupoPermitido(usuario);

    let sql = `
      SELECT
        s.id_socio, s.id_grupo, s.estado,
        DATE_FORMAT(s.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
        p.id_persona, p.cedula, p.nombres, p.apellidos, 
        p.correo, p.telefono, p.direccion, 
        g.nombre AS grupo
      FROM socio s
      INNER JOIN persona p ON s.id_persona = p.id_persona
      INNER JOIN grupo g ON s.id_grupo = g.id_grupo
      WHERE s.id_socio = ?
    `;

    const params: any[] = [idSocio];

    if (grupoFiltro !== null && grupoFiltro !== undefined) {
      sql += ` AND s.id_grupo = ?`;
      params.push(grupoFiltro);
    }

    const [rows]: any = await conmysql.query(sql, params);

    if (rows.length === 0) {
      res.status(404).json({ mensaje: 'Socio no encontrado o sin permisos', data: null }); return;
    }

    res.status(200).json({ mensaje: 'Socio encontrado', data: rows[0] });

  } catch (error) {
    console.error('Error obtenerSocioPorId:', error);
    res.status(500).json({ mensaje: 'Error del servidor', data: null });
  }
};

