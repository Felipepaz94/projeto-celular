"use client";

import {useMemo, useState} from "react";
import {Trash2} from "lucide-react";

export default function FabricantesPage({fabricantes, products, onAdd, onDelete}) {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => fabricantes
    .map(nome => ({
      nome,
      usos: products.filter(product => String(product.fabricante || "").toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR")).length,
    }))
    .filter(item => item.nome.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")))
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome)), [fabricantes, products, search]);

  const submit = async event => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    await onAdd(clean);
    setName("");
    setSaving(false);
  };

  return (
    <div className="panel manufacturers-panel">
      <div className="panel-head">
        <div>
          <h2><i className="ti ti-building-factory-2" aria-hidden="true"></i>Fabricantes</h2>
          <span className="sub">{fabricantes.length} cadastrados · ordenados pelos mais usados</span>
        </div>
      </div>

      <form className="manufacturer-toolbar" onSubmit={submit}>
        <div className="field">
          <label htmlFor="manufacturer-name">Novo fabricante</label>
          <input id="manufacturer-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Asus" />
        </div>
        <button className="btn primary" type="submit" disabled={saving || !name.trim()}>
          <i className="ti ti-plus" aria-hidden="true"></i>{saving ? "Salvando..." : "Adicionar fabricante"}
        </button>
        <div className="field manufacturer-search">
          <label htmlFor="manufacturer-search">Buscar fabricante</label>
          <input id="manufacturer-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Digite o nome..." />
        </div>
      </form>

      <div className="manufacturer-list">
        {rows.map(item => (
          <div className="manufacturer-row" key={item.nome}>
            <div className="manufacturer-avatar">{item.nome.slice(0, 1).toUpperCase()}</div>
            <div className="manufacturer-name"><strong>{item.nome}</strong><span>{item.usos} {item.usos === 1 ? "produto cadastrado" : "produtos cadastrados"}</span></div>
            <span className="usage-badge">{item.usos} usos</span>
            <button className="icon-btn danger" type="button" onClick={() => onDelete(item.nome)} disabled={item.usos > 0} title={item.usos > 0 ? "Fabricante em uso não pode ser excluído" : "Excluir fabricante"} aria-label={`Excluir ${item.nome}`}>
              <Trash2 size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        ))}
        {!rows.length && <div className="empty">Nenhum fabricante encontrado.</div>}
      </div>
    </div>
  );
}
