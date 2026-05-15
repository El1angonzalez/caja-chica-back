import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { conmysql } from '../db';
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRACION = "2h";

if (!JWT_SECRET) {
  throw new Error("Falta JWT_SECRET en el archivo .env");
}

export const initUsuarios = async (req: Request, res: Response) => {
  try {

    const [personas]: any = await conmysql.query(
      "SELECT id_persona, cedula FROM persona ORDER BY id_persona ASC"
    );

    for (const p of personas) {

      const [existe]: any = await conmysql.query(
        "SELECT id_usuario FROM usuario WHERE id_persona = ?",
        [p.id_persona]
      );

      if (existe.length > 0) continue;

      const hash = await bcrypt.hash(p.cedula, 10);

      await conmysql.query(
        `INSERT INTO usuario (id_persona, clave, estado)
         VALUES (?, ?, 'ACTIVO')`,
        [p.id_persona, hash]
      );
    }

    res.json({ mensaje: 'Usuarios creados correctamente 🔥' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear usuarios' });
  }
};

export const iniciarSesion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { usuario, clave } = req.body;

    if (!usuario || !clave) {
      res.status(400).json({ mensaje: 'Cédula y clave son obligatorias.' }); return;
    }

    const [rows]: any = await conmysql.query(
      `
      SELECT 
        u.id_usuario, u.clave, u.estado,
        p.id_persona, p.nombres, p.apellidos, p.cedula
      FROM usuario u
      INNER JOIN persona p ON u.id_persona = p.id_persona
      WHERE p.cedula = ?
      `,
      [usuario]
    );

    if (rows.length === 0) {
      res.status(404).json({ mensaje: 'Usuario no encontrado.' }); return;
    }

    const u = rows[0];

    if (u.estado !== 'ACTIVO') {
      res.status(403).json({ mensaje: 'La cuenta no está activa.' }); return;
    }

    const ok = await bcrypt.compare(clave, u.clave);

    if (!ok) {
      res.status(401).json({ mensaje: 'Clave incorrecta.' }); return;
    }

    const [perfiles]: any = await conmysql.query(
      `
      SELECT p.id_perfil, p.nombre
      FROM usuario_perfil up
      INNER JOIN perfil p ON up.id_perfil = p.id_perfil
      WHERE up.id_usuario = ?
      `,
      [u.id_usuario]
    );

    const listaPerfiles = perfiles.map((p: any) => p.nombre);

    let id_grupo = null;
    let id_socio = null;

    if (
      listaPerfiles.includes('SOCIO') ||
      listaPerfiles.includes('TESORERO')
    ) {
      const [socio]: any = await conmysql.query(
        `
        SELECT id_socio, id_grupo
        FROM socio
        WHERE id_persona = ?
        LIMIT 1
        `,
        [u.id_persona]
      );

      if (socio.length > 0) {
        id_grupo = socio[0].id_grupo;
        id_socio = socio[0].id_socio;
      }
    }

    const token = jwt.sign(
      {
        id_usuario: u.id_usuario,
        cedula: u.cedula,
        perfiles: listaPerfiles,
        id_grupo,
        id_socio
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRACION }
    );

    const accesosMap = new Map<number, any>();

    for (const perfil of perfiles) {
      const [menus]: any = await conmysql.query(
        `
        SELECT m.id_menu, m.nombre, m.url, m.parent_id, m.icono
        FROM acceso a
        INNER JOIN menu m ON a.id_menu = m.id_menu
        WHERE a.id_perfil = ?
        AND m.estado = 'ACTIVO'
        ORDER BY m.parent_id, m.id_menu
        `,
        [perfil.id_perfil]
      );

      menus.forEach((m: any) => {
        if (m.parent_id === null) {
          if (!accesosMap.has(m.id_menu)) {
            accesosMap.set(m.id_menu, {
              id_menu: m.id_menu,
              nombre: m.nombre,
              url: m.url,
              icono: m.icono,
              submenus: []
            });
          }
        }
      });

      menus.forEach((m: any) => {
        if (m.parent_id !== null) {
          if (accesosMap.has(m.parent_id)) {

            const existe = accesosMap
              .get(m.parent_id)
              .submenus.some((s: any) => s.id_menu === m.id_menu);

            if (!existe) {
              accesosMap.get(m.parent_id).submenus.push({
                id_menu: m.id_menu,
                nombre: m.nombre,
                url: m.url,
                icono: m.icono
              });
            }
          }
        }
      });
    }

    const accesos = Array.from(accesosMap.values());

    res.status(200).json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      data: {
        id_usuario: u.id_usuario,
        nombres: u.nombres,
        apellidos: u.apellidos,
        cedula: u.cedula,
        perfiles: listaPerfiles,
        id_grupo,
        id_socio,
        accesos
      }
    });

  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ mensaje: 'Error al iniciar sesión.' });
  }
};

export const listarUsuarios = async (req: Request, res: Response): Promise<void> => {
  try {
    const sql = `
      SELECT
        u.id_usuario,
        u.identificacion,
        CONCAT(p.apellidos, ' ', p.nombres) AS nombre_completo,
        p.correo,
        p.telefono,               
        u.estado,
        per.id_perfil,
        per.nombre_perfil
      FROM usuario u
      INNER JOIN usuario_perfil up  ON up.id_usuario = u.id_usuario
      INNER JOIN perfil per         ON per.id_perfil = up.id_perfil
      LEFT JOIN persona p           ON p.identificacion = u.identificacion
      ORDER BY p.apellidos ASC, p.nombres ASC, per.nombre_perfil ASC
    `;

    const [rows]: any[] = await conmysql.query(sql);

    res.status(200).json({ mensaje: "Usuarios encontrados", data: rows });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    res.status(500).json({ mensaje: "Error del servidor", error });
  }
};

export const obtenerUsuarioPorId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_usuario } = req.params;

    if (!id_usuario) {
      res.status(400).json({ mensaje: 'El ID del usuario es obligatorio.' });
      return;
    }

    const [rows]: any[] = await conmysql.query(
      `SELECT
         u.id_usuario,
         u.identificacion,
         p.apellidos,
         p.nombres,
         p.correo,
         p.telefono,
         u.estado_usuario,
         per.id_perfil,
         per.nombre_perfil
       FROM usuario u
       LEFT JOIN persona p       ON p.identificacion = u.identificacion
       LEFT JOIN usuario_perfil up ON up.id_usuario = u.id_usuario
       LEFT JOIN perfil per      ON per.id_perfil = up.id_perfil
       WHERE u.id_usuario = ?`,
      [id_usuario]
    );

    if (rows.length === 0) {
      res.status(404).json({ mensaje: 'Usuario no encontrado.' });
      return;
    }

    res.status(200).json({ mensaje: 'Usuario encontrado.', data: rows[0] });
  } catch (error) {
    console.error('Error al obtener usuario por ID:', error);
    res.status(500).json({ mensaje: 'Error al obtener el usuario.' });
  }
};
