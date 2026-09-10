"use client";

import {forwardRef, useRef} from "react";
import {X} from "lucide-react";

const SearchInput = forwardRef(function SearchInput({value, onChange, onClear, clearable = false, className = "", clearClassName = "", ...props}, forwardedRef) {
  const localRef = useRef(null);
  return <div className={["search", className, clearable && value ? "has-clear" : ""].filter(Boolean).join(" ")}>
    <i className="ti ti-search" aria-hidden="true" />
    <input {...props} type="text" value={value} onChange={onChange} ref={element => {
      localRef.current = element;
      if (typeof forwardedRef === "function") forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    }} />
    {clearable && value && <button type="button" className={["search-clear", clearClassName].filter(Boolean).join(" ")} onClick={() => { onClear?.(); localRef.current?.focus(); }} aria-label="Limpar busca" title="Limpar busca"><X size={18} aria-hidden="true" /></button>}
  </div>;
});

export default SearchInput;
