"use client";

import {useEffect, useRef, useState} from "react";
import {ChevronDown, ChevronUp, Menu, X} from "lucide-react";

const NAV_ITEMS = [
  {key: "cadastro", label: "Produto", icon: "ti-plus"},
  {key: "estoque", label: "Estoque", icon: "ti-list", countKey: "products"},
  {key: "clientes", label: "Clientes e fornecedores", icon: "ti-address-book", countKey: "clientes"},
  {key: "pdv", label: "PDV", icon: "ti-shopping-cart"},
  {key: "historico", label: "Vendas", icon: "ti-receipt", countKey: "sales"},
  {key: "comissoes", label: "Comissoes", icon: "ti-percentage"},
  {key: "fabricantes", label: "Fabricantes", icon: "ti-building-factory-2", countKey: "fabricantes"},
  {key: "usuarios", label: "Usuários", icon: "ti-users", supabaseOnly: true},
  {key: "config", label: "Configurações", icon: "ti-settings"},
];

function NavButton({item, active, count, onSelect, dropdown = false}) {
  return (
    <button className={(active ? "active" : "") + (dropdown ? " dropdown-item" : "")} type="button" onClick={() => onSelect(item.key)}>
      <i className={`ti ${item.icon}`} aria-hidden="true"></i>
      <span>{item.label}</span>
      {item.countKey && <span className="n">{count || 0}</span>}
    </button>
  );
}

export default function ResponsiveNavigation({allowedTabs, tab, onChange, counts, usingSupabase}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [primaryLimit, setPrimaryLimit] = useState(5);
  const navRef = useRef(null);
  const items = NAV_ITEMS.filter(item => allowedTabs.includes(item.key) && (!item.supabaseOnly || usingSupabase));
  const primaryItems = items.slice(0, primaryLimit);
  const extraItems = items.slice(primaryLimit);

  const select = key => {
    onChange(key);
    setMoreOpen(false);
    setMobileOpen(false);
  };

  useEffect(() => {
    const closeOutside = event => {
      if (!navRef.current?.contains(event.target)) {
        setMoreOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    const updateVisibleItems = () => {
      const width = navRef.current?.clientWidth || 0;
      setPrimaryLimit(width >= 1120 ? 8 : width >= 1020 ? 7 : width >= 940 ? 6 : 5);
    };
    updateVisibleItems();
    const observer = new ResizeObserver(updateVisibleItems);
    if (navRef.current) observer.observe(navRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="responsive-nav" ref={navRef} aria-label="Navegação principal">
      <div className="desktop-nav">
        <div className="nav-primary">
          {primaryItems.map(item => <NavButton key={item.key} item={item} active={tab === item.key} count={counts[item.countKey]} onSelect={select} />)}
        </div>
        {extraItems.length > 0 && (
          <div className="nav-more">
            <button
              type="button"
              className={`nav-more-trigger${extraItems.some(item => item.key === tab) ? " active" : ""}`}
              onClick={() => setMoreOpen(open => !open)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-label="Mostrar mais opções do menu"
            >
              {moreOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>
            {moreOpen && (
              <div className="nav-dropdown" role="menu">
                {extraItems.map(item => <NavButton key={item.key} item={item} active={tab === item.key} count={counts[item.countKey]} onSelect={select} dropdown />)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mobile-nav">
        <button className="hamburger-trigger" type="button" onClick={() => setMobileOpen(open => !open)} aria-expanded={mobileOpen} aria-label="Abrir menu">
          {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <span className="mobile-current">{items.find(item => item.key === tab)?.label}</span>
        {mobileOpen && (
          <div className="mobile-menu">
            {items.map(item => <NavButton key={item.key} item={item} active={tab === item.key} count={counts[item.countKey]} onSelect={select} dropdown />)}
          </div>
        )}
      </div>
    </nav>
  );
}
