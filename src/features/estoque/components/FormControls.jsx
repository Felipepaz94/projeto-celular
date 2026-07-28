"use client";

import {useEffect, useRef, useState} from "react";

export function Field({label, required, error, children, span2}) {
  return (
    <div className={"field" + (span2 ? " span2" : "")}>
      <label>{label}{required && <span className="req">*</span>}</label>
      {children}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

export function ChipPicker({options, value, onChange, allowCustom, placeholder, responsiveSelect = false}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [useSelect, setUseSelect] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const measureRef = useRef(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  useEffect(() => {
    if (!responsiveSelect || !containerRef.current || !measureRef.current) return;
    const updateMode = () => {
      const available = containerRef.current?.clientWidth || 0;
      const required = measureRef.current?.scrollWidth || 0;
      setUseSelect(required > available + 1);
    };
    updateMode();
    const observer = new ResizeObserver(updateMode);
    observer.observe(containerRef.current);
    document.fonts?.ready?.then(updateMode);
    return () => observer.disconnect();
  }, [responsiveSelect, options, value, allowCustom]);

  const commitCustom = () => {
    const nextValue = custom.trim();
    if (nextValue) onChange(nextValue);
    setCustom("");
    setAdding(false);
  };

  const chipButtons = (
    <>
      {options.map(option => (
        <button type="button" key={option} className={"chip" + (value === option ? " sel" : "")} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
      {value && !options.includes(value) && <button type="button" className="chip sel" onClick={() => onChange(value)}>{value}</button>}
      {allowCustom && (adding ? (
        <input
          ref={inputRef}
          className="chip-input"
          value={custom}
          placeholder={placeholder || "outro..."}
          onChange={event => setCustom(event.target.value)}
          onBlur={commitCustom}
          onKeyDown={event => {
            if (event.key === "Enter") { event.preventDefault(); commitCustom(); }
            if (event.key === "Escape") setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="chip add" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{fontSize: 11, marginRight: 4}} aria-hidden="true"></i>outro
        </button>
      ))}
    </>
  );

  return (
    <div className="responsive-chip-picker" ref={containerRef}>
      {responsiveSelect && <div className="chips chip-measure" ref={measureRef} aria-hidden="true">{chipButtons}</div>}
      {useSelect ? (
        adding ? (
          <input
            ref={inputRef}
            value={custom}
            placeholder={placeholder || "outro..."}
            onChange={event => setCustom(event.target.value)}
            onBlur={commitCustom}
            onKeyDown={event => {
              if (event.key === "Enter") { event.preventDefault(); commitCustom(); }
              if (event.key === "Escape") setAdding(false);
            }}
          />
        ) : (
          <select value={value || ""} onChange={event => event.target.value === "__custom__" ? setAdding(true) : onChange(event.target.value)}>
            <option value="" disabled>Selecione...</option>
            {options.map(option => <option value={option} key={option}>{option}</option>)}
            {value && !options.includes(value) && <option value={value}>{value}</option>}
            {allowCustom && <option value="__custom__">Outro...</option>}
          </select>
        )
      ) : (
        <div className="chips">{chipButtons}</div>
      )}
    </div>
  );
}

export function Toggle2({value, onChange}) {
  return (
    <div className="toggle2">
      <button type="button" className={value === true ? "on" : ""} onClick={() => onChange(true)}>Sim</button>
      <button type="button" className={value === false ? "off-sel" : ""} onClick={() => onChange(false)}>Não</button>
    </div>
  );
}
