"use client";

import {useEffect, useRef, useState} from "react";
import {Plus} from "lucide-react";
import PessoaModal from "@/features/pessoas/PessoaModal";

export default function SupplierCombo({value, onChange, suppliers, onAdd}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [showCreate, setShowCreate] = useState(false);
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
      <button className="btn supplier-new-btn" type="button" onClick={() => { setOpen(false); setShowCreate(true); }} aria-label="Novo fornecedor" title="Novo fornecedor">
        <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {showCreate && <PessoaModal defaultRole="fornecedor" title="Novo fornecedor" onSave={createComplete} onCancel={() => setShowCreate(false)} />}
    </div>
  );
}
