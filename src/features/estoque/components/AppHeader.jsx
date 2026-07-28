"use client";

export default function AppHeader({brandName, logoData, usingSupabase, connectionLabel, connectionTitle, userName, userEmail, roleLabel, onSignOut}) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className={"brand-mark" + (logoData ? " has-logo" : "")}>{logoData ? <img src={logoData} alt="Logo da empresa" /> : "E"}</div>
        <div className="brand-text"><h1>{brandName?.trim() || "Cadastro Estoque"}</h1><p>sua loja online de acessórios e periféricos</p></div>
      </div>
      <div className="top-actions">
        <div className="conn-pill" title={connectionTitle}><span className={"dot " + (usingSupabase ? "on" : "off")}></span>{connectionLabel}</div>
        <div className="conn-pill user-pill" title={userEmail}><i className="ti ti-user" aria-hidden="true"></i>{userName}<span>{roleLabel}</span></div>
        {usingSupabase && <button type="button" className="btn sm" title="Encerrar sessão" onClick={onSignOut}><i className="ti ti-logout" aria-hidden="true"></i>Sair</button>}
      </div>
    </div>
  );
}
