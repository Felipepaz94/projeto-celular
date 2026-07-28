export const configuracoesMenu = {key: "config", label: "Configurações", icon: "ti-settings"};

export default function ConfiguracoesPage({children}) {
  return <section data-menu-page="configuracoes">{children}</section>;
}
