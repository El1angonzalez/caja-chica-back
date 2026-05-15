export interface Perfil {
  id_perfil: number;
  nombre_perfil?: string;
}

export interface Menu {
  id_menu: number;
  descripcion_menu: string;
  url_menu?: string;
  parent_id?: number | null;
  icono?: string;
  estado_menu?: string;
}

export interface Acceso {
  id_acceso: number;
  id_perfil: number;
  id_menu: number;
}

export interface Persona {
  id_persona: number;
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  direccion?: string;
  correo?: string;
  estado_persona?: string;
  fecha_registro?: Date;
}

export interface Usuario {
  id_usuario: number;
  id_persona: number;
  clave: string;
  estado_usuario?: string;
  fecha_creacion?: Date;
}

export interface UsuarioPerfil {
  id_usuario_perfil: number;
  id_usuario: number;
  id_perfil: number;
  estado?: string;
}

export interface Grupo {
  id_grupo: number;
  nombre_grupo: string;
  fecha_creacion?: Date;
  estado_grupo?: string;
}

export interface Socio {
  id_socio: number;
  id_persona: number;
  id_grupo: number;
  fecha_ingreso: Date;
  estado_socio?: string;
}

export interface Aporte {
  id_aporte: number;
  id_socio: number;
  monto: number;
  fecha?: Date;
}