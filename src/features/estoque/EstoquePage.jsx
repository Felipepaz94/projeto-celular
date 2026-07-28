export const estoqueMenu = {key: "estoque", label: "Estoque", icon: "ti-list", count: "products"};

export default function EstoquePage({children}) {
  return <section data-menu-page="estoque">{children}</section>;
}
