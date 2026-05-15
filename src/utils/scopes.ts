export const resolverGrupoPermitido = (usuario: any, idGrupoSolicitado?: any): number | null => {

  if (usuario.perfiles.includes('ADMIN')) {
    if (idGrupoSolicitado !== undefined) {
      return Number(idGrupoSolicitado);
    }
    return null;
  }

  if (usuario.perfiles.includes('TESORERO')) {
    return Number(usuario.id_grupo);
  }

  throw new Error('Usuario sin permisos');
};