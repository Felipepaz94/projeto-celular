"use client";

import {useState} from "react";
import {createPortal} from "react-dom";
import {Field} from "@/features/estoque/components/FormControls";

function onlyDigits(value, limit) {
  return String(value || "").replace(/\D/g, "").slice(0, limit);
}

function formatPhone(value) {
  const digits = onlyDigits(value, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDocument(value) {
  const digits = onlyDigits(value, 14);
  if (digits.length <= 11) {
    return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\/\d{4})(\d)/, "$1-$2");
}

function normalizeEmail(value) {
  return String(value || "").trimStart().replace(/\s/g, "").toLowerCase();
}

export default function PessoaModal({pessoa, defaultRole = "cliente", title, onSave, onCancel}) {
  const [form, setForm] = useState(() => ({
    nome: pessoa?.nome || "",
    contato: pessoa?.contato || "",
    email: pessoa?.email || "",
    documento: pessoa?.documento || "",
    observacoes: pessoa?.observacoes || "",
    cliente: pessoa ? pessoa.cliente !== false : defaultRole === "cliente",
    fornecedor: pessoa ? Boolean(pessoa.fornecedor) : defaultRole === "fornecedor",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field, value) => setForm(previous => ({...previous, [field]: value}));

  const submit = async event => {
    event.preventDefault();
    event.stopPropagation();
    const phoneDigits = onlyDigits(form.contato, 11);
    const documentDigits = onlyDigits(form.documento, 14);
    if (phoneDigits && ![10, 11].includes(phoneDigits.length)) return setError("Informe um telefone com DDD e 10 ou 11 dígitos.");
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Informe um e-mail válido, por exemplo: nome@empresa.com.br.");
    if (documentDigits && ![11, 14].includes(documentDigits.length)) return setError("Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.");
    if (!form.nome.trim()) return setError("Informe o nome ou a razão social.");
    if (!form.cliente && !form.fornecedor) return setError("Marque Cliente, Fornecedor ou os dois.");
    setSaving(true);
    setError("");
    try {
      await onSave({...form, nome: form.nome.trim(), contato: formatPhone(form.contato), email: normalizeEmail(form.email).trim(), documento: formatDocument(form.documento)});
    } catch (err) {
      setError(err.message || "Não foi possível salvar o cadastro.");
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal((
    <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <form className="modal pessoa-modal" onSubmit={submit}>
        <h3><i className="ti ti-address-book" aria-hidden="true"></i>{title || (pessoa ? "Editar cadastro" : "Novo cadastro")}</h3>
        <p>Um mesmo cadastro pode ser cliente, fornecedor ou exercer os dois papéis.</p>
        <div className="pessoa-form-grid">
          <Field label="Nome / razão social" required span2><input autoFocus value={form.nome} placeholder="Ex.: João da Silva ou Empresa LTDA" onChange={event => set("nome", event.target.value)} /></Field>
          <Field label="Telefone / contato"><input type="tel" inputMode="numeric" maxLength={15} value={formatPhone(form.contato)} placeholder="Ex.: (85) 99999-9999" onChange={event => set("contato", formatPhone(event.target.value))} /></Field>
          <Field label="E-mail"><input type="email" inputMode="email" autoComplete="email" value={form.email} placeholder="Ex.: contato@empresa.com.br" onChange={event => set("email", normalizeEmail(event.target.value))} /></Field>
          <Field label="CPF / CNPJ" span2><input type="text" inputMode="numeric" maxLength={18} value={formatDocument(form.documento)} placeholder="Ex.: 123.456.789-00 ou 12.345.678/0001-00" onChange={event => set("documento", formatDocument(event.target.value))} /></Field>
          <Field label="Observações" span2><textarea rows="3" value={form.observacoes} placeholder="Ex.: Preferência de contato, endereço ou informações adicionais" onChange={event => set("observacoes", event.target.value)} /></Field>
        </div>
        <div className="pessoa-role-picker">
          <label><input type="checkbox" checked={form.cliente} onChange={event => set("cliente", event.target.checked)} /> Cliente</label>
          <label><input type="checkbox" checked={form.fornecedor} onChange={event => set("fornecedor", event.target.checked)} /> Fornecedor</label>
        </div>
        {error && <div className="err pessoa-error">{error}</div>}
        <div className="row">
          <button className="btn ghost" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar cadastro"}</button>
        </div>
      </form>
    </div>
  ), document.body);
}
