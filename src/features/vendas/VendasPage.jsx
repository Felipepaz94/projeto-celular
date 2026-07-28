export const vendasMenu = {key: "historico", label: "Vendas", icon: "ti-receipt", count: "sales"};

export default function VendasPage({children}) {
  return <section data-menu-page="vendas">{children}</section>;
}
