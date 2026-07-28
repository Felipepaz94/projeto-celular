"use client";

import {useMemo, useState} from "react";
import {Plus} from "lucide-react";
import PessoaModal from "./PessoaModal";

export const pessoasMenu = {key: "clientes", label: "Clientes e fornecedores", icon: "ti-address-book", count: "people"};

const FILTERS = [
  {key: "todos", label: "Todos"},
  {key: "cliente", label: "Somente clientes"},
  {key: "fornecedor", label: "Somente fornecedores"},
  {key: "ambos", label: "Cliente + fornecedor"},
];

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export default function PessoasPage({pessoas, onSave}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("todos");
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const title = "Clientes e fornecedores";

  const counts = useMemo(() => ({
    todos: pessoas.length,
    cliente: pessoas.filter(person => person.cliente && !person.fornecedor).length,
    fornecedor: pessoas.filter(person => person.fornecedor && !person.cliente).length,
    ambos: pessoas.filter(person => person.cliente && person.fornecedor).length,
  }), [pessoas]);

  const filtered = useMemo(() => {
    const textQuery = normalizeText(query);
    const documentQuery = onlyDigits(query);
    return pessoas
      .filter(person => {
        if (roleFilter === "cliente") return person.cliente && !person.fornecedor;
        if (roleFilter === "fornecedor") return person.fornecedor && !person.cliente;
        if (roleFilter === "ambos") return person.cliente && person.fornecedor;
        return true;
      })
      .filter(person => !textQuery
        || normalizeText(person.nome).includes(textQuery)
        || (documentQuery && onlyDigits(person.documento).includes(documentQuery)))
      .sort((first, second) => first.nome.localeCompare(second.nome));
  }, [pessoas, query, roleFilter]);

  const save = async data => {
    await onSave(editing?.id || null, data);
    setEditing(null);
    setCreating(false);
  };

  return (
    <div className="panel pessoas-panel">
      <div className="panel-head">
        <div>
          <h2><i className="ti ti-address-book" aria-hidden="true"></i>{title}</h2>
          <span className="sub">{filtered.length} cadastro{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <button className="btn primary pessoa-add-btn" type="button" onClick={() => setCreating(true)} aria-label="Novo cadastro" title="Novo cadastro">
          <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="pessoas-tools">
        <div className="search pessoas-search">
          <i className="ti ti-search" aria-hidden="true"></i>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Digite o nome, CPF ou CNPJ..." aria-label="Buscar cadastro por nome, CPF ou CNPJ" />
          {query && <button type="button" className="search-clear" onClick={() => setQuery("")} title="Limpar busca"><i className="ti ti-x" aria-hidden="true"></i></button>}
        </div>
        <div className="pessoa-filters" role="group" aria-label="Filtrar tipo de cadastro">
          {FILTERS.map(filter => (
            <button type="button" key={filter.key} className={roleFilter === filter.key ? "active" : ""} onClick={() => setRoleFilter(filter.key)} aria-pressed={roleFilter === filter.key}>
              {filter.label}<span>{counts[filter.key]}</span>
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty"><i className="ti ti-user-search" aria-hidden="true"></i><p>{query ? "Nenhum cadastro encontrado para esse nome, CPF ou CNPJ." : "Nenhum cadastro encontrado para o filtro selecionado."}</p></div>
      ) : (
        <div className="pessoa-list">
          {filtered.map(person => (
            <button className="pessoa-card" type="button" key={person.id} onClick={() => setEditing(person)}>
              <div className="pessoa-avatar">{person.nome.slice(0, 1).toUpperCase()}</div>
              <div className="pessoa-main"><strong>{person.nome}</strong><span>{[person.contato, person.email, person.documento].filter(Boolean).join(" · ") || "Sem contato informado"}</span></div>
              <div className="pessoa-badges">{person.cliente && <span>Cliente</span>}{person.fornecedor && <span>Fornecedor</span>}{person.ativo === false && <span>Inativo</span>}</div>
              <i className="ti ti-pencil" aria-hidden="true"></i>
            </button>
          ))}
        </div>
      )}
      {(creating || editing) && <PessoaModal pessoa={editing} defaultRole="cliente" title={editing ? "Editar cadastro" : "Novo cadastro"} onSave={save} onCancel={() => { setEditing(null); setCreating(false); }} />}
    </div>
  );
}
