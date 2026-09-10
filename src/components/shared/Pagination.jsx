"use client";

export default function Pagination({page, totalPages, onChange, className = "stock-pagination", children}) {
  return <div className={className}>
    <button type="button" className="btn sm" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))}><i className="ti ti-chevron-left" aria-hidden="true" />Anterior</button>
    {children || <span>Página {page} de {totalPages}</span>}
    <button type="button" className="btn sm" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}>Próxima<i className="ti ti-chevron-right" aria-hidden="true" /></button>
  </div>;
}

export function PageSizeSelector({value, onChange, minimum, total}) {
  const options = [...new Set([minimum, 25, 50, 100, 200].filter(option => option === minimum || (option > minimum && option < total)))];
  return <label className="page-size-selector">
    <span>Exibir</span>
    <select value={value} onChange={event => onChange(event.target.value === "all" ? "all" : Number(event.target.value))}>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
      <option value="all">Todos ({total})</option>
    </select>
    <span>por página</span>
  </label>;
}
