export const usuariosMenu = {key: "usuarios", label: "Usuários", icon: "ti-users", supabaseOnly: true};

export default function UsuariosPage({children}) {
  return <section data-menu-page="usuarios">{children}</section>;
}
