"use client";

import ModalBackdrop from "@/components/shared/ModalBackdrop";
import SearchInput from "@/components/shared/SearchInput";
import Pagination from "@/components/shared/Pagination";


import {useId, useRef, useState, useEffect} from "react";
import {createPortal} from "react-dom";
import {Search, X} from "lucide-react";

export default function SearchPicker({query, onQueryChange, results, onSelect, renderItem, isDisabled = () => false, placeholder, label, icon = <Search size={19} />, autoFocus = false, required = false, renderModal}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef(null);
  const id = useId();
  const close = () => { setOpen(false); input.current?.focus(); };
  const choose = item => { onSelect(item); setFocused(false); };
  return <div className="search-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="pdv-product-search-row">
      <SearchInput ref={input} type="text" aria-label={label} aria-controls={focused && query.trim() ? id : undefined} placeholder={placeholder} value={query} required={required} autoFocus={autoFocus} autoComplete="off" onFocus={() => setFocused(true)} onChange={event => { onQueryChange(event.target.value); setFocused(true); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setFocused(false); } }} clearable onClear={() => { onQueryChange(""); }} clearClassName="pdv-search-clear" />
      <button type="button" className="btn pdv-stock-consult-button" onClick={() => { setFocused(false); setOpen(true); }} aria-label={label} title={label}>{icon}</button>
    </div>
    {focused && query.trim() && <div id={id} className="pdv-search-results">{results.length ? results.map(item => <button key={item.id} type="button" className={"pdv-result search-picker-result" + (isDisabled(item) ? " disabled" : "")} disabled={Boolean(isDisabled(item))} onClick={() => choose(item)}>{renderItem(item)}</button>) : <div className="stock-consult-empty" role="status">Nenhum resultado encontrado.</div>}</div>}
    {open && createPortal(renderModal({onClose: close, onSelect: item => { choose(item); close(); }}), document.body)}
  </div>;
}

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const sellerName = seller => seller.full_name || seller.email || "Vendedor sem nome";
const matches = (seller, query) => normalize(`${sellerName(seller)} ${seller.email || ""}`).includes(normalize(query.trim()));
const renderSeller = seller => <div><div className="pr-name">{sellerName(seller)}</div>{seller.full_name && <div className="pr-sub">{seller.email}</div>}</div>;

function SellerModal({sellers, onSelect, onClose}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const ref = useRef(null);
  const titleId = useId();
  const filtered = sellers.filter(seller => matches(seller, query));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { ref.current?.querySelector("input")?.focus(); }, []);
  return <ModalBackdrop className="modal-bg search-picker-modal-bg" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const elements = [...ref.current.querySelectorAll('button:not(:disabled), input')];
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }} onClose={() => { onClose(); }}><div ref={ref} className="modal stock-consult-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="stock-consult-head"><div><h3 id={titleId}>Selecionar vendedor</h3><p>Busque ou selecione um vendedor na lista.</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar lista de vendedores"><X size={18} /></button></div>
    <SearchInput aria-label="Buscar vendedor" placeholder="Buscar vendedor por nome..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
    <div className="stock-consult-summary" role="status">{filtered.length} {filtered.length === 1 ? "vendedor encontrado" : "vendedores encontrados"}</div>
    <div className="stock-consult-list">{filtered.slice((currentPage - 1) * 5, currentPage * 5).map(seller => <button type="button" className="pdv-result search-picker-result" key={seller.id} onClick={() => onSelect(seller)}>{renderSeller(seller)}</button>)}{!filtered.length && <div className="stock-consult-empty">Nenhum vendedor encontrado.</div>}</div>
    <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
  </div></ModalBackdrop>;
}

export function SellerSearchPicker({sellers, value, onChange}) {
  const selected = sellers.find(seller => seller.id === value);
  const [query, setQuery] = useState(selected ? sellerName(selected) : "");
  return <SearchPicker query={query} onQueryChange={text => { setQuery(text); if (value) onChange(""); }} results={sellers.filter(seller => matches(seller, query)).slice(0, 5)} onSelect={seller => { onChange(seller.id); setQuery(sellerName(seller)); }} renderItem={renderSeller} placeholder="Buscar vendedor por nome..." label="Consultar vendedores" required renderModal={props => <SellerModal sellers={sellers} {...props} />} />;
}
