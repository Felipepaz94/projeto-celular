"use client";

import {useEffect, useRef, useState} from "react";
import {Building2, Plus, Search, X} from "lucide-react";
import PessoaModal from "@/features/pessoas/PessoaModal";

export default function SupplierCombo({value, onChange, suppliers, onAdd}) {
  const suppliersPerPage = 5;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [showCreate, setShowCreate] = useState(false);
  const [showSupplierSearch, setShowSupplierSearch] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const wrapRef = useRef(null);

  useEffect(() => setQuery(value || ""), [value]);
  useEffect(() => {
    const handleClick = event => { if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = suppliers.filter(supplier => supplier.name.toLowerCase().includes(query.toLowerCase()));
  const exact = suppliers.some(supplier => supplier.name.toLowerCase() === query.trim().toLowerCase());
  const choose = name => { onChange(name); setQuery(name); setOpen(false); };
  const registeredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLocaleLowerCase("pt-BR").includes(supplierSearch.trim().toLocaleLowerCase("pt-BR"))
  );
  const supplierTotalPages = Math.max(1, Math.ceil(registeredSuppliers.length / suppliersPerPage));
  const currentSupplierPage = Math.min(supplierPage, supplierTotalPages);
  const visibleSuppliers = registeredSuppliers.slice(
    (currentSupplierPage - 1) * suppliersPerPage,
    currentSupplierPage * suppliersPerPage,
  );

  const chooseRegistered = name => {
    choose(name);
    setShowSupplierSearch(false);
    setSupplierSearch("");
    setSupplierPage(1);
  };

  const createQuick = async () => {
    const name = query.trim();
    if (!name) return;
    await onAdd(name);
    choose(name);
  };

  const createComplete = async data => {
    await onAdd({...data, fornecedor: true});
    choose(data.nome);
    setShowCreate(false);
  };

  return (
    <div className="supplier-combo-row">
      <div className="combo" ref={wrapRef}>
        <input
          type="text"
          value={query}
          placeholder="Pesquisar fornecedor..."
          onChange={event => { setQuery(event.target.value); onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && (
          <div className="combo-list">
            {filtered.map(supplier => <div className="combo-item" key={supplier.id} onMouseDown={() => choose(supplier.name)}>{supplier.name}</div>)}
            {query.trim() && !exact && (
              <div className="combo-item" onMouseDown={createQuick}>
                <span>Cadastrar apenas "{query.trim()}"</span>
                <span className="add-new"><i className="ti ti-plus" aria-hidden="true"></i> rápido</span>
              </div>
            )}
            {filtered.length === 0 && !query.trim() && <div className="combo-item combo-empty">Nenhum fornecedor encontrado</div>}
          </div>
        )}
      </div>
      <button className="btn supplier-search-btn" type="button" onClick={() => { setOpen(false); setSupplierSearch(""); setSupplierPage(1); setShowSupplierSearch(true); }} aria-label="Buscar fornecedores cadastrados" title="Buscar fornecedores cadastrados">
        <Search size={19} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <button className="btn supplier-new-btn" type="button" onClick={() => { setOpen(false); setShowCreate(true); }} aria-label="Novo fornecedor" title="Novo fornecedor">
        <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {showSupplierSearch && (
        <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) setShowSupplierSearch(false); }}>
          <div className="modal supplier-search-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-search-title">
            <div className="stock-consult-head">
              <div>
                <h3 id="supplier-search-title"><Building2 size={18} aria-hidden="true" />Fornecedores cadastrados</h3>
                <p>Selecione um fornecedor para preencher o produto</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowSupplierSearch(false)} aria-label="Fechar" title="Fechar"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className={"search" + (supplierSearch ? " has-clear" : "")}>
              <i className="ti ti-search" aria-hidden="true"></i>
              <input type="text" value={supplierSearch} onChange={event => { setSupplierSearch(event.target.value); setSupplierPage(1); }} placeholder="Buscar fornecedor cadastrado..." autoFocus />
              {supplierSearch && <button type="button" className="search-clear" onClick={() => { setSupplierSearch(""); setSupplierPage(1); }} aria-label="Limpar busca" title="Limpar busca"><X size={18} aria-hidden="true" /></button>}
            </div>
            <div className="stock-consult-summary">{registeredSuppliers.length} {registeredSuppliers.length === 1 ? "fornecedor encontrado" : "fornecedores encontrados"}</div>
            <div className="supplier-search-list">
              {registeredSuppliers.length === 0 ? (
                <div className="stock-consult-empty">Nenhum fornecedor cadastrado encontrado.</div>
              ) : visibleSuppliers.map(supplier => (
                <button type="button" className="supplier-search-item" key={supplier.id || supplier.name} onClick={() => chooseRegistered(supplier.name)}>
                  <Building2 size={18} aria-hidden="true" />
                  <span><strong>{supplier.name}</strong><small>Fornecedor</small></span>
                  <i className="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              ))}
            </div>
            {registeredSuppliers.length > 0 && (
              <div className="stock-pagination supplier-search-pagination">
                <button type="button" className="btn sm" disabled={currentSupplierPage === 1} onClick={() => setSupplierPage(page => Math.max(1, page - 1))}>
                  <i className="ti ti-chevron-left" aria-hidden="true"></i>Anterior
                </button>
                <span>Página {currentSupplierPage} de {supplierTotalPages}</span>
                <button type="button" className="btn sm" disabled={currentSupplierPage === supplierTotalPages} onClick={() => setSupplierPage(page => Math.min(supplierTotalPages, page + 1))}>
                  Próxima<i className="ti ti-chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {showCreate && <PessoaModal defaultRole="fornecedor" title="Novo fornecedor" onSave={createComplete} onCancel={() => setShowCreate(false)} />}
    </div>
  );
}
