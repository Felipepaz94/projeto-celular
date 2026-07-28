"use client";

import React, {useState, useEffect, useMemo, useRef} from "react";
import {createClient} from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {toast} from "sonner";
import {BadgeDollarSign, Building2, CalendarDays, Check, Copy, CreditCard, Eye, EyeOff, FileDown, Hash, Pencil, Percent, Plus, Printer, RefreshCw, RotateCcw, ShieldCheck, ShoppingBag, Trash2, UserRound, X} from "lucide-react";
import {ChipPicker, Field, Toggle2} from "./components/FormControls";
import SupplierCombo from "./components/SupplierCombo";
import PessoasPage from "@/features/pessoas/PessoasPage";
import PessoaModal from "@/features/pessoas/PessoaModal";
import AppHeader from "./components/AppHeader";
import CadastroPage from "@/features/cadastro/CadastroPage";
import EstoquePage from "@/features/estoque/EstoquePage";
import PdvPage from "@/features/pdv/PdvPage";
import VendasPage from "@/features/vendas/VendasPage";
import UsuariosPage from "@/features/usuarios/UsuariosPage";
import ConfiguracoesPage from "@/features/configuracoes/ConfiguracoesPage";
import FabricantesPage from "@/features/fabricantes/FabricantesPage";
import ResponsiveNavigation from "@/features/navigation/ResponsiveNavigation";
/* =========================================================================
   CAMADA DE DADOS
   -------------------------------------------------------------------------
   Hoje: localStorage (funciona offline, sem configuração).
   Para ligar ao Supabase depois, basta:
     1. Criar as tabelas (ver supabase_schema.sql)
     2. Preencher SUPABASE_URL e SUPABASE_ANON_KEY abaixo
     3. Trocar a implementação de db.* por chamadas supabase-js
   Toda a lógica do app já chama somente os métodos de "db", então a troca
   é isolada e não exige mexer nos componentes.
   ========================================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const PRODUCT_PHOTO_UPLOAD_URL = "/api/uploads/product-photos";
const BOOTSTRAP_STATUS_URL = "/api/auth/bootstrap-status";
const supabaseClient = SUPABASE_READY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
}) : null;

const LOCAL_SESSION = {user: {id: "local-offline", email: "modo.local@offline"}};
const LOCAL_PROFILE = {id: "local-offline", full_name: "Modo local", role: "admin"};
const STORAGE_MODE_LOCAL = "local";
const STORAGE_MODE_SUPABASE = "supabase";
const SESSION_STARTED_AT_KEY = "proj_celular_session_started_at";
const SESSION_USER_KEY = "proj_celular_session_user";
const COMPANY_BRAND_CACHE_KEY = "proj_celular_company_brand";
const configuredSessionMinutes = Number(process.env.NEXT_PUBLIC_SESSION_EXPIRATION_MINUTES || 480);
const SESSION_EXPIRATION_MS = (Number.isFinite(configuredSessionMinutes) && configuredSessionMinutes > 0 ? configuredSessionMinutes : 480) * 60 * 1000;
const STORAGE_KEY = "estoque_produtos_v1";
const SUPPLIERS_KEY = "estoque_fornecedores_v1";
const ACESSORIO_CATEGORIAS_KEY = "estoque_categorias_acessorio_v1";
const FABRICANTES_KEY = "estoque_fabricantes_v1";
const ACESSORIO_CATEGORIAS_PADRAO = ["Cabo", "Carregador", "Capa/Película", "Fone", "Perfume", "Outro"];
const SALES_KEY = "estoque_vendas_v1";
const CLIENTES_KEY = "estoque_clientes_v1";
const PROTECAO_KEY = "estoque_protecao_start_v1";
const TAXAS_CARTAO_KEY = "estoque_taxas_cartao_v1";
const BANDEIRAS_KEY = "estoque_bandeiras_v1";
const OFFLINE_DIRTY_KEY = "estoque_offline_dirty_v1";
const LAST_SYNC_KEY = "estoque_last_sync_v1";

function clearLegacyBusinessStorage() {
  if (typeof localStorage === "undefined") return;
  [STORAGE_KEY, SUPPLIERS_KEY, ACESSORIO_CATEGORIAS_KEY, FABRICANTES_KEY, SALES_KEY,
    CLIENTES_KEY, PROTECAO_KEY, TAXAS_CARTAO_KEY, BANDEIRAS_KEY, OFFLINE_DIRTY_KEY,
    LAST_SYNC_KEY].forEach(key => localStorage.removeItem(key));
}

function clearSessionExpiration() {
  localStorage.removeItem(SESSION_STARTED_AT_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

function startSessionExpiration(userId, force = false) {
  if (!userId) return;
  const storedUser = localStorage.getItem(SESSION_USER_KEY);
  const storedStart = Number(localStorage.getItem(SESSION_STARTED_AT_KEY));
  if (force || storedUser !== userId || !Number.isFinite(storedStart) || storedStart <= 0) {
    localStorage.setItem(SESSION_USER_KEY, userId);
    localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
  }
}

function isSessionExpired(userId) {
  if (!userId || localStorage.getItem(SESSION_USER_KEY) !== userId) return false;
  const startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY));
  return Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt >= SESSION_EXPIRATION_MS;
}

const PROTECAO_PADRAO = []; // lista de {id, modelo, valor} cadastrada manualmente
const BANDEIRAS_PADRAO = ["Visa", "Master", "Elo", "Amex", "Crednosso"];
const PARCELAS_MAX = 12;
function taxasCartaoPadrao(bandeiras) {
  const t = {};
  bandeiras.forEach(b => {
    t[b] = {};
    for (let i = 1; i <= PARCELAS_MAX; i++) t[b][i] = "";
  });
  return t;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const localDb = {
  async listProducts() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async saveProduct(product) {
    const all = await localDb.listProducts();
    all.unshift(product);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return product;
  },
  async updateProduct(id, patch) {
    const all = await localDb.listProducts();
    const idx = all.findIndex(p => p.id === id);
    if (idx >= 0) {
      all[idx] = {...all[idx], ...patch};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
    return all[idx];
  },
  async deleteProduct(id) {
    const all = await localDb.listProducts();
    const next = all.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
  async listSuppliers() {
    const clientes = await localDb.listClientes();
    const raw = localStorage.getItem(SUPPLIERS_KEY);
    const antigos = raw ? JSON.parse(raw) : [];
    const unificados = clientes.filter(c => c.fornecedor).map(c => ({id: c.id, name: c.nome}));
    return [...unificados, ...antigos.filter(s => !unificados.some(u => u.name.toLowerCase() === s.name.toLowerCase()))]
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async addSupplier(input) {
    const data = typeof input === "string" ? {nome: input} : input;
    const name = String(data.nome || data.name || "").trim();
    if (!name) return localDb.listSuppliers();
    const pessoas = await localDb.listClientes();
    const existente = pessoas.find(p => p.nome.toLowerCase() === name.toLowerCase());
    if (existente) {
      await localDb.updateCliente(existente.id, {...data, nome: name, fornecedor: true});
    } else {
      await localDb.addCliente({...data, nome: name, cliente: Boolean(data.cliente), fornecedor: true});
    }
    return localDb.listSuppliers();
  },
  async listAcessorioCategorias() {
    const raw = localStorage.getItem(ACESSORIO_CATEGORIAS_KEY);
    return raw ? JSON.parse(raw) : ACESSORIO_CATEGORIAS_PADRAO;
  },
  async addAcessorioCategoria(name) {
    const all = await localDb.listAcessorioCategorias();
    if (all.some(c => c.toLowerCase() === name.toLowerCase())) return all;
    const next = [...all, name];
    localStorage.setItem(ACESSORIO_CATEGORIAS_KEY, JSON.stringify(next));
    return next;
  },
  async listFabricantes() {
    const raw = localStorage.getItem(FABRICANTES_KEY);
    const saved = raw ? JSON.parse(raw) : [];
    const products = await localDb.listProducts();
    return mergeFabricantes(saved, products);
  },
  async addFabricante(name) {
    const all = await localDb.listFabricantes();
    if (all.some(item => item.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"))) return all;
    const next = [...all, name.trim()].sort((a, b) => a.localeCompare(b));
    localStorage.setItem(FABRICANTES_KEY, JSON.stringify(next));
    return next;
  },
  async deleteFabricante(name) {
    const all = await localDb.listFabricantes();
    const next = all.filter(item => item.toLocaleLowerCase("pt-BR") !== name.toLocaleLowerCase("pt-BR"));
    localStorage.setItem(FABRICANTES_KEY, JSON.stringify(next));
    return mergeFabricantes(next, await localDb.listProducts());
  },
  async listSales() {
    const raw = localStorage.getItem(SALES_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  // Finaliza uma venda: grava o registro de venda e dá baixa no estoque.
  // cartItems: itens vindos do estoque (dão baixa) — [{ productId, kind, quantidade, vendaUnit, nome, sub }]
  // extras: itens sem baixa de estoque, como Proteção Start ou venda avulsa — [{ kind, quantidade, vendaUnit, nome, sub, tipo }]
  async finalizeSale({cartItems, extras = [], cliente, pagamentos, total}) {
    const products = await localDb.listProducts();
    const itensVenda = [];

    for (const item of cartItems) {
      const idx = products.findIndex(p => p.id === item.productId);
      const produtoAtual = idx !== -1 ? products[idx] : null;

      // Snapshot completo do produto no momento da venda — necessário para
      // poder devolver exatamente este item ao estoque em caso de estorno.
      const productSnapshot = produtoAtual ? {...produtoAtual} : null;

      itensVenda.push({
        id: uid(),
        tipo: "produto",
        status: "ativo",
        productId: item.productId,
        kind: item.kind,
        quantidade: item.quantidade,
        vendaUnit: item.vendaUnit,
        nome: item.nome,
        sub: item.sub,
        productSnapshot,
      });

      if (idx === -1) continue;
      if (products[idx].kind === "acessorio") {
        const restante = Number(products[idx].quantidade || 0) - item.quantidade;
        if (restante > 0) {
          products[idx] = {...products[idx], quantidade: restante};
        } else {
          products.splice(idx, 1);
        }
      } else {
        products.splice(idx, 1);
      }
    }

    for (const item of extras) {
      itensVenda.push({
        id: uid(),
        tipo: item.tipo || "protecao",
        status: "ativo",
        productId: null,
        kind: item.kind,
        quantidade: item.quantidade,
        vendaUnit: item.vendaUnit,
        nome: item.nome,
        sub: item.sub,
        productSnapshot: null,
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));

    const sale = {
      id: uid(),
      cliente,
      pagamentos,
      itens: itensVenda,
      total,
      status: "ativo", // ativo | parcialmente_estornada | estornada
      criadoEm: new Date().toISOString(),
    };
    const sales = await localDb.listSales();
    sales.unshift(sale);
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));

    return {sale, products};
  },

  // Estorna um item específico de uma venda: marca o item como estornado,
  // devolve o produto ao estoque (se veio de lá) e recalcula o total/status
  // da venda. Itens avulsos e Proteção Start apenas são marcados como
  // estornados, sem mexer em estoque (não vieram dele).
  async estornarItemVenda(saleId, itemId, motivo) {
    const sales = await localDb.listSales();
    const saleIdx = sales.findIndex(s => s.id === saleId);
    if (saleIdx === -1) throw new Error("Venda não encontrada");
    const sale = sales[saleIdx];

    const itemIdx = sale.itens.findIndex(i => i.id === itemId);
    if (itemIdx === -1) throw new Error("Item não encontrado");
    const item = sale.itens[itemIdx];
    if (item.status !== "ativo") return {sale, products: await localDb.listProducts()};

    let products = await localDb.listProducts();

    if (item.tipo === "produto" && item.productSnapshot) {
      if (item.kind === "acessorio") {
        const idx = products.findIndex(p => p.id === item.productId);
        if (idx !== -1) {
          products[idx] = {...products[idx], quantidade: Number(products[idx].quantidade || 0) + item.quantidade};
        } else {
          products = [{...item.productSnapshot}, ...products];
        }
      } else {
        // produto com ID: recria no estoque exatamente como estava na venda
        const jaExiste = products.some(p => p.id === item.productId);
        if (!jaExiste) {
          products = [{...item.productSnapshot}, ...products];
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    }

    sale.itens[itemIdx] = {
      ...item,
      status: "estornado",
      estornadoEm: new Date().toISOString(),
      motivoEstorno: motivo || null,
    };

    const ativos = sale.itens.filter(i => i.status === "ativo");
    sale.status = ativos.length === 0 ? "estornada" : (ativos.length < sale.itens.length ? "parcialmente_estornada" : "ativo");

    sales[saleIdx] = sale;
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));

    return {sale, products};
  },

  async estornarVenda(saleId, motivo) {
    const sale = (await localDb.listSales()).find(item => item.id === saleId);
    if (!sale) throw new Error("Venda não encontrada");
    let result = {sale, products: await localDb.listProducts()};
    for (const item of sale.itens.filter(item => item.status === "ativo")) {
      result = await localDb.estornarItemVenda(saleId, item.id, motivo);
    }
    return result;
  },

  // Troca um item de uma venda por outro produto do estoque, mantendo o
  // vínculo com a venda original. O item antigo volta ao estoque (como no
  // estorno) e o novo produto escolhido sai do estoque e entra na venda no
  // lugar — preservando o histórico de que houve uma troca.
  async trocarItemVenda(saleId, itemId, novoProductId) {
    const sales = await localDb.listSales();
    const saleIdx = sales.findIndex(s => s.id === saleId);
    if (saleIdx === -1) throw new Error("Venda não encontrada");
    const sale = sales[saleIdx];

    const itemIdx = sale.itens.findIndex(i => i.id === itemId);
    if (itemIdx === -1) throw new Error("Item não encontrado");
    const itemAntigo = sale.itens[itemIdx];

    let products = await localDb.listProducts();

    // devolve o item antigo ao estoque
    if (itemAntigo.tipo === "produto" && itemAntigo.productSnapshot) {
      if (itemAntigo.kind === "acessorio") {
        const idx = products.findIndex(p => p.id === itemAntigo.productId);
        if (idx !== -1) {
          products[idx] = {...products[idx], quantidade: Number(products[idx].quantidade || 0) + itemAntigo.quantidade};
        } else {
          products = [{...itemAntigo.productSnapshot}, ...products];
        }
      } else {
        const jaExiste = products.some(p => p.id === itemAntigo.productId);
        if (!jaExiste) products = [{...itemAntigo.productSnapshot}, ...products];
      }
    }

    // retira o novo produto do estoque
    const novoIdx = products.findIndex(p => p.id === novoProductId);
    if (novoIdx === -1) throw new Error("Produto novo não encontrado no estoque");
    const novoSnapshot = {...products[novoIdx]};
    if (novoSnapshot.kind === "acessorio") {
      const restante = Number(novoSnapshot.quantidade || 0) - 1;
      if (restante > 0) {
        products[novoIdx] = {...products[novoIdx], quantidade: restante};
      } else {
        products.splice(novoIdx, 1);
      }
    } else {
      products.splice(novoIdx, 1);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));

    sale.itens[itemIdx] = {
      ...itemAntigo,
      status: "trocado",
      trocadoEm: new Date().toISOString(),
    };
    sale.itens.push({
      id: uid(),
      tipo: "produto",
      status: "ativo",
      productId: novoSnapshot.id,
      kind: novoSnapshot.kind,
      quantidade: 1,
      vendaUnit: itemAntigo.vendaUnit, // mantém o valor já pago na venda original
      nome: productDisplayName(novoSnapshot),
      sub: productSubtitle(novoSnapshot) || novoSnapshot.identifier,
      productSnapshot: novoSnapshot,
      trocaDoItemId: itemAntigo.id,
    });

    sales[saleIdx] = sale;
    localStorage.setItem(SALES_KEY, JSON.stringify(sales));

    return {sale, products};
  },

  // ---- Clientes ----
  async listClientes() {
    const raw = localStorage.getItem(CLIENTES_KEY);
    return (raw ? JSON.parse(raw) : []).map(c => ({
      ...c,
      cliente: c.cliente !== false,
      fornecedor: Boolean(c.fornecedor),
      email: c.email || "",
      documento: c.documento || "",
      observacoes: c.observacoes || "",
    }));
  },
  async addCliente({nome, contato, email, documento, observacoes, cliente = true, fornecedor = false}) {
    const all = await localDb.listClientes();
    const pessoa = {id: uid(), nome: nome.trim(), contato: (contato || "").trim(), email: (email || "").trim(), documento: (documento || "").trim(), observacoes: (observacoes || "").trim(), cliente: Boolean(cliente), fornecedor: Boolean(fornecedor), criadoEm: new Date().toISOString()};
    all.unshift(pessoa);
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(all));
    return pessoa;
  },
  async updateCliente(id, patch) {
    const all = await localDb.listClientes();
    const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) {
      all[idx] = {...all[idx], ...patch};
      localStorage.setItem(CLIENTES_KEY, JSON.stringify(all));
    }
    return all[idx];
  },
  async deleteCliente(id) {
    const all = await localDb.listClientes();
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(all.filter(c => c.id !== id)));
  },

  // ---- Proteção Start (planos cadastrados manualmente por modelo) ----
  async listProtecaoPlanos() {
    const raw = localStorage.getItem(PROTECAO_KEY);
    return raw ? JSON.parse(raw) : PROTECAO_PADRAO;
  },
  async addProtecaoPlano({modelo, valor}) {
    const all = await localDb.listProtecaoPlanos();
    const plano = {id: uid(), modelo: modelo.trim(), valor: Number(valor) || 0};
    const next = [...all, plano];
    localStorage.setItem(PROTECAO_KEY, JSON.stringify(next));
    return next;
  },
  async updateProtecaoPlano(id, patch) {
    const all = await localDb.listProtecaoPlanos();
    const next = all.map(p => p.id === id ? {...p, ...patch} : p);
    localStorage.setItem(PROTECAO_KEY, JSON.stringify(next));
    return next;
  },
  async deleteProtecaoPlano(id) {
    const all = await localDb.listProtecaoPlanos();
    const next = all.filter(p => p.id !== id);
    localStorage.setItem(PROTECAO_KEY, JSON.stringify(next));
    return next;
  },
  // Substitui TODOS os planos pelos importados da planilha.
  // rows: [{modelo, valor}]
  async replaceProtecaoPlanos(rows) {
    const next = rows.map(r => ({id: uid(), modelo: String(r.modelo).trim(), valor: Number(r.valor) || 0}));
    localStorage.setItem(PROTECAO_KEY, JSON.stringify(next));
    return next;
  },

  // ---- Bandeiras de cartão (cadastráveis) ----
  async listBandeiras() {
    const raw = localStorage.getItem(BANDEIRAS_KEY);
    return raw ? JSON.parse(raw) : BANDEIRAS_PADRAO;
  },
  async addBandeira(name) {
    const all = await localDb.listBandeiras();
    if (all.some(b => b.toLowerCase() === name.toLowerCase())) return all;
    const next = [...all, name];
    localStorage.setItem(BANDEIRAS_KEY, JSON.stringify(next));
    return next;
  },
  async renameBandeira(oldName, newName) {
    const bandeiras = await localDb.listBandeiras();
    const nextBandeiras = bandeiras.map(b => b === oldName ? newName : b);
    localStorage.setItem(BANDEIRAS_KEY, JSON.stringify(nextBandeiras));

    const taxas = await localDb.getTaxasCartao();
    if (taxas[oldName]) {
      taxas[newName] = taxas[oldName];
      delete taxas[oldName];
      localStorage.setItem(TAXAS_CARTAO_KEY, JSON.stringify(taxas));
    }
    return {bandeiras: nextBandeiras, taxas};
  },

  // ---- Taxas de cartão ----
  async getTaxasCartao() {
    const raw = localStorage.getItem(TAXAS_CARTAO_KEY);
    if (raw) return JSON.parse(raw);
    const bandeiras = await localDb.listBandeiras();
    return taxasCartaoPadrao(bandeiras);
  },
  async setTaxasCartao(values) {
    localStorage.setItem(TAXAS_CARTAO_KEY, JSON.stringify(values));
    return values;
  },

  // ---- Aparelho de troca (entra incompleto no estoque) ----
  async addTradeIn({kind, modelo, valor}) {
    const product = {
      id: uid(),
      kind,
      fabricante: null,
      modelo: modelo.trim() || "(a completar)",
      nome: null,
      memoria: null,
      cor: null,
      bateria: null,
      caixa: null,
      identifier: null,
      fornecedor: null,
      quantidade: null,
      custo: Number(valor) || 0,
      venda: 0,
      categoria: "Troca — a completar",
      incompleto: true,
      criadoEm: new Date().toISOString(),
    };
    return localDb.saveProduct(product);
  },
};

function dbThrow(result) {
  if (result.error) throw result.error;
  return result.data;
}

function productPhotoFromDb(row) {
  return row ? {
    id: row.id,
    productId: row.product_id,
    key: row.storage_key,
    url: row.public_url,
    name: row.file_name,
    contentType: row.content_type,
    size: row.size_bytes,
    position: row.position,
    criadoEm: row.created_at,
  } : row;
}

function productPhotoToDb(productId, photo, position) {
  return {
    product_id: productId,
    storage_key: photo.key,
    public_url: photo.url || null,
    file_name: photo.name || null,
    content_type: photo.contentType || null,
    size_bytes: photo.size || null,
    position,
  };
}

function productFromDb(row) {
  if (!row) return row;
  const photos = (row.product_photos || [])
    .map(productPhotoFromDb)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  return {...row, photos, reparos: Array.isArray(row.reparos) ? row.reparos : [], custoBase: row.custo_base == null ? Number(row.custo) || 0 : Number(row.custo_base), statusAprovacao: row.status_aprovacao || "aprovado", vendaOrigemId: row.venda_origem_id || null, criadoEm: row.created_at};
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function productToDb(product) {
  const row = {
    kind: product.kind,
    fabricante: product.fabricante || null,
    modelo: product.modelo || null,
    memoria: product.memoria || null,
    cor: product.cor || null,
    bateria: product.bateria === "" || product.bateria == null ? null : Number(product.bateria),
    caixa: product.caixa == null ? null : Boolean(product.caixa),
    identifier: product.identifier || null,
    fornecedor: product.fornecedor || null,
    nome: product.nome || null,
    quantidade: product.quantidade == null || product.quantidade === "" ? null : Number(product.quantidade),
    custo: Number(product.custo) || 0,
    custo_base: product.custoBase == null ? Number(product.custo) || 0 : Number(product.custoBase),
    reparos: Array.isArray(product.reparos) ? product.reparos : [],
    venda: Number(product.venda) || 0,
    categoria: product.categoria || "Troca — a completar",
    descricao: product.descricao || null,
    incompleto: Boolean(product.incompleto),
    status_aprovacao: product.statusAprovacao || "aprovado",
    venda_origem_id: product.vendaOrigemId || null,
  };
  if (isUuid(product.id)) row.id = product.id;
  return row;
}

function productPatchToDb(patch) {
  const out = {};
  ["kind", "fabricante", "modelo", "memoria", "cor", "identifier", "fornecedor", "nome", "categoria", "descricao"].forEach(k => {
    if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k] || null;
  });
  if (Object.prototype.hasOwnProperty.call(patch, "bateria")) out.bateria = patch.bateria === "" || patch.bateria == null ? null : Number(patch.bateria);
  if (Object.prototype.hasOwnProperty.call(patch, "caixa")) out.caixa = patch.caixa == null ? null : Boolean(patch.caixa);
  if (Object.prototype.hasOwnProperty.call(patch, "quantidade")) out.quantidade = patch.quantidade === "" || patch.quantidade == null ? null : Number(patch.quantidade);
  if (Object.prototype.hasOwnProperty.call(patch, "custo")) out.custo = Number(patch.custo) || 0;
  if (Object.prototype.hasOwnProperty.call(patch, "custoBase")) out.custo_base = Number(patch.custoBase) || 0;
  if (Object.prototype.hasOwnProperty.call(patch, "reparos")) out.reparos = Array.isArray(patch.reparos) ? patch.reparos : [];
  if (Object.prototype.hasOwnProperty.call(patch, "venda")) out.venda = Number(patch.venda) || 0;
  if (Object.prototype.hasOwnProperty.call(patch, "incompleto")) out.incompleto = Boolean(patch.incompleto);
  if (Object.prototype.hasOwnProperty.call(patch, "statusAprovacao")) out.status_aprovacao = patch.statusAprovacao;
  if (Object.prototype.hasOwnProperty.call(patch, "vendaOrigemId")) out.venda_origem_id = patch.vendaOrigemId || null;
  return out;
}

function saleItemFromDb(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    status: row.status,
    criadoPor: row.criado_por || null,
    atualizadoPor: row.atualizado_por || null,
    productId: row.product_id,
    kind: row.kind,
    quantidade: row.quantidade,
    vendaUnit: Number(row.venda_unit) || 0,
    nome: row.nome,
    sub: row.sub,
    productSnapshot: row.product_snapshot ? productFromDb(row.product_snapshot) : null,
    estornadoEm: row.estornado_em,
    motivoEstorno: row.motivo_estorno,
    trocadoEm: row.trocado_em,
    trocaDoItemId: row.troca_do_item_id,
  };
}

function saleItemToDb(saleId, item) {
  const row = {
    sale_id: saleId,
    product_id: item.productId || null,
    nome: item.nome,
    sub: item.sub || null,
    kind: item.kind,
    tipo: item.tipo || "produto",
    quantidade: Number(item.quantidade) || 1,
    venda_unit: Number(item.vendaUnit) || 0,
    status: item.status || "ativo",
    product_snapshot: item.productSnapshot ? productToDb(item.productSnapshot) : null,
    troca_do_item_id: item.trocaDoItemId || null,
  };
  if (isUuid(item.id)) row.id = item.id;
  return row;
}

function paymentFromDb(row) {
  return {
    id: row.id,
    forma: row.forma,
    valorBase: Number(row.valor_base) || 0,
    taxaPct: Number(row.taxa_pct) || 0,
    valorTaxa: Number(row.valor_taxa) || 0,
    valor: Number(row.valor) || 0,
    bandeira: row.bandeira,
    parcelas: row.parcelas,
  };
}

function paymentToDb(saleId, p) {
  return {
    sale_id: saleId,
    forma: p.forma,
    valor_base: Number(p.valorBase) || 0,
    taxa_pct: Number(p.taxaPct) || 0,
    valor_taxa: Number(p.valorTaxa) || 0,
    valor: Number(p.valor) || 0,
    bandeira: p.bandeira || null,
    parcelas: p.parcelas || null,
  };
}

function saleFromDb(row) {
  return {
    id: row.id,
    cliente: {id: row.cliente_id, nome: row.cliente_nome, contato: row.cliente_contato || ""},
    pagamentos: (row.sale_payments || []).map(paymentFromDb),
    itens: (row.sale_items || []).map(saleItemFromDb),
    total: Number(row.total) || 0,
    status: row.status,
    criadoEm: row.created_at,
    criadoPor: row.criado_por || null,
    atualizadoPor: row.atualizado_por || null,
  };
}

function clienteFromDb(row) {
  return {
    ...row,
    cliente: row.cliente !== false,
    fornecedor: Boolean(row.fornecedor),
    email: row.email || "",
    documento: row.documento || "",
    observacoes: row.observacoes || "",
    criadoEm: row.created_at,
  };
}

function isMissingProductPhotosError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "PGRST200" || error?.code === "PGRST205" || message.includes("product_photos") || message.includes("schema cache");
}

async function fetchProductPhotosForIds(productIds) {
  const ids = (productIds || []).filter(isUuid);
  if (!ids.length) return new Map();
  const {data, error} = await supabaseClient
    .from("product_photos")
    .select("*")
    .in("product_id", ids)
    .order("position", {ascending: true});
  if (error) {
    if (isMissingProductPhotosError(error)) return new Map();
    throw error;
  }
  const map = new Map();
  for (const photo of data || []) {
    const list = map.get(photo.product_id) || [];
    list.push(photo);
    map.set(photo.product_id, list);
  }
  return map;
}

async function attachProductPhotos(products) {
  const photoMap = await fetchProductPhotosForIds((products || []).map(p => p.id));
  return (products || []).map(product => productFromDb({...product, product_photos: photoMap.get(product.id) || []}));
}

async function saveProductPhotos(productId, photos) {
  if (!photos?.length || !isUuid(productId)) return;
  const {error} = await supabaseClient
    .from("product_photos")
    .insert(photos.map((photo, index) => productPhotoToDb(productId, photo, index)));
  if (error) {
    if (isMissingProductPhotosError(error)) return;
    throw error;
  }
}

function isMissingFabricantesTable(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "PGRST205" || message.includes("fabricantes") && message.includes("schema cache");
}
function showInactiveRecords() {
  return normalizeRole(activeProfile?.role) === "admin";
}
const supabaseDb = {
  async getCompanySettings() {
    const result = await supabaseClient.from("configuracoes_empresa").select("*").eq("id", 1).maybeSingle();
    if (result.error) {
      const message = String(result.error.message || "").toLowerCase();
      if (message.includes("configuracoes_empresa") || message.includes("schema cache")) return {};
      throw result.error;
    }
    const row = result.data || {};
    return {nomeFantasia: row.nome_fantasia || "", razaoSocial: row.razao_social || "", documento: row.documento || "", telefone: row.telefone || "", email: row.email || "", endereco: row.endereco || "", logoData: row.logo_data || ""};
  },
  async saveCompanySettings(data) {
    const row = {id: 1, nome_fantasia: data.nomeFantasia?.trim() || null, razao_social: data.razaoSocial?.trim() || null, documento: data.documento?.trim() || null, telefone: data.telefone?.trim() || null, email: data.email?.trim() || null, endereco: data.endereco?.trim() || null, logo_data: data.logoData || null, updated_at: new Date().toISOString(), ativo: true, inativado_em: null};
    const result = await supabaseClient.from("configuracoes_empresa").upsert(row, {onConflict: "id"}).select("*").single();
    if (result.error) throw new Error(result.error.message?.includes("configuracoes_empresa") ? "Execute novamente o arquivo supabase.sql antes de salvar os dados da empresa." : result.error.message);
    return supabaseDb.getCompanySettings();
  },
  async listUserProfiles() {
    return dbThrow(await supabaseClient.from("user_profiles").select("id,full_name,email,slug"));
  },
  async assertImeiAvailable(identifier, excludeId = null) {
    const imei = String(identifier || "").replace(/\D/g, "");
    if (!imei) return;
    let query = supabaseClient.from("products").select("id,identifier").eq("kind", "celular").eq("ativo", true).not("identifier", "is", null);
    if (excludeId) query = query.neq("id", excludeId);
    const rows = dbThrow(await query);
    if (rows.some(row => String(row.identifier || "").replace(/\D/g, "") === imei)) {
      throw new Error("Este IMEI já está cadastrado no estoque.");
    }
  },
  async listProducts() {
    let query = supabaseClient.from("products").select("*").order("created_at", {ascending: false});
    if (!showInactiveRecords()) query = query.or("ativo.eq.true,status_aprovacao.eq.aguardando");
    const [productResult, soldItemResult] = await Promise.all([
      query,
      supabaseClient.from("sale_items").select("product_id").eq("status", "ativo").not("product_id", "is", null),
    ]);
    const data = dbThrow(productResult);
    const soldIds = new Set(dbThrow(soldItemResult).map(item => item.product_id));
    return attachProductPhotos(data.map(product => ({...product, vendido: soldIds.has(product.id)})));
  },
  async saveProduct(product) {
    if (product.kind === "celular") {
      await supabaseDb.assertImeiAvailable(product.identifier);
    }
    const row = productToDb(product);
    const {data: authData} = await supabaseClient.auth.getSession();
    if (authData.session?.user?.id) {
      row.criado_por = authData.session.user.id;
      row.atualizado_por = authData.session.user.id;
    }
    const data = dbThrow(await supabaseClient.from("products").insert(row).select("*").single());
    await saveProductPhotos(data.id, product.photos || []);
    const saved = dbThrow(await supabaseClient.from("products").select("*").eq("id", data.id).single());
    return (await attachProductPhotos([saved]))[0];
  },
  async updateProduct(id, patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "identifier")) {
      const imei = String(patch.identifier || "").replace(/\D/g, "");
      if (imei) {
        await supabaseDb.assertImeiAvailable(imei, id);
      }
    }
    const clean = productPatchToDb(patch);
    const {data: authData} = await supabaseClient.auth.getSession();
    if (authData.session?.user?.id) clean.atualizado_por = authData.session.user.id;
    const data = dbThrow(await supabaseClient.from("products").update(clean).eq("id", id).select("*").single());
    return (await attachProductPhotos([data]))[0];
  },
  async deleteProduct(id) {
    dbThrow(await supabaseClient.from("products").update({ativo: false, inativado_em: new Date().toISOString()}).eq("id", id));
  },
  async restoreProduct(id) {
    dbThrow(await supabaseClient.from("products").update({ativo: true, inativado_em: null}).eq("id", id));
  },
  async reviewTradeIn(id, approved) {
    const patch = approved
      ? {status_aprovacao: "aprovado", ativo: true, inativado_em: null}
      : {status_aprovacao: "reprovado", ativo: false, inativado_em: new Date().toISOString()};
    const data = dbThrow(await supabaseClient.from("products").update(patch).eq("id", id).eq("status_aprovacao", "aguardando").select("*").single());
    return productFromDb(data);
  },
  async listSuppliers() {
    let suppliersQuery = supabaseClient.from("suppliers").select("name,ativo").order("name");
    let pessoasQuery = supabaseClient.from("clientes").select("id,nome,ativo").eq("fornecedor", true).order("nome");
    if (!showInactiveRecords()) {
      suppliersQuery = suppliersQuery.eq("ativo", true);
      pessoasQuery = pessoasQuery.eq("ativo", true);
    }
    const [supplierRows, pessoaRows] = await Promise.all([suppliersQuery, pessoasQuery]);
    const suppliers = dbThrow(supplierRows).map(row => ({id: row.name, name: row.name, ativo: row.ativo !== false}));
    for (const pessoa of dbThrow(pessoaRows)) {
      if (!suppliers.some(item => item.name.toLocaleLowerCase("pt-BR") === pessoa.nome.toLocaleLowerCase("pt-BR"))) {
        suppliers.push({id: pessoa.id, name: pessoa.nome, ativo: pessoa.ativo !== false});
      }
    }
    return suppliers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
  async addSupplier(input) {
    const values = typeof input === "string" ? {nome: input} : input;
    const name = String(values.nome || values.name || "").trim();
    if (!name) return supabaseDb.listSuppliers();
    const {data: authData, error: authError} = await supabaseClient.auth.getSession();
    if (authError || !authData.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({...values, nome: name, fornecedor: true}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o fornecedor.");
    const suppliers = await supabaseDb.listSuppliers();
    if (!suppliers.some(supplier => supplier.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      throw new Error("O Supabase não confirmou o cadastro do fornecedor.");
    }
    return suppliers;
  },
  async listAcessorioCategorias() {
    const data = dbThrow(await supabaseClient.from("products").select("categoria").eq("kind", "acessorio"));
    const fromProducts = data.map(r => r.categoria).filter(Boolean);
    return [...new Set([...ACESSORIO_CATEGORIAS_PADRAO, ...fromProducts])];
  },
  async addAcessorioCategoria(name) {
    const all = await supabaseDb.listAcessorioCategorias();
    return all.some(c => c.toLowerCase() === name.toLowerCase()) ? all : [...all, name];
  },
  async listFabricantes() {
    let fabricantesQuery = supabaseClient.from("fabricantes").select("nome,ativo").order("nome");
    if (!showInactiveRecords()) fabricantesQuery = fabricantesQuery.eq("ativo", true);
    const [result, products] = await Promise.all([
      fabricantesQuery,
      supabaseDb.listProducts(),
    ]);
    if (result.error && !isMissingFabricantesTable(result.error)) throw result.error;
    return mergeFabricantes((result.data || []).map(row => row.nome), products);
  },
  async addFabricante(name) {
    const result = await supabaseClient.from("fabricantes").upsert({nome: name.trim(), ativo: true, inativado_em: null}, {onConflict: "nome"});
    if (result.error && !isMissingFabricantesTable(result.error)) throw result.error;
    return result.error ? mergeFabricantes([name], await supabaseDb.listProducts()) : supabaseDb.listFabricantes();
  },
  async deleteFabricante(name) {
    const result = await supabaseClient.from("fabricantes").update({ativo: false, inativado_em: new Date().toISOString()}).eq("nome", name);
    if (result.error && !isMissingFabricantesTable(result.error)) throw result.error;
    return supabaseDb.listFabricantes();
  },
  async listSales() {
    let query = supabaseClient.from("sales").select("*, sale_items(*), sale_payments(*)").order("created_at", {ascending: false});
    if (!showInactiveRecords()) query = query.eq("ativo", true);
    const data = dbThrow(await query);
    return data.map(saleFromDb);
  },
  async finalizeSale({cartItems, extras = [], tradeIns = [], cliente, pagamentos, total}) {
    const products = await supabaseDb.listProducts();
    if (tradeIns.length > 0) {
      const schemaCheck = await supabaseClient.from("products").select("status_aprovacao,venda_origem_id,descricao").limit(1);
      if (schemaCheck.error) {
        const message = String(schemaCheck.error.message || "").toLowerCase();
        if (message.includes("status_aprovacao") || message.includes("venda_origem_id") || message.includes("descricao") || message.includes("schema cache")) {
          throw new Error("O banco ainda não possui os campos do aparelho na troca. Execute novamente o arquivo supabase.sql no SQL Editor do Supabase.");
        }
        throw schemaCheck.error;
      }
    }
    for (const tradeIn of tradeIns) {
      if (tradeIn.kind === "celular" && tradeIn.identifier) await supabaseDb.assertImeiAvailable(tradeIn.identifier);
    }
    const {data: authData} = await supabaseClient.auth.getSession();
    const userId = authData.session?.user?.id || null;
    if (!userId) throw new Error("Sessão do usuário não encontrada. Entre novamente antes de finalizar a venda.");
    const sale = dbThrow(await supabaseClient.from("sales").insert({cliente_id: cliente.id || null, cliente_nome: cliente.nome, cliente_contato: cliente.contato || null, total: Number(total) || 0, status: "ativo", criado_por: userId, atualizado_por: userId}).select("*").single());
    const itensVenda = [];
    for (const item of cartItems) {
      const produtoAtual = products.find(p => p.id === item.productId);
      itensVenda.push({id: uid(), tipo: "produto", status: "ativo", productId: item.productId, kind: item.kind, quantidade: item.quantidade, vendaUnit: item.vendaUnit, nome: item.nome, sub: item.sub, productSnapshot: produtoAtual ? {...produtoAtual} : null});
    }
    for (const item of extras) {
      itensVenda.push({id: uid(), tipo: item.tipo || "protecao", status: "ativo", productId: null, kind: item.kind, quantidade: item.quantidade, vendaUnit: item.vendaUnit, nome: item.nome, sub: item.sub, productSnapshot: null});
    }
    if (itensVenda.length) dbThrow(await supabaseClient.from("sale_items").insert(itensVenda.map(i => saleItemToDb(sale.id, i))));
    if (pagamentos.length) dbThrow(await supabaseClient.from("sale_payments").insert(pagamentos.map(p => paymentToDb(sale.id, p))));
    for (const tradeIn of tradeIns) {
      await supabaseDb.addTradeIn({...tradeIn, vendaOrigemId: sale.id});
    }
    const savedSale = saleFromDb({...sale, sale_items: itensVenda.map(i => saleItemToDb(sale.id, i)), sale_payments: pagamentos.map(p => paymentToDb(sale.id, p))});
    savedSale.cliente.documento = cliente.documento || "";
    return {sale: savedSale, products: await supabaseDb.listProducts()};
  },
  async estornarItemVenda(saleId, itemId, motivo) {
    dbThrow(await supabaseClient.from("sale_items").update({status: "estornado", estornado_em: new Date().toISOString(), motivo_estorno: motivo || null}).eq("id", itemId).eq("sale_id", saleId));
    const [sales, products] = await Promise.all([supabaseDb.listSales(), supabaseDb.listProducts()]);
    return {sale: sales.find(s => s.id === saleId), products};
  },
  async estornarVenda(saleId, motivo) {
    dbThrow(await supabaseClient.from("sale_items").update({status: "estornado", estornado_em: new Date().toISOString(), motivo_estorno: motivo || "Estorno integral da venda"}).eq("sale_id", saleId).eq("status", "ativo"));
    const [sales, products] = await Promise.all([supabaseDb.listSales(), supabaseDb.listProducts()]);
    return {sale: sales.find(s => s.id === saleId), products};
  },
  async trocarItemVenda(saleId, itemId, novoProductId) {
    const sales = await supabaseDb.listSales();
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error("Venda não encontrada");
    const itemAntigo = sale.itens.find(i => i.id === itemId);
    if (!itemAntigo) throw new Error("Item não encontrado");
    const novoSnapshot = (await attachProductPhotos([dbThrow(await supabaseClient.from("products").select("*").eq("id", novoProductId).single())]))[0];
    dbThrow(await supabaseClient.from("sale_items").update({status: "trocado", trocado_em: new Date().toISOString()}).eq("id", itemId).eq("sale_id", saleId));
    const novoItem = {id: uid(), tipo: "produto", status: "ativo", productId: novoSnapshot.id, kind: novoSnapshot.kind, quantidade: 1, vendaUnit: itemAntigo.vendaUnit, nome: productDisplayName(novoSnapshot), sub: productSubtitle(novoSnapshot) || novoSnapshot.identifier, productSnapshot: novoSnapshot, trocaDoItemId: itemAntigo.id};
    dbThrow(await supabaseClient.from("sale_items").insert(saleItemToDb(saleId, novoItem)));
    const [updatedSales, products] = await Promise.all([supabaseDb.listSales(), supabaseDb.listProducts()]);
    return {sale: updatedSales.find(s => s.id === saleId), products};
  },
  async listClientes() {
    let query = supabaseClient.from("clientes").select("*").order("created_at", {ascending: false});
    if (!showInactiveRecords()) query = query.eq("ativo", true);
    const data = dbThrow(await query);
    return data.map(clienteFromDb);
  },
  async addCliente({nome, contato, email, documento, observacoes, cliente = true, fornecedor = false}) {
    const digits = String(documento || "").replace(/\D/g, "");
    if (digits) {
      const rows = dbThrow(await supabaseClient.from("clientes").select("nome,documento").not("documento", "is", null));
      const duplicate = rows.find(row => String(row.documento || "").replace(/\D/g, "") === digits);
      if (duplicate) throw new Error(`CPF/CNPJ já cadastrado para ${duplicate.nome}.`);
    }
    const data = dbThrow(await supabaseClient.from("clientes").insert({nome: nome.trim(), contato: (contato || "").trim() || null, email: (email || "").trim() || null, documento: (documento || "").trim() || null, observacoes: (observacoes || "").trim() || null, cliente: Boolean(cliente), fornecedor: Boolean(fornecedor)}).select("*").single());
    return clienteFromDb(data);
  },
  async updateCliente(id, patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "documento")) {
      const digits = String(patch.documento || "").replace(/\D/g, "");
      if (digits) {
        const rows = dbThrow(await supabaseClient.from("clientes").select("id,nome,documento").neq("id", id).not("documento", "is", null));
        const duplicate = rows.find(row => String(row.documento || "").replace(/\D/g, "") === digits);
        if (duplicate) throw new Error(`CPF/CNPJ já cadastrado para ${duplicate.nome}.`);
      }
    }
    const clean = {};
    if (Object.prototype.hasOwnProperty.call(patch, "nome")) clean.nome = patch.nome;
    if (Object.prototype.hasOwnProperty.call(patch, "contato")) clean.contato = patch.contato || null;

    if (Object.prototype.hasOwnProperty.call(patch, "email")) clean.email = patch.email || null;
    if (Object.prototype.hasOwnProperty.call(patch, "documento")) clean.documento = patch.documento || null;
    if (Object.prototype.hasOwnProperty.call(patch, "observacoes")) clean.observacoes = patch.observacoes || null;
    if (Object.prototype.hasOwnProperty.call(patch, "cliente")) clean.cliente = Boolean(patch.cliente);
    if (Object.prototype.hasOwnProperty.call(patch, "fornecedor")) clean.fornecedor = Boolean(patch.fornecedor);
    const data = dbThrow(await supabaseClient.from("clientes").update(clean).eq("id", id).select("*").single());
    return clienteFromDb(data);
  },
  async listProtecaoPlanos() {
    let query = supabaseClient.from("protecao_planos").select("*").order("modelo");
    if (!showInactiveRecords()) query = query.eq("ativo", true);
    return dbThrow(await query);
  },
  async addProtecaoPlano({modelo, valor}) {
    dbThrow(await supabaseClient.from("protecao_planos").insert({modelo: modelo.trim(), valor: Number(valor) || 0}));
    return supabaseDb.listProtecaoPlanos();
  },
  async updateProtecaoPlano(id, patch) {
    const clean = {};
    if (Object.prototype.hasOwnProperty.call(patch, "modelo")) clean.modelo = patch.modelo;
    if (Object.prototype.hasOwnProperty.call(patch, "valor")) clean.valor = Number(patch.valor) || 0;
    dbThrow(await supabaseClient.from("protecao_planos").update(clean).eq("id", id));
    return supabaseDb.listProtecaoPlanos();
  },
  async deleteProtecaoPlano(id) {
    dbThrow(await supabaseClient.from("protecao_planos").update({ativo: false, inativado_em: new Date().toISOString()}).eq("id", id));
    return supabaseDb.listProtecaoPlanos();
  },
  async replaceProtecaoPlanos(rows) {
    dbThrow(await supabaseClient.from("protecao_planos").update({ativo: false, inativado_em: new Date().toISOString()}).eq("ativo", true));
    const clean = rows.map(r => ({modelo: String(r.modelo).trim(), valor: Number(r.valor) || 0})).filter(r => r.modelo);
    if (clean.length) dbThrow(await supabaseClient.from("protecao_planos").insert(clean));
    return supabaseDb.listProtecaoPlanos();
  },
  async listBandeiras() {
    let query = supabaseClient.from("bandeiras_cartao").select("nome,ativo").order("nome");
    if (!showInactiveRecords()) query = query.eq("ativo", true);
    const data = dbThrow(await query);
    return data.map(r => r.nome);
  },
  async addBandeira(name) {
    dbThrow(await supabaseClient.from("bandeiras_cartao").upsert({nome: name.trim(), ativo: true, inativado_em: null}, {onConflict: "nome"}));
    return supabaseDb.listBandeiras();
  },
  async renameBandeira(oldName, newName) {
    dbThrow(await supabaseClient.from("bandeiras_cartao").update({nome: newName.trim()}).eq("nome", oldName));
    const [bandeiras, taxas] = await Promise.all([supabaseDb.listBandeiras(), supabaseDb.getTaxasCartao()]);
    return {bandeiras, taxas};
  },
  async getTaxasCartao() {
    const bandeiras = await supabaseDb.listBandeiras();
    const taxas = taxasCartaoPadrao(bandeiras);
    let query = supabaseClient.from("taxas_cartao").select("*");
    if (!showInactiveRecords()) query = query.eq("ativo", true);
    const data = dbThrow(await query);
    data.forEach(row => {
      if (!taxas[row.bandeira]) taxas[row.bandeira] = {};
      taxas[row.bandeira][row.parcelas] = Number(row.taxa_pct) || "";
    });
    return taxas;
  },
  async setTaxasCartao(values) {
    dbThrow(await supabaseClient.from("taxas_cartao").update({ativo: false, inativado_em: new Date().toISOString()}).eq("ativo", true));
    const rows = [];
    Object.entries(values).forEach(([bandeira, parcelas]) => {
      Object.entries(parcelas || {}).forEach(([parcela, taxa]) => {
        if (taxa !== "" && taxa != null) rows.push({bandeira, parcelas: Number(parcela), taxa_pct: Number(taxa) || 0});
      });
    });
    if (rows.length) dbThrow(await supabaseClient.from("taxas_cartao").upsert(rows.map(row => ({...row, ativo: true, inativado_em: null})), {onConflict: "bandeira,parcelas"}));
    return supabaseDb.getTaxasCartao();
  },
  async addTradeIn(data) {
    if (data.fornecedor) {
      dbThrow(await supabaseClient.from("suppliers").upsert({name: data.fornecedor, ativo: true, inativado_em: null}, {onConflict: "name"}));
      let clientUpdate = supabaseClient.from("clientes").update({fornecedor: true});
      clientUpdate = data.clienteId ? clientUpdate.eq("id", data.clienteId) : clientUpdate.eq("nome", data.fornecedor);
      dbThrow(await clientUpdate);
    }
    const product = {id: data.id, kind: data.kind, fabricante: data.kind === "outro" ? null : data.fabricante || null, modelo: data.modelo.trim() || "(a completar)", nome: null, memoria: data.kind === "outro" ? null : data.memoria || null, cor: data.kind === "outro" ? null : data.cor || null, bateria: data.kind === "outro" || data.bateria === "" ? null : data.bateria, caixa: data.kind === "outro" ? null : data.caixa, identifier: data.kind === "outro" ? null : data.identifier || null, fornecedor: data.kind === "outro" ? null : data.fornecedor || null, quantidade: null, custo: Number(data.valor) || 0, venda: 0, categoria: data.kind === "outro" ? "Outro item em troca" : "Troca — aguardando aprovação", descricao: data.descricao || null, incompleto: true, statusAprovacao: "aguardando", vendaOrigemId: data.vendaOrigemId || null, photos: data.kind === "outro" ? [] : data.photos || [], criadoEm: new Date().toISOString()};
    return supabaseDb.saveProduct(product);
  },
};

const db = supabaseDb;
let activeProfile = null;

function setActiveProfile(profile) {
  activeProfile = profile || null;
}

function browserIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function canUseSupabaseNow() {
  if (!SUPABASE_READY || !browserIsOnline()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status > 0 && response.status < 500;
  } catch (_err) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
function isUsingSupabaseDb() {
  return true;
}

function markOfflineDirty(methodName) {
  return methodName;
}

function hasOfflineChanges() {
  return typeof localStorage !== "undefined" && localStorage.getItem(OFFLINE_DIRTY_KEY) === "1";
}

function clearOfflineChanges() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(OFFLINE_DIRTY_KEY);
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

function writeLocalCache({products, suppliers, acessorioCategorias, fabricantes, sales, clientes, protecaoPlanos, bandeiras, taxasCartao}) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products || []));
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers || []));
  localStorage.setItem(ACESSORIO_CATEGORIAS_KEY, JSON.stringify(acessorioCategorias || ACESSORIO_CATEGORIAS_PADRAO));
  localStorage.setItem(FABRICANTES_KEY, JSON.stringify(fabricantes || FABRICANTES_PADRAO));
  localStorage.setItem(SALES_KEY, JSON.stringify(sales || []));
  localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes || []));
  localStorage.setItem(PROTECAO_KEY, JSON.stringify(protecaoPlanos || []));
  localStorage.setItem(BANDEIRAS_KEY, JSON.stringify(bandeiras || BANDEIRAS_PADRAO));
  localStorage.setItem(TAXAS_CARTAO_KEY, JSON.stringify(taxasCartao || {}));
}

function uniqueBy(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, item);
  }
  return [...map.values()];
}

function sameClienteKey(cliente) {
  return `${String(cliente?.nome || "").trim().toLowerCase()}|${String(cliente?.contato || "").trim()}`;
}

async function syncLocalStorageToSupabase() {
  if (!SUPABASE_READY || !hasOfflineChanges()) return false;

  const [localProducts, localSuppliers, localSales, localClientes, localPlanos, localBandeiras, localTaxas] = await Promise.all([
    localDb.listProducts(),
    localDb.listSuppliers(),
    localDb.listSales(),
    localDb.listClientes(),
    localDb.listProtecaoPlanos(),
    localDb.listBandeiras(),
    localDb.getTaxasCartao(),
  ]);

  const supplierRows = uniqueBy([
    ...localSuppliers,
    ...localProducts.map(p => p.fornecedor ? {name: p.fornecedor} : null).filter(Boolean),
  ], s => String(s.name || "").trim().toLowerCase()).map(s => ({name: String(s.name || "").trim()})).filter(s => s.name);

  const saleSnapshotProducts = [];
  for (const sale of localSales) {
    for (const item of sale.itens || []) {
      if (item.tipo === "produto" && item.productSnapshot) saleSnapshotProducts.push(item.productSnapshot);
    }
  }
  const productsToSync = uniqueBy([...saleSnapshotProducts, ...localProducts], p => p.id || `${p.kind}|${p.identifier || p.nome || p.modelo}|${p.criadoEm}`);
  const localProductIdMap = new Map();
  const productRowsWithIds = [];
  const productsWithoutIds = [];

  for (const product of productsToSync) {
    const row = productToDb(product);
    if (row.id) {
      productRowsWithIds.push(row);
      localProductIdMap.set(product.id, row.id);
    } else {
      productsWithoutIds.push({product, row});
    }
  }

  if (productRowsWithIds.length) dbThrow(await supabaseClient.from("products").upsert(productRowsWithIds, {onConflict: "id"}));
  for (const item of productsWithoutIds) {
    const saved = dbThrow(await supabaseClient.from("products").insert(item.row).select("id").single());
    if (item.product.id) localProductIdMap.set(item.product.id, saved.id);
  }

  const photoRows = [];
  for (const product of productsToSync) {
    if (!isUuid(product.id)) continue;
    (product.photos || []).forEach((photo, index) => {
      if (photo.key) photoRows.push(productPhotoToDb(product.id, photo, index));
    });
  }
  if (photoRows.length) {
    const {error} = await supabaseClient.from("product_photos").upsert(photoRows, {onConflict: "product_id,position"});
    if (error && !isMissingProductPhotosError(error)) throw error;
  }

  const existingClientes = dbThrow(await supabaseClient.from("clientes").select("*")).map(clienteFromDb);
  const supplierNames = new Set(supplierRows.map(s => s.name.toLowerCase()));
  const pessoasLocais = uniqueBy([
    ...localClientes.map(c => ({...c, fornecedor: Boolean(c.fornecedor) || supplierNames.has(String(c.nome || "").trim().toLowerCase())})),
    ...supplierRows.filter(s => !localClientes.some(c => String(c.nome || "").trim().toLowerCase() === s.name.toLowerCase())).map(s => ({nome: s.name, contato: "", cliente: false, fornecedor: true})),
  ], sameClienteKey).filter(c => c?.nome);
  for (const pessoa of pessoasLocais) {
    const row = {
      nome: String(pessoa.nome).trim(), contato: String(pessoa.contato || "").trim() || null,
      email: String(pessoa.email || "").trim() || null, documento: String(pessoa.documento || "").trim() || null,
      observacoes: String(pessoa.observacoes || "").trim() || null, cliente: pessoa.cliente !== false,
      fornecedor: Boolean(pessoa.fornecedor),
    };
    const existing = existingClientes.find(c => sameClienteKey(c) === sameClienteKey(pessoa));
    if (existing) {
      row.cliente = Boolean(existing.cliente) || row.cliente;
      row.fornecedor = Boolean(existing.fornecedor) || row.fornecedor;
      dbThrow(await supabaseClient.from("clientes").update(row).eq("id", existing.id));
    } else {
      dbThrow(await supabaseClient.from("clientes").insert(row));
    }
  }

  const planoRows = uniqueBy(localPlanos, p => String(p.modelo || "").trim().toLowerCase())
    .map(p => ({modelo: String(p.modelo || "").trim(), valor: Number(p.valor) || 0}))
    .filter(p => p.modelo);
  if (planoRows.length) dbThrow(await supabaseClient.from("protecao_planos").upsert(planoRows, {onConflict: "modelo"}));

  const bandeiraRows = uniqueBy(localBandeiras.map(nome => ({nome})), b => String(b.nome || "").trim().toLowerCase())
    .map(b => ({nome: String(b.nome || "").trim()}))
    .filter(b => b.nome);
  if (bandeiraRows.length) dbThrow(await supabaseClient.from("bandeiras_cartao").upsert(bandeiraRows, {onConflict: "nome"}));

  dbThrow(await supabaseClient.from("taxas_cartao").update({ativo: false, inativado_em: new Date().toISOString()}).eq("ativo", true));
  const taxaRows = [];
  Object.entries(localTaxas || {}).forEach(([bandeira, parcelas]) => {
    Object.entries(parcelas || {}).forEach(([parcela, taxa]) => {
      if (taxa !== "" && taxa != null) taxaRows.push({bandeira, parcelas: Number(parcela), taxa_pct: Number(taxa) || 0});
    });
  });
  if (taxaRows.length) dbThrow(await supabaseClient.from("taxas_cartao").insert(taxaRows));

  const saleItemToDbForSync = (saleId, item) => {
    const row = saleItemToDb(saleId, item);
    const mappedProductId = localProductIdMap.get(item.productId) || (isUuid(item.productId) ? item.productId : null);
    row.product_id = mappedProductId;
    if (row.product_snapshot && mappedProductId) row.product_snapshot.id = mappedProductId;
    return row;
  };

  for (const sale of localSales) {
    const saleRow = {
      cliente_id: isUuid(sale.cliente?.id) ? sale.cliente.id : null,
      cliente_nome: sale.cliente?.nome || "Cliente",
      cliente_contato: sale.cliente?.contato || null,
      total: Number(sale.total) || 0,
      status: sale.status || "ativo",
    };
    if (isUuid(sale.id)) saleRow.id = sale.id;
    const savedSale = dbThrow(await supabaseClient.from("sales").upsert(saleRow, saleRow.id ? {onConflict: "id"} : undefined).select("*").single());
    const items = (sale.itens || []).map(item => saleItemToDbForSync(savedSale.id, item));
    const payments = (sale.pagamentos || []).map(payment => paymentToDb(savedSale.id, payment));
    if (items.length) dbThrow(await supabaseClient.from("sale_items").upsert(items, {onConflict: "id"}));
    if (payments.length) dbThrow(await supabaseClient.from("sale_payments").insert(payments));
  }

  clearOfflineChanges();
  return true;
}
async function getCurrentSession() {
  if (!SUPABASE_READY) return null;
  const {data, error} = await supabaseClient.auth.getSession();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("user_profiles")) {
      throw new Error("Tabela de usuários não encontrada. Rode o arquivo supabase.sql no SQL Editor do Supabase e depois recarregue a página.");
    }
    throw error;
  }
  return data.session;
}

async function getUserProfile(userId) {
  if (!SUPABASE_READY || !userId) return null;
  const {data, error} = await supabaseClient
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("user_profiles")) {
      throw new Error("Tabela de usuários não encontrada. Rode o arquivo supabase.sql no SQL Editor do Supabase e depois recarregue a página.");
    }
    throw error;
  }
  if (!data) {
    throw new Error("Perfil de usuário não encontrado. Rode o supabase.sql atualizado no SQL Editor do Supabase e tente entrar novamente.");
  }
  return data;
}

async function signInUser({email, password}) {
  const {data, error} = await supabaseClient.auth.signInWithPassword({email, password});
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("user_profiles")) {
      throw new Error("Tabela de usuários não encontrada. Rode o arquivo supabase.sql no SQL Editor do Supabase e depois recarregue a página.");
    }
    throw error;
  }
  return data;
}

async function signUpUser({email, password, fullName}) {
  const {data, error} = await supabaseClient.auth.signUp({
    email,
    password,
    options: {data: {full_name: fullName}},
  });
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("user_profiles")) {
      throw new Error("Tabela de usuários não encontrada. Rode o arquivo supabase.sql no SQL Editor do Supabase e depois recarregue a página.");
    }
    throw error;
  }
  return data;
}

async function signOutUser() {
  const {error} = await supabaseClient.auth.signOut();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("user_profiles")) {
      throw new Error("Tabela de usuários não encontrada. Rode o arquivo supabase.sql no SQL Editor do Supabase e depois recarregue a página.");
    }
    throw error;
  }
}

const ROLE_LABELS = {
  admin: "Admin",
  vendedor: "Vendedor",
};

function normalizeRole(role) {
  return role === "admin" ? "admin" : "vendedor";
}

function canManageUsers(profile) {
  return normalizeRole(profile?.role) === "admin";
}

function userRoleOptionsFor(profile) {
  return canManageUsers(profile) ? ["admin", "vendedor"] : [];
}

function canSeeUserProfile(user, currentProfile) {
  return canManageUsers(currentProfile) || user?.id === currentProfile?.id;
}

function generateRandomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function newUserForm() {
  return {fullName: "", email: "", password: generateRandomPassword(), role: "vendedor"};
}

const ROLE_TABS = {
  admin: ["cadastro", "estoque", "clientes", "pdv", "historico", "fabricantes", "usuarios", "config"],
  vendedor: ["clientes", "pdv"],
};

function allowedTabsForRole(role) {
  return ROLE_TABS[normalizeRole(role)] || ROLE_TABS.vendedor;
}

function canUseTab(role, tab) {
  return allowedTabsForRole(role).includes(tab);
}
/* =========================================================================
   CONSTANTES DE DOMÍNIO
   ========================================================================= */

const KINDS = [
  {key: "celular", label: "Celular", icon: "ti-device-mobile", sub: "IMEI · sem qtd"},
  {key: "ipad",    label: "iPad",    icon: "ti-device-tablet", sub: "Serial · sem qtd"},
  {key: "mac",     label: "Mac",     icon: "ti-device-laptop", sub: "Serial · sem qtd"},
  {key: "jbl",     label: "JBL / Áudio", icon: "ti-speaker", sub: "Serial · sem qtd"},
  {key: "acessorio", label: "Acessório", icon: "ti-cable", sub: "Com quantidade"},
  {key: "outro", label: "Outro", icon: "ti-box", sub: "Item recebido na troca"},
];

const FABRICANTES = {
  celular: ["Apple", "Samsung", "Xiaomi", "Motorola", "Google"],
  ipad: ["Apple"],
  mac: ["Apple"],
};

const FABRICANTES_PADRAO = [...new Set(Object.values(FABRICANTES).flat())];

function mergeFabricantes(saved = [], products = []) {
  const names = [...FABRICANTES_PADRAO, ...saved, ...products.map(product => product.fabricante).filter(Boolean)];
  const unique = new Map();
  names.forEach(name => {
    const clean = String(name || "").trim();
    if (clean) unique.set(clean.toLocaleLowerCase("pt-BR"), clean);
  });
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}

function fabricantesMaisUsados(kind, fabricantes, products) {
  const scoped = products.filter(product => product.kind === kind && product.fabricante);
  if (!scoped.length) return FABRICANTES[kind] || [];
  const counts = new Map();
  scoped.forEach(product => {
    const key = product.fabricante.toLocaleLowerCase("pt-BR");
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const candidates = mergeFabricantes([...(FABRICANTES[kind] || []), ...fabricantes], scoped);
  return candidates
    .sort((a, b) => (counts.get(b.toLocaleLowerCase("pt-BR")) || 0) - (counts.get(a.toLocaleLowerCase("pt-BR")) || 0) || a.localeCompare(b))
    .slice(0, 5);
}

const MEMORIAS = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];

const CATEGORIAS = {
  celular: ["Seminovo", "Novo", "Lacrado", "Vitrine"],
  ipad: ["Seminovo", "Novo", "Lacrado"],
  mac: ["Seminovo", "Novo", "Lacrado"],
  jbl: ["Novo", "Seminovo", "Vitrine"],
};

const KIND_META = Object.fromEntries(KINDS.map(k => [k.key, k]));

const FORMAS_PAGAMENTO = [
  {key: "pix", label: "Pix", icon: "ti-qrcode"},
  {key: "cartao_credito", label: "Cartão crédito", icon: "ti-credit-card"},
  {key: "cartao_debito", label: "Cartão débito", icon: "ti-credit-card"},
  {key: "dinheiro", label: "Dinheiro", icon: "ti-cash"},
  {key: "troca", label: "Aparelho na troca", icon: "ti-replace"},
  {key: "outro", label: "Outro", icon: "ti-dots"},
];

/* =========================================================================
   HELPERS
   ========================================================================= */

function formatBRL(v) {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function toDateInputValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function getDefaultStartDate() {
  const date = new Date();
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toDateInputValue(date);
}

function isWithinDateRange(value, startDate, endDate) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  if (startDate && timestamp < new Date(`${startDate}T00:00:00`).getTime()) return false;
  if (endDate && timestamp > new Date(`${endDate}T23:59:59.999`).getTime()) return false;
  return true;
}

function PageSizeSelector({value, onChange, minimum, total}) {
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

function formatCpfCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return value || "Não informado";
}

function formatCpfCnpjInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

function formatPhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return digits.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function productSaveErrorMessage(error) {
  const code = String(error?.code || "");
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(" · ");
  if (code === "23505") return "Já existe um produto com esse IMEI ou número de série.";
  if (code === "42501") return "Seu usuário não tem permissão para cadastrar produtos no Supabase.";
  if (/timeout|tempo limite|demorou/i.test(details)) return "O Supabase demorou para responder. Verifique sua conexão e confira o estoque antes de tentar novamente.";
  return details || "Não foi possível cadastrar o produto. Verifique a conexão com o Supabase.";
}

function emptyFormFor(kind) {
  const base = {
    kind,
    fabricante: "",
    modelo: "",
    memoria: "",
    cor: "",
    bateria: "",
    caixa: null,
    identifier: "",
    fornecedor: "",
    custo: "",
    venda: "",
    categoria: "",
    quantidade: "",
    nome: "",
    photos: [],
  };
  return base;
}


function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function imageFileToProductPhoto(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSize = 1000;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
  const uploadFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {type: "image/jpeg"});
  return {
    id: uid(),
    name: uploadFile.name,
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    file: uploadFile,
  };
}

async function uploadProductPhotos(productId, photos) {
  if (!photos.length) return [];
  const {data: sessionData} = await supabaseClient.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessao nao encontrada para enviar imagens.");

  const formData = new FormData();
  formData.append("productId", productId);
  photos.forEach(photo => formData.append("files", photo.file, photo.name));

  const response = await fetch(PRODUCT_PHOTO_UPLOAD_URL, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`},
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Nao foi possivel enviar imagens.");
  return payload.photos || [];
}
function normalizeBatteryInput(value) {
  const integerPart = String(value ?? "").split(/[.,]/)[0].replace(/\D/g, "").slice(0, 3);
  if (!integerPart) return "";
  const battery = Number(integerPart);
  if (battery < 1) return "";
  return String(Math.min(battery, 100));
}

function isValidBattery(value) {
  const battery = Number(value);
  return Number.isInteger(battery) && battery >= 1 && battery <= 100;
}

function normalizeImeiInput(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 15);
}

function formatImei(value) {
  const digits = normalizeImeiInput(value);
  const groups = [digits.slice(0, 2), digits.slice(2, 8), digits.slice(8, 14), digits.slice(14, 15)].filter(Boolean);
  return groups.join("-");
}

function isValidImei(value) {
  return /^\d{15}$/.test(normalizeImeiInput(value));
}

function normalizeBRLCurrencyInput(value) {
  const digits = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

function formatBRLCurrencyInput(value) {
  if (value === "" || value == null) return "";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return amount.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function companyLogoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) return reject(new Error("Selecione uma imagem válida."));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("A logo deve ter no máximo 5 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Não foi possível processar a imagem."));
      image.onload = () => {
        const maxWidth = 600, maxHeight = 240;
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.width;
        sourceCanvas.height = image.height;
        const sourceContext = sourceCanvas.getContext("2d", {willReadFrequently: true});
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, image.width, image.height).data;
        let left = image.width, top = image.height, right = -1, bottom = -1;
        for (let y = 0; y < image.height; y += 1) {
          for (let x = 0; x < image.width; x += 1) {
            if (pixels[(y * image.width + x) * 4 + 3] > 12) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        }
        const hasVisiblePixels = right >= left && bottom >= top;
        const sourceX = hasVisiblePixels ? left : 0;
        const sourceY = hasVisiblePixels ? top : 0;
        const sourceWidth = hasVisiblePixels ? right - left + 1 : image.width;
        const sourceHeight = hasVisiblePixels ? bottom - top + 1 : image.height;
        const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", 0.88));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function BRLCurrencyInput({value, onChange, placeholder = "0,00", className = ""}) {
  return (
    <div className="money">
      <span>R$</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatBRLCurrencyInput(value)}
        placeholder={placeholder}
        onChange={event => onChange(normalizeBRLCurrencyInput(event.target.value))}
        className={className}
      />
    </div>
  );
}

function validate(form) {
  const errs = {};
  const need = (f) => { if (!String(form[f] ?? "").trim()) errs[f] = "Obrigatório"; };

  if (form.kind === "acessorio") {
    need("nome");
    need("quantidade");
    need("fornecedor");
    need("custo");
    need("venda");
    need("categoria");
    if (form.quantidade !== "" && Number(form.quantidade) < 0) errs.quantidade = "Não pode ser negativo";
  } else {
    if (form.kind === "celular" || form.kind === "ipad" || form.kind === "mac") {
      need("fabricante");
    }
    need("modelo");
    if (form.kind !== "jbl") need("memoria");
    need("cor");
    if (form.kind === "celular") need("bateria");
    if (form.caixa === null || form.caixa === undefined) errs.caixa = "Selecione";
    need("identifier");
    if (form.kind === "celular" && !isValidImei(form.identifier)) errs.identifier = "O IMEI deve conter exatamente 15 dígitos";
    need("fornecedor");
    need("custo");
    need("venda");
    need("categoria");
    if (form.kind === "celular" && !isValidBattery(form.bateria)) errs.bateria = "Informe um valor inteiro de 1% a 100%";
  }
  if (form.custo !== "" && Number(form.custo) < 0) errs.custo = "Inválido";
  if (form.venda !== "" && Number(form.venda) < 0) errs.venda = "Inválido";
  return errs;
}

/* =========================================================================
   COMPONENTES — CAMPOS
   ========================================================================= */

/* =========================================================================
   FORMULÁRIO DE CADASTRO
   ========================================================================= */

function CadastroForm({suppliers, onSaved, onAddSupplier, acessorioCategorias, onAddAcessorioCategoria, fabricantes, products, onAddFabricante, canUploadPhotos}) {
  const [kind, setKind] = useState("celular");
  const [form, setForm] = useState(emptyFormFor("celular"));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [photoUploadsReady, setPhotoUploadsReady] = useState(false);
  const [checkingPhotoUploads, setCheckingPhotoUploads] = useState(true);

  const set = (field, val) => setForm(f => ({...f, [field]: val}));
  const photos = form.photos || [];

  const switchKind = (k) => {
    setKind(k);
    setForm(emptyFormFor(k));
    setErrors({});
  };

  useEffect(() => {
    let active = true;
    const checkUploads = async () => {
      if (!SUPABASE_READY || !canUploadPhotos) {
        setPhotoUploadsReady(false);
        setCheckingPhotoUploads(false);
        return;
      }
      try {
        const response = await fetch(PRODUCT_PHOTO_UPLOAD_URL);
        const payload = await response.json();
        if (active) setPhotoUploadsReady(Boolean(payload.enabled));
      } catch (err) {
        if (active) setPhotoUploadsReady(false);
      } finally {
        if (active) setCheckingPhotoUploads(false);
      }
    };
    checkUploads();
    return () => { active = false; };
  }, [canUploadPhotos]);


  const handlePhotoSelect = async (event) => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
    event.target.value = "";
    if (files.length === 0) return;
    if (!photoUploadsReady) {
      setErrors(prev => ({...prev, photos: "Configure o Cloudflare R2 para enviar imagens."}));
      return;
    }
    const slots = Math.max(0, 3 - photos.length);
    if (slots === 0) {
      setErrors(prev => ({...prev, photos: "Limite de 3 fotos"}));
      return;
    }
    setSaving(true);
    try {
      const selected = files.slice(0, slots);
      const converted = await Promise.all(selected.map(imageFileToProductPhoto));
      setForm(f => ({...f, photos: [...(f.photos || []), ...converted].slice(0, 3)}));
      setErrors(prev => {
        const next = {...prev};
        delete next.photos;
        return next;
      });
      if (files.length > slots) setErrors(prev => ({...prev, photos: "Foram adicionadas apenas 3 fotos"}));
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = (photoId) => {
    setForm(f => ({...f, photos: (f.photos || []).filter(photo => photo.id !== photoId)}));
    setErrors(prev => {
      const next = {...prev};
      delete next.photos;
      return next;
    });
  };
  const identifierLabel = kind === "celular" ? "IMEI" : "Serial";
  const showFabricante = kind === "celular" || kind === "ipad" || kind === "mac";
  const showMemoria = kind !== "jbl" && kind !== "acessorio";
  const showBateria = kind === "celular";

  const isAcessorio = kind === "acessorio";
  const fabricantesEmDestaque = useMemo(() => fabricantesMaisUsados(kind, fabricantes, products), [kind, fabricantes, products]);

  const margem = useMemo(() => {
    const c = Number(form.custo), v = Number(form.venda);
    if (!c || !v) return null;
    const lucro = v - c;
    const pct = (lucro / c) * 100;
    return {lucro, pct};
  }, [form.custo, form.venda]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const productId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : uid();
    setErrors(prev => {
      const next = {...prev};
      delete next.submit;
      return next;
    });
    setSaving(true);
    try {
      if (kind === "celular") await db.assertImeiAvailable(form.identifier);
      let uploadedPhotos = [];
      if (photos.length) {
        uploadedPhotos = await uploadProductPhotos(productId, photos);
      }
      if (form.fornecedor && !suppliers.some(s => s.name.toLowerCase() === form.fornecedor.toLowerCase())) {
        await onAddSupplier(form.fornecedor);
      }
      if (isAcessorio && form.categoria && !acessorioCategorias.some(c => c.toLowerCase() === form.categoria.toLowerCase())) {
        await onAddAcessorioCategoria(form.categoria);
      }
      if (showFabricante && form.fabricante && !fabricantes.some(item => item.toLocaleLowerCase("pt-BR") === form.fabricante.toLocaleLowerCase("pt-BR"))) {
        await onAddFabricante(form.fabricante);
      }
      const product = {
        id: productId,
        kind,
        fabricante: form.fabricante || null,
        modelo: isAcessorio ? null : form.modelo,
        nome: isAcessorio ? form.nome : null,
        memoria: showMemoria ? form.memoria : null,
        cor: isAcessorio ? null : form.cor,
        bateria: showBateria ? Number(form.bateria) : null,
        caixa: isAcessorio ? null : form.caixa,
        identifier: isAcessorio ? null : form.identifier,
        fornecedor: form.fornecedor || null,
        quantidade: isAcessorio ? Number(form.quantidade) : null,
        custo: Number(form.custo),
        venda: Number(form.venda),
        categoria: form.categoria,
        photos: uploadedPhotos,
        criadoEm: new Date().toISOString(),
      };

      const savedProduct = await withTimeout(
        db.saveProduct(product),
        20000,
        "O Supabase atingiu o tempo limite ao cadastrar o produto."
      );
      setToast(true);
      setTimeout(() => setToast(false), 2600);
      setForm(emptyFormFor(kind));
      onSaved(savedProduct);
    } catch (error) {
      console.error("Erro ao cadastrar produto:", error);
      setErrors(prev => ({...prev, submit: productSaveErrorMessage(error)}));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="kind-grid">
        {KINDS.filter(k => k.key !== "outro").map(k => (
          <button type="button" key={k.key} className={"kind-card" + (kind === k.key ? " active" : "")} onClick={() => switchKind(k.key)}>
            <i className={"ti " + k.icon} aria-hidden="true"></i>
            <div>
              <div className="kt">{k.label}</div>
              <div className="ks">{k.sub}</div>
            </div>
          </button>
        ))}
      </div>

      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="panel-head">
          <h2><i className={"ti " + KIND_META[kind].icon} aria-hidden="true"></i>Novo {KIND_META[kind].label.toLowerCase()}</h2>
          <span className="sub">{isAcessorio ? "controla quantidade em estoque" : `identificado por ${identifierLabel} · sem quantidade`}</span>
        </div>

        {isAcessorio ? (
          <div className="grid">
            <Field label="Nome do acessório" required error={errors.nome} span2>
              <input type="text" value={form.nome} placeholder="Ex: Cabo USB-C 1m, Perfume Invictus 100ml..." onChange={e => set("nome", e.target.value)} className={errors.nome ? "invalid" : ""} />
            </Field>
            <Field label="Categoria" required error={errors.categoria} span2>
              <ChipPicker options={acessorioCategorias} value={form.categoria} onChange={v => set("categoria", v)} allowCustom placeholder="nova categoria" />
            </Field>
            <Field label="Fornecedor" required error={errors.fornecedor}>
              <SupplierCombo value={form.fornecedor} onChange={v => set("fornecedor", v)} suppliers={suppliers} onAdd={onAddSupplier} />
            </Field>
            <Field label="Quantidade em estoque" required error={errors.quantidade}>
              <input type="number" min="0" step="1" value={form.quantidade} placeholder="0" onChange={e => set("quantidade", e.target.value)} className={errors.quantidade ? "invalid" : ""} />
            </Field>
            <Field label="Custo (unitário)" required error={errors.custo}>
              <BRLCurrencyInput value={form.custo} onChange={value => set("custo", value)} className={errors.custo ? "invalid" : ""} />
            </Field>
            <Field label="Venda (unitário)" required error={errors.venda}>
              <BRLCurrencyInput value={form.venda} onChange={value => set("venda", value)} className={errors.venda ? "invalid" : ""} />
            </Field>
          </div>
        ) : (
          <React.Fragment>
            {showFabricante && (
              <Field label="Fabricante" required error={errors.fabricante} span2>
                <ChipPicker options={fabricantesEmDestaque} value={form.fabricante} onChange={v => set("fabricante", v)} allowCustom placeholder="outro fabricante" responsiveSelect />
              </Field>
            )}

            <div className="grid" style={{marginTop: showFabricante ? 16 : 0}}>
              <Field label="Modelo" required error={errors.modelo}>
                <input type="text" value={form.modelo} placeholder={kind === "jbl" ? "Ex: Charge 5" : "Ex: iPhone 13 Pro"} onChange={e => set("modelo", e.target.value)} className={errors.modelo ? "invalid" : ""} />
              </Field>
              <Field label="Cor" required error={errors.cor}>
                <input type="text" value={form.cor} placeholder="Ex: Preto" onChange={e => set("cor", e.target.value)} className={errors.cor ? "invalid" : ""} />
              </Field>
            </div>

            {showMemoria && (
              <Field label="Memória" required error={errors.memoria} span2>
                <ChipPicker options={MEMORIAS} value={form.memoria} onChange={v => set("memoria", v)} allowCustom placeholder="outro tamanho" responsiveSelect />
              </Field>
            )}

            <div className="grid" style={{marginTop: 16}}>
              {showBateria && (
                <Field label="Bateria (%)" required error={errors.bateria}>
                  <div className="percent-input">
                    <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.bateria} placeholder="Ex: 92" onChange={e => set("bateria", normalizeBatteryInput(e.target.value))} className={errors.bateria ? "invalid" : ""} />
                    <span aria-hidden="true">%</span>
                  </div>
                </Field>
              )}
              <Field label="Acompanha caixa?" required error={errors.caixa}>
                <Toggle2 value={form.caixa} onChange={v => set("caixa", v)} />
              </Field>
            </div>

            <div className="divider"></div>

            <div className="grid">
              <Field label={identifierLabel} required error={errors.identifier}>
                <input
                  type="text"
                  inputMode={kind === "celular" ? "numeric" : undefined}
                  maxLength={kind === "celular" ? 18 : undefined}
                  value={kind === "celular" ? formatImei(form.identifier) : form.identifier}
                  placeholder={kind === "celular" ? "00-000000-000000-0" : "Número de série"}
                  onChange={e => set("identifier", kind === "celular" ? normalizeImeiInput(e.target.value) : e.target.value)}
                  className={errors.identifier ? "invalid" : ""}
                />
              </Field>
              <Field label="Fornecedor" required error={errors.fornecedor}>
                <SupplierCombo value={form.fornecedor} onChange={v => set("fornecedor", v)} suppliers={suppliers} onAdd={onAddSupplier} />
              </Field>
            </div>

            <div className="grid g3" style={{marginTop: 16}}>
              <Field label="Categoria" required error={errors.categoria}>
                <select value={form.categoria} onChange={e => set("categoria", e.target.value)} className={errors.categoria ? "invalid" : ""}>
                  <option value="">Selecionar</option>
                  {CATEGORIAS[kind].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Custo" required error={errors.custo}>
                <BRLCurrencyInput value={form.custo} onChange={value => set("custo", value)} className={errors.custo ? "invalid" : ""} />
              </Field>
              <Field label="Venda" required error={errors.venda}>
                <BRLCurrencyInput value={form.venda} onChange={value => set("venda", value)} className={errors.venda ? "invalid" : ""} />
              </Field>
            </div>
          </React.Fragment>
        )}


        <div className="photo-uploader">
          <div className="photo-uploader-head">
            <div>
              <label>Fotos do produto</label>
              <span>{photoUploadsReady ? "Opcional - ate 3 imagens" : "Configure o Cloudflare R2 para liberar envio"}</span>
            </div>
            <label className={"btn sm ghost photo-picker" + (photos.length >= 3 || saving || !photoUploadsReady ? " disabled" : "")} title={photoUploadsReady ? "Adicionar fotos" : "Configure o Cloudflare R2 para enviar imagens"}>
              <i className="ti ti-camera-plus" aria-hidden="true"></i>{checkingPhotoUploads ? "Verificando..." : "Adicionar fotos"}
              <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} disabled={photos.length >= 3 || saving || !photoUploadsReady} />
            </label>
          </div>
          {photos.length > 0 && (
            <div className="photo-preview-grid">
              {photos.map((photo, index) => (
                <div className="photo-preview" key={photo.id}>
                  <img src={photo.dataUrl} alt={`Foto ${index + 1} do produto`} />
                  <button type="button" className="icon-btn danger" onClick={() => removePhoto(photo.id)} aria-label="Remover foto">
                    <i className="ti ti-x" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
          {errors.photos && <div className="err">{errors.photos}</div>}
        </div>
        {errors.submit && <div className="auth-alert danger product-save-error">{errors.submit}</div>}

        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? <React.Fragment><i className="ti ti-loader-2" aria-hidden="true"></i>Salvando...</React.Fragment> : <React.Fragment><i className="ti ti-check" aria-hidden="true"></i>Cadastrar produto</React.Fragment>}
          </button>
          <button type="button" className="btn ghost" onClick={() => { setForm(emptyFormFor(kind)); setErrors({}); }}>Limpar campos</button>
          {margem && (
            <div className="margin-preview">
              <span>Lucro: <b>{formatBRL(margem.lucro)}</b></span>
              <span>Margem: <b>{margem.pct.toFixed(1)}%</b></span>
            </div>
          )}
        </div>
      </form>

      {toast && (
        <div className="toast"><i className="ti ti-circle-check" aria-hidden="true"></i>Produto cadastrado com sucesso</div>
      )}
    </div>
  );
}

/* =========================================================================
   LISTAGEM DE ESTOQUE
   ========================================================================= */

function productDisplayName(p) {
  if (p.kind === "acessorio") return p.nome;
  const parts = [p.fabricante, p.modelo].filter(Boolean);
  return parts.join(" ");
}

function productSubtitle(p) {
  if (p.kind === "acessorio") return null;
  const bits = [];
  if (p.memoria) bits.push(p.memoria);
  if (p.cor) bits.push(p.cor);
  if (p.kind === "celular" && p.bateria !== null && p.bateria !== undefined) bits.push(p.bateria + "% bateria");
  return bits.join(" · ");
}

function ConfirmModal({onConfirm, onCancel, label}) {
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <h3><i className="ti ti-alert-triangle" aria-hidden="true"></i>Remover produto</h3>
        <p>Tem certeza que deseja remover <strong>{label}</strong> do estoque? Essa ação não pode ser desfeita.</p>
        <div className="row">
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn" style={{background: "var(--danger-dim)", borderColor: "rgba(242,84,91,0.4)", color: "var(--danger)"}} onClick={onConfirm}>Remover</button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailsModal({product, usersById, clientes = [], bandeiras = [], taxasCartao = {}, onAddCliente, onClose, onEdit, onDelete, onRestore, onApprove, onReject, onDirectSale}) {
  const [imeiCopied, setImeiCopied] = useState(false);
  const [directSaleOpen, setDirectSaleOpen] = useState(false);
  const [directSalePrice, setDirectSalePrice] = useState(String(product.venda || ""));
  const [directSaleClient, setDirectSaleClient] = useState("");
  const [directSalePayment, setDirectSalePayment] = useState("");
  const [directSaleCardBrand, setDirectSaleCardBrand] = useState("");
  const [directSaleInstallments, setDirectSaleInstallments] = useState("");
  const [directSaleSaving, setDirectSaleSaving] = useState(false);
  const [directSaleError, setDirectSaleError] = useState("");
  const directSaleRef = useRef(null);
  useEffect(() => {
    if (!directSaleOpen) return;
    window.requestAnimationFrame(() => directSaleRef.current?.scrollIntoView({behavior: "smooth", block: "nearest"}));
  }, [directSaleOpen]);
  const userLabel = id => {
    if (!id) return "Não registrado (cadastro anterior à auditoria)";
    const user = usersById[id];
    return user ? `${user.full_name || user.email}${user.slug ? ` (@${user.slug})` : " (slug ainda não gerado)"}` : "Usuário não identificado";
  };
  const details = [
    ["Categoria", KIND_META[product.kind]?.label || product.kind],
    ["Fabricante", product.fabricante], ["Modelo", product.modelo], ["Nome", product.nome],
    ["Descrição", product.descricao],
    ["Memória", product.memoria], ["Cor", product.cor],
    [product.kind === "celular" ? "IMEI" : "Número de série", product.identifier],
    ["Bateria", product.bateria == null ? null : `${product.bateria}%`],
    ["Caixa", product.caixa == null ? null : (product.caixa ? "Sim" : "Não")],
    ["Fornecedor", product.fornecedor], ["Quantidade", product.quantidade],
    ["Custo base", product.reparos?.length ? formatBRL(product.custoBase) : null],
    ["Total de reparos", product.reparos?.length ? formatBRL(product.reparos.reduce((total, repair) => total + (Number(repair.valor) || 0), 0)) : null],
    ["Custo final", formatBRL(product.custo)], ["Venda", formatBRL(product.venda)],
    ["Lucro unitário", formatBRL(Number(product.venda || 0) - Number(product.custo || 0))],
    ["Status", product.vendido ? "Vendido" : product.ativo === false ? "Inativo" : "Ativo"],
    ["Aprovação", product.statusAprovacao === "aguardando" ? "Aguardando aprovação" : product.statusAprovacao === "reprovado" ? "Reprovado" : "Aprovado"],
    ["Venda de origem", product.vendaOrigemId],
    ["Cadastro", product.criadoEm ? new Date(product.criadoEm).toLocaleString("pt-BR") : null],
    ["Inativado em", product.inativado_em ? new Date(product.inativado_em).toLocaleString("pt-BR") : null],
    ["Criado pelo usuário", userLabel(product.criado_por)], ["Última alteração por", userLabel(product.atualizado_por)],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const financialLabels = new Set(["Custo base", "Total de reparos", "Custo final", "Venda", "Lucro unitário"]);
  const auditLabels = new Set(["Status", "Aprovação", "Venda de origem", "Cadastro", "Inativado em", "Criado pelo usuário", "Última alteração por"]);
  const generalDetails = details.filter(([label]) => !financialLabels.has(label) && !auditLabels.has(label));
  const financialDetails = details.filter(([label]) => financialLabels.has(label));
  const auditDetails = details.filter(([label]) => auditLabels.has(label));
  const copyImei = async () => {
    const imei = String(product.identifier || "").replace(/\D/g, "");
    if (!imei) return;
    try {
      await navigator.clipboard.writeText(imei);
    } catch (_error) {
      const input = document.createElement("textarea");
      input.value = imei;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setImeiCopied(true);
    window.setTimeout(() => setImeiCopied(false), 1800);
  };
  const saveDirectSale = async () => {
    const price = Number(directSalePrice);
    const minimum = Number(product.custo) || 0;
    if (!Number.isFinite(price) || price <= 0) return setDirectSaleError("Informe um preço de venda válido.");
    if (price < minimum) return setDirectSaleError(`O preço não pode ser menor que o custo (${formatBRL(minimum)}).`);
    if (!directSalePayment) return setDirectSaleError("Selecione a forma de pagamento.");
    if (directSalePayment === "cartao_credito" && (!directSaleCardBrand || !directSaleInstallments)) return setDirectSaleError("Informe a bandeira do cartão e a quantidade de parcelas.");
    setDirectSaleSaving(true);
    setDirectSaleError("");
    try {
      const selectedClient = clientes.find(client => client.nome.toLocaleLowerCase("pt-BR") === directSaleClient.trim().toLocaleLowerCase("pt-BR"));
      await onDirectSale(product, price, selectedClient || (directSaleClient.trim() ? {id: null, nome: directSaleClient.trim(), contato: ""} : null), {
        forma: directSalePayment,
        bandeira: directSalePayment === "cartao_credito" ? directSaleCardBrand : null,
        parcelas: directSalePayment === "cartao_credito" ? Number(directSaleInstallments) : null,
        taxaPct: directSalePayment === "cartao_credito" ? Number(taxasCartao?.[directSaleCardBrand]?.[directSaleInstallments] || 0) : 0,
      });
      onClose();
    } catch (error) {
      setDirectSaleError(error?.message || "Não foi possível efetuar a venda.");
    } finally {
      setDirectSaleSaving(false);
    }
  };
  const renderDetail = ([label, value]) => <div className={"product-detail-card" + (label === "Lucro unitário" ? " profit" : "")} key={label}><span>{label}</span>{label === "IMEI" ? <button className="product-imei-copy" type="button" onClick={copyImei} title="Copiar IMEI" aria-label="Copiar IMEI"><strong>{formatImei(value)}</strong>{imeiCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button> : <strong>{String(value)}</strong>}</div>;

  return (
    <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal product-details-modal" role="dialog" aria-modal="true" aria-labelledby="product-details-title">
        <div className="product-details-head">
          <div className="product-details-heading"><span className="product-details-symbol"><ShoppingBag size={20} aria-hidden="true" /></span><div><h3 id="product-details-title">{productDisplayName(product)}</h3><p>Informações completas do produto</p><div className="product-details-badges"><span className={"badge cat-" + product.kind}>{KIND_META[product.kind]?.label || product.kind}</span><span className="badge">{product.vendido ? "Vendido" : product.ativo === false ? "Inativo" : "Ativo"}</span></div></div></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar detalhes" title="Fechar"><X size={20} strokeWidth={2} aria-hidden="true" /></button>
        </div>
        {product.photos?.length > 0 && <div className="product-details-photos">{product.photos.map(photo => photo.url && <img key={photo.id || photo.key || photo.url} src={photo.url} alt={photo.name || productDisplayName(product)} />)}</div>}
        <div className="product-details-sections">
          {generalDetails.length > 0 && <section><h4><ShoppingBag size={15} aria-hidden="true" />Informações do produto</h4><div className="product-details-grid">{generalDetails.map(renderDetail)}</div></section>}
          {financialDetails.length > 0 && <section className="product-financial-section"><h4><BadgeDollarSign size={15} aria-hidden="true" />Valores</h4><div className="product-details-grid financial-grid">{financialDetails.map(renderDetail)}</div></section>}
          {auditDetails.length > 0 && <section><h4><ShieldCheck size={15} aria-hidden="true" />Situação e auditoria</h4><div className="product-details-grid audit-grid">{auditDetails.map(renderDetail)}</div></section>}
          {product.reparos?.length > 0 && <div className="product-repairs-details"><h4>Reparos realizados</h4>{product.reparos.map((repair, index) => <div key={repair.id || index}><span>{repair.descricao}</span><strong>{formatBRL(repair.valor)}</strong></div>)}</div>}
          {directSaleOpen && <section className="direct-sale-section" ref={directSaleRef}>
            <div className="direct-sale-heading"><div><h4><BadgeDollarSign size={16} aria-hidden="true" />Venda direta</h4><p>Preencha somente o necessário. O cliente é opcional.</p></div><button type="button" className="icon-btn" onClick={() => setDirectSaleOpen(false)} aria-label="Recolher venda direta" title="Recolher"><X size={17} aria-hidden="true" /></button></div>
            <div className="direct-sale-grid">
              <Field label="Preço de venda" required><BRLCurrencyInput value={directSalePrice} onChange={setDirectSalePrice} /></Field>
              <Field label="Cliente (opcional)"><ClienteCombo value={directSaleClient} onChange={setDirectSaleClient} clientes={clientes} onSelectExisting={client => setDirectSaleClient(client.nome)} onAddCliente={onAddCliente} /></Field>
            </div>
            <div className="direct-sale-payment">
              <label>Forma de pagamento <span>*</span></label>
              <div className="direct-sale-payment-options">
                {FORMAS_PAGAMENTO.filter(payment => payment.key !== "troca").map(payment => <button type="button" key={payment.key} className={"pay-chip" + (directSalePayment === payment.key ? " sel" : "")} onClick={() => { setDirectSalePayment(payment.key); if (payment.key !== "cartao_credito") { setDirectSaleCardBrand(""); setDirectSaleInstallments(""); } setDirectSaleError(""); }}><i className={"ti " + payment.icon} aria-hidden="true"></i>{payment.label}</button>)}
              </div>
            </div>
            {directSalePayment === "cartao_credito" && <div className="direct-sale-card-grid">
              <Field label="Bandeira do cartão" required><select value={directSaleCardBrand} onChange={event => { setDirectSaleCardBrand(event.target.value); setDirectSaleError(""); }}><option value="">Selecionar</option>{bandeiras.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></Field>
              <Field label="Parcelas" required><select value={directSaleInstallments} onChange={event => { setDirectSaleInstallments(event.target.value); setDirectSaleError(""); }}><option value="">Selecionar</option>{Array.from({length: PARCELAS_MAX}, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}x</option>)}</select></Field>
            </div>}
            {directSaleError && <div className="auth-alert danger direct-sale-error">{directSaleError}</div>}
            <div className="direct-sale-actions"><button type="button" className="btn ghost" onClick={() => setDirectSaleOpen(false)}>Cancelar</button><button type="button" className="btn primary" disabled={directSaleSaving} onClick={saveDirectSale}>{directSaleSaving ? "Salvando..." : "Efetuar venda"}</button></div>
          </section>}
        </div>
        <div className="row product-details-actions">
          {product.statusAprovacao === "aguardando" ? <>
            <button className="btn trade-reject-button" type="button" onClick={() => onReject(product)}><X size={17} aria-hidden="true" />Recusar</button>
            <button className="btn trade-approve-button" type="button" onClick={() => onApprove(product)}><Check size={17} aria-hidden="true" />Aprovar</button>
          </> : <>
          {!product.vendido && product.ativo !== false && product.statusAprovacao !== "aguardando" && <button className="btn direct-sale-launch" type="button" onClick={() => setDirectSaleOpen(open => !open)}><BadgeDollarSign size={17} aria-hidden="true" />Venda direta</button>}
          <button className="btn ghost" type="button" onClick={() => onEdit(product)}><Pencil size={17} aria-hidden="true" />Editar</button>
          {product.vendido ? null : product.ativo === false ? (
            <button className="btn ghost" type="button" onClick={() => onRestore(product)}><RefreshCw size={17} aria-hidden="true" />Reativar</button>
          ) : (
            <button className="btn danger" type="button" onClick={() => onDelete(product)}><Trash2 size={17} aria-hidden="true" />Excluir</button>
          )}
          </>}
        </div>
      </div>
    </div>
  );
}

function buildClientText(items) {
  const lines = [];
  KINDS.forEach(k => {
    const ofKind = items.filter(p => p.kind === k.key);
    if (ofKind.length === 0) return;
    lines.push(`*${k.label.toUpperCase()}*`);
    ofKind.forEach(p => {
      if (p.kind === "acessorio") {
        lines.push(`• ${p.nome} — ${formatBRL(p.venda)}`);
      } else {
        const bits = [productDisplayName(p)];
        if (p.memoria) bits.push(p.memoria);
        if (p.cor) bits.push(p.cor);
        if (p.kind === "celular" && p.bateria !== null && p.bateria !== undefined) bits.push(p.bateria + "% bateria");
        bits.push(p.caixa ? "com caixa" : "sem caixa");
        lines.push(`• ${bits.join(" · ")} — ${formatBRL(p.venda)}`);
      }
    });
    lines.push("");
  });
  return lines.join("\n").trim();
}

function EditProductModal({product, suppliers, onAddSupplier, onSave, onCancel}) {
  const [form, setForm] = useState({
    fabricante: product.fabricante || "",
    modelo: product.modelo || "",
    memoria: product.memoria || "",
    cor: product.cor || "",
    bateria: product.bateria ?? "",
    caixa: product.caixa,
    identifier: product.identifier || "",
    fornecedor: product.fornecedor || "",
    custo: product.custoBase ?? product.custo ?? "",
    venda: product.venda ?? "",
    categoria: product.categoria === "Troca — a completar" ? "" : (product.categoria || ""),
  });
  const [saving, setSaving] = useState(false);
  const [repairs, setRepairs] = useState(() => Array.isArray(product.reparos) && product.reparos.length
    ? product.reparos.map(repair => ({id: repair.id || uid(), descricao: repair.descricao || "", valor: repair.valor ?? ""}))
    : (product.statusAprovacao === "aguardando" ? [{id: uid(), descricao: "", valor: ""}] : []));
  const [repairsOpen, setRepairsOpen] = useState(false);

  const set = (field, val) => setForm(f => ({...f, [field]: val}));
  const kind = product.kind;
  const showFabricante = kind === "celular" || kind === "ipad" || kind === "mac";
  const showMemoria = kind !== "jbl";
  const showBateria = kind === "celular";

  const showRepairs = product.statusAprovacao === "aguardando" || repairs.length > 0;
  const repairsTotal = useMemo(() => repairs.reduce((total, repair) => total + (Number(repair.valor) || 0), 0), [repairs]);
  const finalCost = (Number(form.custo) || 0) + repairsTotal;
  const addRepair = () => setRepairs(items => [...items, {id: uid(), descricao: "", valor: ""}]);
  const updateRepair = (id, field, value) => setRepairs(items => items.map(item => item.id === id ? {...item, [field]: value} : item));
  const removeRepair = id => setRepairs(items => items.filter(item => item.id !== id));

  const handleSave = async () => {
    const invalidRepair = repairs.find(repair => Boolean(repair.descricao.trim()) !== (Number(repair.valor) > 0));
    if (invalidRepair) {
      toast.error("Preencha a descrição e o valor de cada reparo, ou remova a linha vazia.");
      return;
    }
    const savedRepairs = repairs.filter(repair => repair.descricao.trim() && Number(repair.valor) > 0).map(repair => ({id: repair.id, descricao: repair.descricao.trim(), valor: Number(repair.valor)}));
    if (showBateria && !isValidBattery(form.bateria)) {
      toast.error("Informe a bateria com um valor inteiro de 1% a 100%.");
      return;
    }
    if (kind === "celular" && !isValidImei(form.identifier)) {
      toast.error("O IMEI deve conter exatamente 15 dígitos.");
      return;
    }
    setSaving(true);
    if (form.fornecedor && !suppliers.some(s => s.name.toLowerCase() === form.fornecedor.toLowerCase())) {
      await onAddSupplier(form.fornecedor);
    }
    await onSave(product.id, {
      fabricante: form.fabricante || null,
      modelo: form.modelo,
      memoria: showMemoria ? form.memoria : null,
      cor: form.cor,
      bateria: showBateria && form.bateria !== "" ? Number(form.bateria) : null,
      caixa: form.caixa,
      identifier: form.identifier,
      fornecedor: form.fornecedor || null,
      custo: (Number(form.custo) || 0) + savedRepairs.reduce((total, repair) => total + repair.valor, 0),
      custoBase: Number(form.custo) || 0,
      reparos: savedRepairs,
      venda: Number(form.venda) || 0,
      categoria: form.categoria || KIND_META[kind].label,
      incompleto: false,
      statusAprovacao: product.statusAprovacao === "aguardando" ? "aprovado" : product.statusAprovacao,
    });
    setSaving(false);
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal edit-product-modal" style={{maxWidth: 720}}>
        <h3 style={{color: "var(--ink)"}}><i className="ti ti-edit" aria-hidden="true" style={{color: "var(--accent)"}}></i>{product.incompleto ? "Completar cadastro" : "Editar produto"}</h3>
        <p>{product.incompleto
          ? "Esse aparelho entrou como troca. Preencha os dados que faltam para deixá-lo pronto para venda."
          : "Altere as informações necessárias e salve para atualizar o produto."}</p>

        {showFabricante && (
          <Field label="Fabricante" span2>
            <ChipPicker options={FABRICANTES[kind] || []} value={form.fabricante} onChange={v => set("fabricante", v)} allowCustom placeholder="outro fabricante" responsiveSelect />
          </Field>
        )}
        <div className="grid" style={{marginTop: 14}}>
          <Field label="Modelo">
            <input type="text" value={form.modelo} onChange={e => set("modelo", e.target.value)} />
          </Field>
          <Field label="Cor">
            <input type="text" value={form.cor} placeholder="Ex: Preto" onChange={e => set("cor", e.target.value)} />
          </Field>
        </div>
        {showMemoria && (
          <Field label="Memória" span2>
            <ChipPicker options={MEMORIAS} value={form.memoria} onChange={v => set("memoria", v)} allowCustom placeholder="outro tamanho" responsiveSelect />
          </Field>
        )}
        <div className="grid" style={{marginTop: 14}}>
          {showBateria && (
            <Field label="Bateria (%)" required>
              <div className="percent-input">
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.bateria} onChange={e => set("bateria", normalizeBatteryInput(e.target.value))} />
                <span aria-hidden="true">%</span>
              </div>
            </Field>
          )}
          <Field label="Acompanha caixa?">
            <Toggle2 value={form.caixa} onChange={v => set("caixa", v)} />
          </Field>
        </div>
        <div className="grid" style={{marginTop: 14}}>
          <Field label={kind === "celular" ? "IMEI" : "Serial"} required>
            <input
              type="text"
              inputMode={kind === "celular" ? "numeric" : undefined}
              maxLength={kind === "celular" ? 18 : undefined}
              value={kind === "celular" ? formatImei(form.identifier) : form.identifier}
              placeholder={kind === "celular" ? "00-000000-000000-0" : "Número de série"}
              onChange={e => set("identifier", kind === "celular" ? normalizeImeiInput(e.target.value) : e.target.value)}
            />
          </Field>
          <Field label="Fornecedor">
            <SupplierCombo value={form.fornecedor} onChange={v => set("fornecedor", v)} suppliers={suppliers} onAdd={onAddSupplier} />
          </Field>
        </div>
        <div className="grid g3 edit-product-values" style={{marginTop: 14}}>
          <Field label="Categoria">
            <select value={form.categoria} onChange={e => set("categoria", e.target.value)}>
              <option value="">Selecionar</option>
              {(CATEGORIAS[kind] || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Custo base (valor da troca)">
            <BRLCurrencyInput value={form.custo} onChange={value => set("custo", value)} />
          </Field>
          <Field label={repairsTotal > 0 ? "Venda (considere o custo final)" : "Venda"}>
            <BRLCurrencyInput value={form.venda} onChange={value => set("venda", value)} />
          </Field>
        </div>

        {repairsTotal > 0 && <div className="pricing-cost-overview" role="status" aria-label="Resumo dos custos para precificação">
          <div className="pricing-cost-overview-head"><div><span>Custo total para precificação</span><strong>{formatBRL(finalCost)}</strong></div>{Number(form.venda) > 0 && <div className={Number(form.venda) < finalCost ? "pricing-loss" : "pricing-margin"}><span>{Number(form.venda) < finalCost ? "Prejuízo previsto" : "Margem bruta prevista"}</span><strong>{formatBRL(Number(form.venda) - finalCost)}</strong></div>}</div>
          <div className="pricing-cost-breakdown"><div><span>Custo de entrada</span><strong>{formatBRL(form.custo)}</strong></div>{repairs.filter(repair => Number(repair.valor) > 0).map((repair, index) => <div key={repair.id}><span>{repair.descricao.trim() || `Reparo ${index + 1}`}</span><strong>+ {formatBRL(repair.valor)}</strong></div>)}</div>
          <p>Defina o valor de venda considerando todos os custos acima.</p>
        </div>}

        {showRepairs && <div className={"repair-section" + (repairsOpen ? " open" : "")}>
          <button type="button" className="repair-accordion-trigger" onClick={() => setRepairsOpen(value => !value)} aria-expanded={repairsOpen}>
            <div><strong>Reparos necessários</strong><span>Os valores serão somados ao custo final do aparelho.</span></div>
            <div className="repair-accordion-summary"><span>{repairs.filter(repair => repair.descricao.trim()).length} reparos · {formatBRL(repairsTotal)}</span><b aria-hidden="true">{repairsOpen ? "−" : "+"}</b></div>
          </button>
          {repairsOpen && <div className="repair-accordion-content">
            <div className="repair-actions"><button type="button" className="btn sm" onClick={addRepair}><Plus size={16} aria-hidden="true" />{repairs.length ? "Incluir outro reparo" : "Adicionar reparo"}</button></div>
            <div className="repair-list">
              {repairs.length === 0 ? <div className="repair-empty">Nenhum reparo informado.</div> : repairs.map((repair, index) => <div className="repair-row" key={repair.id}>
                <Field label={`Descrição do reparo ${index + 1}`}><input type="text" value={repair.descricao} onChange={event => updateRepair(repair.id, "descricao", event.target.value)} placeholder="Ex: Troca de tela" /></Field>
                <Field label="Valor"><BRLCurrencyInput value={repair.valor} onChange={value => updateRepair(repair.id, "valor", value)} /></Field>
                <button type="button" className="icon-btn danger repair-remove" onClick={() => removeRepair(repair.id)} aria-label={`Remover reparo ${index + 1}`} title="Remover reparo"><X size={18} aria-hidden="true" /></button>
              </div>)}
            </div>
            <div className="repair-totals"><div><span>Custo base</span><strong>{formatBRL(form.custo)}</strong></div><div><span>Total de reparos</span><strong>+ {formatBRL(repairsTotal)}</strong></div><div className="repair-final-cost"><span>Custo final</span><strong>{formatBRL(finalCost)}</strong></div></div>
          </div>}
        </div>}

        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Estoque({products, usersById, clientes, bandeiras, taxasCartao, onAddCliente, onDelete, onRestore, onUpdate, onReviewTradeIn, onDirectSale, suppliers, onAddSupplier, reload}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState(false);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [toDelete, setToDelete] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [toEdit, setToEdit] = useState(null);
  const [comissaoPct, setComissaoPct] = useState("5");
  const [copied, setCopied] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!isWithinDateRange(p.criadoEm || p.created_at, startDate, endDate)) return false;
      if (kindFilter && p.kind !== kindFilter) return false;
      if (approvalFilter && p.statusAprovacao !== "aguardando") return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const hay = [
        productDisplayName(p), p.cor, p.identifier, p.fornecedor, p.categoria, p.memoria
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, kindFilter, approvalFilter, startDate, endDate]);

  const productGroups = useMemo(() => {
    const groups = new Map();
    filtered.forEach(product => {
      const model = String(product.modelo || "").trim().toLocaleLowerCase("pt-BR");
      const maker = String(product.fabricante || "").trim().toLocaleLowerCase("pt-BR");
      const canGroup = product.kind !== "acessorio" && Boolean(model);
      const key = canGroup ? `${product.kind}|${maker}|${model}` : `single|${product.id}`;
      if (!groups.has(key)) groups.set(key, {key, items: []});
      groups.get(key).items.push(product);
    });
    return [...groups.values()];
  }, [filtered]);
  const effectivePageSize = pageSize === "all" ? Math.max(productGroups.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(productGroups.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleProductGroups = productGroups.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);
  useEffect(() => { setPage(1); }, [query, kindFilter, approvalFilter, startDate, endDate, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const stats = useMemo(() => {
    const productsInPeriod = products.filter(product => isWithinDateRange(product.criadoEm || product.created_at, startDate, endDate));
    const qtyOf = (p) => p.kind === "acessorio" ? Number(p.quantidade || 0) : 1;
    const isAwaiting = (p) => p.statusAprovacao === "aguardando";
    const isRejected = (p) => p.statusAprovacao === "reprovado";
    const isOutOfStock = (p) => p.kind === "acessorio" && Number(p.quantidade || 0) <= 0;
    const isSold = (p) => p.kind !== "acessorio" && p.vendido;
    const isAvailableForSale = (p) => !isSold(p) && p.ativo !== false && !p.incompleto && !isAwaiting(p) && !isRejected(p) && !isOutOfStock(p);
    const totalItens = productsInPeriod.filter(isAvailableForSale).reduce((acc, p) => acc + qtyOf(p), 0);
    const vendidos = productsInPeriod.filter(isSold).length;
    const aguardando = productsInPeriod.filter(p => !isSold(p) && isAwaiting(p)).length;
    const aCompletar = productsInPeriod.filter(p => !isSold(p) && p.ativo !== false && p.incompleto && !isAwaiting(p) && !isRejected(p)).length;
    const semEstoque = productsInPeriod.filter(p => !isSold(p) && p.ativo !== false && !p.incompleto && !isAwaiting(p) && !isRejected(p) && isOutOfStock(p)).length;
    const inativosReprovados = productsInPeriod.filter(p => !isSold(p) && (p.ativo === false || isRejected(p))).reduce((acc, p) => acc + Math.max(qtyOf(p), 1), 0);
    const valorCusto = productsInPeriod.reduce((acc, p) => acc + Number(p.custo || 0) * qtyOf(p), 0);
    const valorVenda = productsInPeriod.reduce((acc, p) => acc + Number(p.venda || 0) * qtyOf(p), 0);
    const pct = Number(comissaoPct) || 0;
    const comissao = valorVenda * (pct / 100);
    const lucroLiquido = valorVenda - valorCusto - comissao;
    const margemLiquidaPct = valorVenda > 0 ? (lucroLiquido / valorVenda) * 100 : 0;
    return {totalItens, vendidos, aguardando, aCompletar, semEstoque, inativosReprovados, valorCusto, valorVenda, comissao, lucroLiquido, margemLiquidaPct};
  }, [products, comissaoPct, startDate, endDate]);

  const handleDelete = async () => {
    if (toDelete) {
      await onDelete(toDelete.id);
      setToDelete(null);
    }
  };

  const handleCopy = async () => {
    const text = buildClientText(filtered);
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div>
      <div className="stat-row stock-stat-row stock-quantity-stats">
        <div className="stat"><div className="sl">Itens em estoque</div><div className="sv">{stats.totalItens}</div></div>
        <div className="stat"><div className="sl">Itens vendidos</div><div className="sv">{stats.vendidos}</div></div>
        <div className="stat"><div className="sl">Aguardando aprovação</div><div className="sv">{stats.aguardando}</div></div>
        <div className="stat"><div className="sl">A completar</div><div className="sv">{stats.aCompletar}</div></div>
        <div className="stat"><div className="sl">Sem estoque</div><div className="sv">{stats.semEstoque}</div></div>
        <div className="stat"><div className="sl">Inativos / reprovados</div><div className="sv">{stats.inativosReprovados}</div></div>
      </div>
      <div className="stat-row stock-stat-row stock-value-stats">
        <div className="stat"><div className="sl">Valor em custo</div><div className="sv">{formatBRL(stats.valorCusto)}</div></div>
        <div className="stat"><div className="sl">Valor em venda</div><div className="sv">{formatBRL(stats.valorVenda)}</div></div>
        <div className="stat">
          <div className="sl" style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6}}>
            <span>Comissão</span>
            <span style={{display: "flex", alignItems: "center", gap: 2}}>
              <input
                type="number" min="0" max="100" step="0.5" value={comissaoPct}
                onChange={e => setComissaoPct(e.target.value)}
                style={{width: 38, background: "var(--bg-elev2)", border: "0.5px solid var(--line-strong)", borderRadius: 5, color: "var(--ink)", fontSize: 11, fontFamily: "var(--font-mono)", padding: "2px 4px", textAlign: "right"}}
              />
              <span style={{fontSize: 11}}>%</span>
            </span>
          </div>
          <div className="sv">{formatBRL(stats.comissao)}</div>
        </div>
        <div className="stat"><div className="sl">Margem líquida</div><div className="sv">{stats.margemLiquidaPct.toFixed(1)}%</div></div>
        <div className="stat"><div className="sl">Lucro líquido</div><div className="sv">{formatBRL(stats.lucroLiquido)}</div></div>
      </div>

      <div className="inventory-filter-toolbar">
      <div className="stock-bar date-filter-bar inventory-filter-row">
        <div className="search">
          <i className="ti ti-search" aria-hidden="true"></i>
          <input type="text" placeholder="Buscar por nome, IMEI, cor, fornecedor..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="date-range-filter" aria-label="Filtrar estoque por período">
          <label>
            <span>Data inicial</span>
            <input type="date" value={startDate} max={endDate || undefined} onChange={event => {
              const value = event.target.value;
              setStartDate(value);
              if (value && endDate && value > endDate) setEndDate(value);
            }} />
          </label>
          <label>
            <span>Data final</span>
            <input type="date" value={endDate} min={startDate || undefined} onChange={event => {
              const value = event.target.value;
              setEndDate(value);
              if (value && startDate && value < startDate) setStartDate(value);
            }} />
          </label>
        </div>
        <select className="filter-select" value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
          <option value="">Todas categorias</option>
          {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <div className="stock-actions-row">
        <button className={"btn sm" + (approvalFilter ? " primary" : "")} type="button" onClick={() => setApprovalFilter(value => !value)} aria-pressed={approvalFilter}>
          <i className="ti ti-clock-check" aria-hidden="true"></i>Aguardando aprovação
        </button>
        <button className="btn sm inventory-refresh-btn" type="button" onClick={reload} aria-label="Atualizar estoque" title="Atualizar estoque">
          <RefreshCw size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <button className="btn sm primary" onClick={handleCopy} disabled={filtered.length === 0}>
          <i className={"ti " + (copied ? "ti-check" : "ti-copy")} aria-hidden="true"></i>
          {copied ? "Copiado" : "Copiar para cliente"}
        </button>
      </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <i className="ti ti-package-off" aria-hidden="true"></i>
          <p>{products.length === 0 ? "Nenhum produto cadastrado ainda." : "Nada encontrado para esse filtro."}</p>
        </div>
      ) : (
        <div className="panel" style={{padding: "18px 8px"}}>
          <div className="table-wrap">
            <table className="stock">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>ID / Qtd</th>
                  <th>Fornecedor</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleProductGroups.map(group => {
                  const grouped = group.items.length > 1;
                  const expanded = Boolean(expandedGroups[group.key]);
                  const first = group.items[0];
                  const soldCount = group.items.filter(item => item.vendido).length;
                  const availableCount = group.items.filter(item => !item.vendido && item.ativo !== false && !item.incompleto && item.statusAprovacao !== "aguardando" && item.statusAprovacao !== "reprovado").length;
                  return <React.Fragment key={group.key}>
                    {grouped && <tr className="stock-group-row" tabIndex={0} onClick={() => setExpandedGroups(value => ({...value, [group.key]: !expanded}))} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedGroups(value => ({...value, [group.key]: !expanded})); } }} aria-expanded={expanded}>
                      <td colSpan={7}><div className="stock-group-summary"><span className="stock-group-chevron"><i className={"ti " + (expanded ? "ti-chevron-up" : "ti-chevron-down")} aria-hidden="true"></i></span><div><strong>{productDisplayName(first)}</strong><small>{group.items.length} aparelhos deste modelo</small></div><span className={"badge cat-" + first.kind}>{KIND_META[first.kind].label}</span>{availableCount > 0 && <span className="badge stock-group-available">{availableCount} disponível{availableCount > 1 ? "is" : ""}</span>}{soldCount > 0 && <span className="badge sold-badge">{soldCount} vendido{soldCount > 1 ? "s" : ""}</span>}<span className="stock-group-hint">{expanded ? "Ocultar aparelhos" : "Ver aparelhos"}</span></div></td>
                    </tr>}
                    {(!grouped || expanded) && group.items.map(p => (
                  <tr key={p.id} className={"stock-clickable-row" + (grouped ? " stock-group-child" : "")} tabIndex={0} onClick={() => setSelectedProduct(p)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedProduct(p); } }} aria-label={`Ver detalhes de ${productDisplayName(p)}`}>
                    <td>
                      <div className="pname">
                        {productDisplayName(p)}
                        {p.statusAprovacao === "aguardando" && <span className="badge" style={{marginLeft: 8, color: "var(--warn)", borderColor: "rgba(242,184,75,0.35)", background: "rgba(242,184,75,0.08)"}}><i className="ti ti-clock-check" aria-hidden="true" style={{fontSize: 11}}></i>aguardando aprovação</span>}
                        {p.incompleto && p.ativo !== false && p.statusAprovacao !== "aguardando" && p.statusAprovacao !== "reprovado" && <span className="badge" style={{marginLeft: 8, color: "var(--warn)", borderColor: "rgba(242,184,75,0.35)", background: "rgba(242,184,75,0.08)"}}><i className="ti ti-alert-triangle" aria-hidden="true" style={{fontSize: 11}}></i>a completar</span>}
                        {p.vendido ? <span className="badge sold-badge" style={{marginLeft: 8}}>vendido</span> : p.ativo === false && p.statusAprovacao !== "aguardando" && <span className="badge" style={{marginLeft: 8}}>inativo</span>}
                      </div>
                      {productSubtitle(p) && <div className="psub">{productSubtitle(p)}</div>}
                    </td>
                    <td>
                      <span className={"badge cat-" + p.kind}>{KIND_META[p.kind].label}</span>
                    </td>
                    <td>
                      {p.kind === "acessorio" ? (
                        <span className={"badge " + (Number(p.quantidade) === 0 ? "qty-zero" : Number(p.quantidade) <= 3 ? "qty-low" : "")}>
                          {p.quantidade} un
                        </span>
                      ) : (
                        <span className="mono">{p.identifier || "—"}</span>
                      )}
                    </td>
                    <td className="mono">{p.fornecedor || "—"}</td>
                    <td className="mono">{formatBRL(p.custo)}</td>
                    <td className="mono">{p.venda ? formatBRL(p.venda) : "—"}</td>
                    <td>
                      <div className="row-actions">
                        {p.incompleto && (
                          <button className="icon-btn" type="button" onClick={event => { event.stopPropagation(); setToEdit(p); }} aria-label="Completar cadastro" title="Completar cadastro">
                            <Pencil size={18} strokeWidth={2} aria-hidden="true" />
                          </button>
                        )}
                        {p.statusAprovacao === "aguardando" ? (
                          <button className="icon-btn danger" type="button" onClick={async event => { event.stopPropagation(); await onReviewTradeIn(p.id, false); }} aria-label="Reprovar produto" title="Reprovar produto">
                            <X size={18} strokeWidth={2} aria-hidden="true" />
                          </button>
                        ) : p.vendido ? null : p.ativo === false ? (
                          <button className="icon-btn" type="button" onClick={event => { event.stopPropagation(); onRestore(p.id); }} aria-label="Reativar produto" title="Reativar produto">
                            <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
                          </button>
                        ) : (
                          <button className="icon-btn danger" type="button" onClick={event => { event.stopPropagation(); setToDelete(p); }} aria-label="Inativar produto" title="Inativar produto">
                            <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    ))}
                  </React.Fragment>;
                })}
              </tbody>
            </table>
            <div className="list-pagination"><button type="button" className="btn sm" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><i className="ti ti-chevron-left" aria-hidden="true"></i>Anterior</button><div className="pagination-center"><PageSizeSelector value={pageSize} onChange={setPageSize} minimum={15} total={productGroups.length} /><span>Página {currentPage} de {totalPages} · {productGroups.length} {productGroups.length === 1 ? "registro" : "registros"}</span></div><button type="button" className="btn sm" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Próxima<i className="ti ti-chevron-right" aria-hidden="true"></i></button></div>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal label={productDisplayName(toDelete)} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
      )}
      {selectedProduct && <ProductDetailsModal
        product={selectedProduct}
        usersById={usersById}
        clientes={clientes}
        bandeiras={bandeiras}
        taxasCartao={taxasCartao}
        onAddCliente={onAddCliente}
        onDirectSale={onDirectSale}
        onClose={() => setSelectedProduct(null)}
        onEdit={product => { setSelectedProduct(null); setToEdit(product); }}
        onDelete={product => { setSelectedProduct(null); setToDelete(product); }}
        onRestore={product => { setSelectedProduct(null); onRestore(product.id); }}
        onApprove={async product => { await onReviewTradeIn(product.id, true); setSelectedProduct(null); }}
        onReject={async product => { await onReviewTradeIn(product.id, false); setSelectedProduct(null); }}
      />}

      {toEdit && (
        <EditProductModal
          product={toEdit}
          suppliers={suppliers}
          onAddSupplier={onAddSupplier}
          onCancel={() => setToEdit(null)}
          onSave={async (id, patch) => {
            await onUpdate(id, patch);
            setToEdit(null);
          }}
        />
      )}
    </div>
  );
}

/* =========================================================================
   PDV — PONTO DE VENDA
   ========================================================================= */

function pdvSearchHay(p) {
  return [productDisplayName(p), p.identifier, p.cor, p.memoria].filter(Boolean).join(" ").toLowerCase();
}

function TradeInModal({onAdd, onCancel, clientes, historyProducts = [], selectedClient, onSelectClient, onClientInputChange, onAddCliente}) {
  const [form, setForm] = useState({kind: "celular", fabricante: "", modelo: "", memoria: "", cor: "", bateria: "", caixa: false, identifier: "", fornecedor: selectedClient?.nome || "", clienteId: selectedClient?.id || null, valor: "", descricao: "", photos: []});
  const [saving, setSaving] = useState(false);
  const [r2Ready, setR2Ready] = useState(false);
  const [matchedHistory, setMatchedHistory] = useState(null);
  const set = (field, value) => setForm(previous => ({...previous, [field]: value}));
  const kind = form.kind;

  const tradeKinds = KINDS.filter(k => k.key !== "acessorio");

  useEffect(() => {
    let active = true;
    fetch(PRODUCT_PHOTO_UPLOAD_URL).then(response => response.json()).then(payload => { if (active) setR2Ready(Boolean(payload.enabled)); }).catch(() => {});
    return () => { active = false; form.photos.forEach(photo => photo.preview && URL.revokeObjectURL(photo.preview)); };
  }, []);

  useEffect(() => {
    const imei = String(form.identifier || "").replace(/\D/g, "");
    if (form.kind !== "celular" || imei.length !== 15) {
      setMatchedHistory(null);
      return;
    }
    const previous = historyProducts
      .filter(product => product.kind === "celular" && String(product.identifier || "").replace(/\D/g, "") === imei)
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))[0];
    setMatchedHistory(previous || null);
    if (!previous) return;
    setForm(current => ({
      ...current,
      fabricante: previous.fabricante || current.fabricante,
      modelo: previous.modelo || current.modelo,
      memoria: previous.memoria || current.memoria,
      cor: previous.cor || current.cor,
      bateria: previous.bateria == null ? current.bateria : String(previous.bateria),
      caixa: previous.caixa == null ? current.caixa : Boolean(previous.caixa),
      descricao: previous.descricao || current.descricao,
    }));
  }, [form.identifier, form.kind, historyProducts]);

  const selectPhotos = event => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith("image/"));
    event.target.value = "";
    setForm(previous => ({...previous, photos: [...previous.photos, ...files.map(file => ({id: uid(), file, name: file.name, preview: URL.createObjectURL(file)}))].slice(0, 3)}));
  };

  const removePhoto = id => setForm(previous => {
    const removed = previous.photos.find(photo => photo.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    return {...previous, photos: previous.photos.filter(photo => photo.id !== id)};
  });

  const handleAdd = async () => {
    if (!form.modelo.trim() || !form.valor || Number(form.valor) <= 0) return toast.error(kind === "outro" ? "Informe o nome e o preço do item." : "Informe o modelo e o valor da troca.");
    if (kind !== "outro" && !form.fabricante.trim()) return toast.error("Selecione ou informe o fabricante.");
    if (kind !== "outro" && !form.clienteId) return toast.error("Pesquise e selecione o cliente da venda.");
    if (kind === "celular" && !isValidImei(form.identifier)) return toast.error("O IMEI deve conter exatamente 15 dígitos.");
    if (kind === "celular" && form.bateria !== "" && !isValidBattery(form.bateria)) return toast.error("A bateria deve estar entre 1% e 100%.");
    setSaving(true);
    try {
      if (kind === "celular") await db.assertImeiAvailable(form.identifier);
      const id = crypto.randomUUID();
      const photos = kind !== "outro" && form.photos.length ? await uploadProductPhotos(id, form.photos) : [];
      await onAdd({...form, id, modelo: form.modelo.trim(), descricao: form.descricao.trim(), identifier: kind === "celular" ? normalizeImeiInput(form.identifier) : kind === "outro" ? "" : form.identifier.trim(), bateria: form.bateria === "" || kind === "outro" ? null : Number(form.bateria), valor: Number(form.valor), photos});
    } catch (error) {
      toast.error(productSaveErrorMessage(error));
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal trade-in-modal">
        <h3 style={{color: "var(--ink)"}}><i className="ti ti-replace" aria-hidden="true" style={{color: "var(--accent)"}}></i>Aparelho na troca</h3>
        <p>Informe os dados disponíveis. O aparelho entra no estoque como item de troca e pode ser complementado depois.</p>

        {kind === "celular" && <div className="trade-imei-first"><Field label="IMEI" required><input autoFocus inputMode="numeric" maxLength={18} value={formatImei(form.identifier)} placeholder="00-000000-000000-0" onChange={e => set("identifier", normalizeImeiInput(e.target.value))} /></Field>{matchedHistory && <div className="trade-history-match"><Check size={15} aria-hidden="true" /><span>Histórico encontrado. Os dados da última passagem foram preenchidos para revisão.</span></div>}</div>}
        <Field label="Tipo de aparelho" span2>
          <div className="chips">
            {tradeKinds.map(k => (
              <button type="button" key={k.key} className={"chip" + (kind === k.key ? " sel" : "")} onClick={() => set("kind", k.key)}>{k.label}</button>
            ))}
          </div>
        </Field>
        {kind === "outro" ? (
          <div className="grid" style={{marginTop: 14}}>
            <Field label="Nome" required><input value={form.modelo} placeholder="Ex.: Bicicleta, televisão" onChange={e => set("modelo", e.target.value)} /></Field>
            <Field label="Preço" required><BRLCurrencyInput value={form.valor} onChange={value => set("valor", value)} /></Field>
            <Field label="Descrição" span2><textarea rows="3" value={form.descricao} placeholder="Descreva o item recebido na troca" onChange={e => set("descricao", e.target.value)} /></Field>
          </div>
        ) : <React.Fragment>
        <div style={{marginTop: 14}}>
          <Field label="Fabricante" required>
            <ChipPicker options={FABRICANTES[kind] || []} value={form.fabricante} onChange={value => set("fabricante", value)} allowCustom placeholder="outro" responsiveSelect />
          </Field>
        </div>
        <div className="grid g3" style={{marginTop: 14}}>
          <Field label="Modelo" required><input value={form.modelo} placeholder="Ex.: iPhone 12" onChange={e => set("modelo", e.target.value)} /></Field>
          <Field label="Memória"><ChipPicker options={MEMORIAS} value={form.memoria} onChange={value => set("memoria", value)} allowCustom placeholder="outro" responsiveSelect /></Field>
          <Field label="Cor"><input value={form.cor} placeholder="Ex.: Preto" onChange={e => set("cor", e.target.value)} /></Field>
          {kind !== "celular" && <Field label="Número de série"><input value={form.identifier} placeholder="Número de série" onChange={e => set("identifier", e.target.value)} /></Field>}
          {kind === "celular" && <Field label="Bateria (%)"><div className="percent-input"><input inputMode="numeric" maxLength={3} value={form.bateria} onChange={e => set("bateria", normalizeBatteryInput(e.target.value))} /><span>%</span></div></Field>}
          <Field label="Caixa"><Toggle2 value={form.caixa} onChange={value => set("caixa", value)} /></Field>
          <Field label="Fornecedor (cliente da venda)">
            <ClienteCombo
              value={form.fornecedor}
              clientes={clientes}
              onAddCliente={onAddCliente}
              onChange={value => { set("fornecedor", value); set("clienteId", null); onClientInputChange(value); }}
              onSelectExisting={client => {
                set("fornecedor", client.nome);
                set("clienteId", client.id);
                onSelectClient(client);
              }}
            />
          </Field>
          <Field label="Valor do aparelho" required>
            <BRLCurrencyInput value={form.valor} onChange={value => set("valor", value)} />
          </Field>
        </div>

        <div className="photo-uploader trade-photo-uploader">
          <div className="photo-uploader-head"><div><label>Fotos do aparelho</label><span>{r2Ready ? "Opcional — até 3 imagens" : "Configure o Cloudflare R2 para liberar o envio"}</span></div><label className={"btn sm ghost photo-picker" + (!r2Ready || form.photos.length >= 3 ? " disabled" : "")}><Plus size={16} />Adicionar fotos<input type="file" accept="image/*" multiple disabled={!r2Ready || form.photos.length >= 3} onChange={selectPhotos} /></label></div>
          {form.photos.length > 0 && <div className="photo-preview-grid">{form.photos.map(photo => <div className="photo-preview" key={photo.id}><img src={photo.preview} alt={photo.name} /><button type="button" className="icon-btn danger" onClick={() => removePhoto(photo.id)}><X size={16} /></button></div>)}</div>}
        </div>
        </React.Fragment>}

        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={handleAdd} disabled={saving || !form.valor}>
            {saving ? "Adicionando..." : "Adicionar à venda"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemAvulsoModal({onAdd, onCancel}) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");

  const handleAdd = () => {
    if (!nome.trim() || !valor || Number(valor) <= 0) return;
    onAdd({nome: nome.trim(), valor: Number(valor)});
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <h3 style={{color: "var(--ink)"}}><i className="ti ti-tag" aria-hidden="true" style={{color: "var(--accent)"}}></i>Item avulso</h3>
        <p>Para vendas que não passam pelo estoque (serviço, item sem cadastro, etc). Não dá baixa em nenhum produto.</p>

        <Field label="Descrição" required>
          <input type="text" value={nome} placeholder="Ex: Troca de tela, serviço de manutenção" onChange={e => setNome(e.target.value)} autoFocus />
        </Field>
        <div style={{marginTop: 14}}>
          <Field label="Valor" required>
            <BRLCurrencyInput value={valor} onChange={setValor} />
          </Field>
        </div>

        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={handleAdd} disabled={!nome.trim() || !valor}>
            Adicionar à venda
          </button>
        </div>
      </div>
    </div>
  );
}

function ClienteCombo({value, onChange, clientes, onSelectExisting, onAddCliente, allowCreate = true}) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = clientes
    .filter(c => c.cliente === true && c.ativo !== false)
    .filter(c => {
      if (!q) return true;
      return [c.nome, c.contato, c.email, c.documento]
        .some(field => String(field || "").toLowerCase().includes(q));
    })
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
    .slice(0, 8);

  const createClient = async data => {
    const client = await onAddCliente({...data, cliente: true});
    onSelectExisting(client);
    setOpen(false);
    setShowCreate(false);
  };

  return (
    <div className="supplier-combo-row">
      <div className="combo" ref={wrapRef}>
        <input
          type="text"
          value={value}
          placeholder="Buscar cliente já cadastrado..."
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {open && matches.length > 0 && (
          <div className="combo-list">
            {matches.map(c => (
              <div className="combo-item" key={c.id} onMouseDown={() => { onSelectExisting(c); setOpen(false); }}>
                <span>{c.nome}</span>
                <span style={{color: "var(--ink-faint)", fontFamily: "var(--font-mono)", fontSize: 12}}>
                  {[c.contato, c.documento].filter(Boolean).join(" · ") || "sem contato"}
                </span>
              </div>
            ))}
          </div>
        )}
        {open && matches.length === 0 && (
          <div className="combo-list">
            <div className="combo-item" style={{color: "var(--ink-faint)", cursor: "default"}}>
              <i className="ti ti-user-search" aria-hidden="true" style={{marginRight: 6}}></i>Nenhum cliente cadastrado encontrado
            </div>
          </div>
        )}
      </div>
      {allowCreate && <button className="btn supplier-new-btn" type="button" onClick={() => { setOpen(false); setShowCreate(true); }} aria-label="Novo cliente" title="Novo cliente">
        <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
      </button>}
      {allowCreate && showCreate && <PessoaModal defaultRole="cliente" title="Novo cliente" onSave={createClient} onCancel={() => setShowCreate(false)} />}
    </div>
  );
}

function CartRemoveConfirm({item, onConfirm, onCancel}) {
  return (
    <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cart-remove-title">
        <h3 id="cart-remove-title"><i className="ti ti-alert-triangle" aria-hidden="true"></i>Retirar do carrinho</h3>
        <p>Tem certeza que deseja retirar <strong>{item.nome}</strong> do carrinho?</p>
        <div className="row">
          <button className="btn ghost" type="button" onClick={onCancel}>Não</button>
          <button className="btn danger" type="button" onClick={onConfirm}>Sim</button>
        </div>
      </div>
    </div>
  );
}

function printSaleReceipt(sale, asPdf) {
    const previousTitle = document.title;
    document.title = `comprovante-venda-${sale.id}`;
    document.documentElement.classList.add("printing-receipt");
    if (asPdf) toast.info('Na janela de impressão, escolha "Salvar como PDF".');
    const cleanup = () => {
      document.documentElement.classList.remove("printing-receipt");
      document.title = previousTitle;
    };
    window.addEventListener("afterprint", cleanup, {once: true});
    window.print();
}

function SaleReceiptModal({receipt, companySettings, onClose}) {
  const {sale, tradeIns = []} = receipt;
  const paymentLabel = forma => FORMAS_PAGAMENTO.find(item => item.key === forma)?.label || forma;
  return (
    <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal sale-receipt-modal printable-sale-receipt" role="dialog" aria-modal="true" aria-labelledby="sale-receipt-title">
        <div className="product-details-head">
          <div><h3 id="sale-receipt-title"><i className="ti ti-receipt" aria-hidden="true"></i>Comprovante de compra</h3></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar comprovante" title="Fechar"><X size={20} aria-hidden="true" /></button>
        </div>
        {companySettings?.nomeFantasia && <div className="receipt-company">{companySettings.logoData && <img className="receipt-company-logo" src={companySettings.logoData} alt={`Logo ${companySettings.nomeFantasia}`} />}<strong>{companySettings.nomeFantasia}</strong>{companySettings.razaoSocial && <span>{companySettings.razaoSocial}</span>}<span>{[formatCpfCnpj(companySettings.documento), companySettings.telefone, companySettings.email].filter(value => value && value !== "Não informado").join(" · ")}</span>{companySettings.endereco && <span>{companySettings.endereco}</span>}</div>}
        <div className="receipt-meta">
          <div><span><Hash size={13} aria-hidden="true" />Venda</span><strong>{sale.id}</strong></div>
          <div><span><CalendarDays size={13} aria-hidden="true" />Data</span><strong>{sale.criadoEm ? new Date(sale.criadoEm).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}</strong></div>
          <div><span><UserRound size={13} aria-hidden="true" />Cliente</span><strong>{sale.cliente?.nome || "Não informado"}<small>CPF/CNPJ: {formatCpfCnpj(sale.cliente?.documento)}</small></strong></div>
        </div>
        <div className="receipt-section"><h4><ShoppingBag size={15} aria-hidden="true" />Produtos</h4>{sale.itens.map(item => <div className="receipt-row" key={item.id}><span>{item.quantidade}x {item.nome}<small>{[item.sub, item.kind === "celular" && item.productSnapshot?.identifier ? `IMEI: ${formatImei(item.productSnapshot.identifier)}` : null].filter(Boolean).join(" · ")}</small></span><strong>{formatBRL(item.vendaUnit * item.quantidade)}</strong></div>)}</div>
        <div className="receipt-section"><h4><CreditCard size={15} aria-hidden="true" />Formas de pagamento</h4>{sale.pagamentos.map((payment, index) => {
          const paidTowardSale = Number(payment.valorBase ?? payment.valor) || 0;
          const cardInterest = Number(payment.valorTaxa) || 0;
          return <div className="receipt-payment-group" key={payment.id || index}>
            <div className="receipt-row"><span>{paymentLabel(payment.forma)}{payment.bandeira ? ` · ${payment.bandeira} · ${payment.parcelas}x` : ""}{payment.forma === "troca" && tradeIns.map((item, itemIndex) => <small key={item.id || itemIndex}>Modelo: {item.modelo || "Não informado"} · IMEI: {item.identifier ? formatImei(item.identifier) : "Não informado"}</small>)}</span><strong>{formatBRL(paidTowardSale)}</strong></div>
            {cardInterest > 0 && <div className="receipt-row receipt-interest-row"><span>Juros do cartão<small>Valor adicional cobrado pela operadora · taxa {payment.taxaPct}%</small></span><strong>+ {formatBRL(cardInterest)}</strong></div>}
          </div>;
        })}</div>
        <div className="receipt-total"><span><BadgeDollarSign size={18} aria-hidden="true" />Total da venda</span><strong>{formatBRL(sale.total)}</strong></div>
        <div className="row receipt-print-actions"><button className="btn receipt-pdf-button" type="button" onClick={() => printSaleReceipt(sale, true)}><FileDown size={17} aria-hidden="true" />Gerar PDF</button><button className="btn receipt-print-button" type="button" onClick={() => printSaleReceipt(sale, false)}><Printer size={17} aria-hidden="true" />Imprimir</button><button className="btn primary" type="button" onClick={onClose}>Fechar comprovante</button></div>
      </div>
    </div>
  );
}

function ProtecaoStartModal({planos, onSelect, onClose}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return planos.filter(plano => !term || plano.modelo.toLocaleLowerCase("pt-BR").includes(term));
  }, [planos, search]);

  return <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal protection-picker-modal" role="dialog" aria-modal="true" aria-labelledby="protection-picker-title">
      <div className="stock-consult-head">
        <div><h3 id="protection-picker-title"><ShieldCheck size={18} aria-hidden="true" />Proteção Start</h3><p>Selecione um plano para adicionar à venda</p></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar" title="Fechar"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className={"search" + (search ? " has-clear" : "")}>
        <i className="ti ti-search" aria-hidden="true"></i>
        <input type="text" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo do plano..." autoFocus />
        {search && <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Limpar busca" title="Limpar busca"><X size={18} aria-hidden="true" /></button>}
      </div>
      <div className="protection-picker-summary">{filtered.length} {filtered.length === 1 ? "plano encontrado" : "planos encontrados"}</div>
      <div className="protection-picker-list">
        {filtered.length === 0 ? <div className="stock-consult-empty">{planos.length === 0 ? "Nenhum plano cadastrado. Cadastre os planos em Configurações." : "Nenhum plano encontrado com essa busca."}</div> : filtered.map(plano => (
          <button type="button" className="protection-picker-item" key={plano.id} onClick={() => onSelect(plano)}>
            <span><strong>{plano.modelo}</strong><small>Proteção Start</small></span>
            <strong>{formatBRL(plano.valor)}</strong>
            <i className="ti ti-chevron-right" aria-hidden="true"></i>
          </button>
        ))}
      </div>
    </div>
  </div>;
}

function StockConsultModal({products, cart, onAdd, onClose}) {
  const pageSize = 8;
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("todos");
  const [page, setPage] = useState(1);
  const available = useMemo(() => products.filter(product => !product.incompleto && product.ativo !== false && !product.vendido).filter(product => product.kind !== "acessorio" || Number(product.quantidade) > 0), [products]);
  const kinds = useMemo(() => KINDS.filter(item => available.some(product => product.kind === item.key)), [available]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return available.filter(product => (kind === "todos" || product.kind === kind) && (!term || [productDisplayName(product), product.fabricante, product.modelo, product.identifier, product.cor, product.memoria, product.categoria].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term)));
  }, [available, kind, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectKind = value => { setKind(value); setPage(1); };

  return <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal stock-consult-modal" role="dialog" aria-modal="true" aria-labelledby="stock-consult-title">
      <div className="stock-consult-head"><div><h3 id="stock-consult-title"><ShoppingBag size={18} aria-hidden="true" />Consultar estoque</h3><p>Produtos disponíveis para venda</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} aria-hidden="true" /></button></div>
      <div className="search"><i className="ti ti-search" aria-hidden="true"></i><input type="text" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome, modelo, IMEI ou serial..." autoFocus /></div>
      <div className="stock-kind-filters"><button type="button" className={"btn sm" + (kind === "todos" ? " active" : "")} onClick={() => selectKind("todos")}>Todos</button>{kinds.map(item => <button type="button" key={item.key} className={"btn sm" + (kind === item.key ? " active" : "")} onClick={() => selectKind(item.key)}><i className={"ti " + item.icon} aria-hidden="true"></i>{item.label}</button>)}</div>
      <div className="stock-consult-summary">{filtered.length} {filtered.length === 1 ? "produto encontrado" : "produtos encontrados"}</div>
      <div className="stock-consult-list">{visible.length === 0 ? <div className="stock-consult-empty">Nenhum produto disponível com esses filtros.</div> : visible.map(product => {
        const cartItem = cart.find(item => item.productId === product.id);
        const reachedLimit = Boolean(cartItem);
        const addProduct = () => {
          if (!reachedLimit) onAdd(product);
        };
        return <div
          className={"stock-consult-item stock-consult-item-clickable" + (reachedLimit ? " is-disabled" : "")}
          key={product.id}
          role="button"
          tabIndex={reachedLimit ? -1 : 0}
          aria-label={reachedLimit ? `${productDisplayName(product)} já está no carrinho` : `Adicionar ${productDisplayName(product)} à venda`}
          onClick={addProduct}
          onKeyDown={event => {
            if (event.currentTarget !== event.target || reachedLimit || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            addProduct();
          }}
        ><div className="stock-consult-info"><strong>{productDisplayName(product)}</strong><span>{productSubtitle(product) || product.identifier || KIND_META[product.kind]?.label}</span></div><span className="badge">{KIND_META[product.kind]?.label || product.kind}</span><span className="stock-consult-qty">{product.kind === "acessorio" ? `${product.quantidade} un.` : ""}</span><strong className="stock-consult-price">{formatBRL(product.venda)}</strong><button type="button" className="btn primary sm stock-consult-add" disabled={reachedLimit} aria-label={reachedLimit ? "Produto no carrinho" : `Adicionar ${productDisplayName(product)}`} title={reachedLimit ? "Produto no carrinho" : "Adicionar à venda"} onClick={event => { event.stopPropagation(); addProduct(); }}>{reachedLimit ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}</button></div>;
      })}</div>
      <div className="stock-pagination"><button type="button" className="btn sm" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><i className="ti ti-chevron-left" aria-hidden="true"></i>Anterior</button><span>Página {currentPage} de {totalPages}</span><button type="button" className="btn sm" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Próxima<i className="ti ti-chevron-right" aria-hidden="true"></i></button></div>
    </div>
  </div>;
}

function PDV({products, historyProducts = [], clientes, suppliers, companySettings, protecaoPlanos, taxasCartao, bandeiras, onSaleComplete, onAddTradeIn, onAddCliente}) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]); // [{id, type:'produto'|'protecao', productId?, kind, nome, sub, quantidade, maxQty, vendaUnit}]
  const [tradeIns, setTradeIns] = useState([]); // [{kind, modelo, valor}] adicionados nesta venda
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showAvulsoModal, setShowAvulsoModal] = useState(false);
  const [showProtecaoPicker, setShowProtecaoPicker] = useState(false);
  const [showStockConsult, setShowStockConsult] = useState(false);

  const [clienteSelecionadoId, setClienteSelecionadoId] = useState(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteContato, setClienteContato] = useState("");

  const [pagamentos, setPagamentos] = useState([]); // [{forma, valor, bandeira?, parcelas?}]
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saleToast, setSaleToast] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [discountTargetId, setDiscountTargetId] = useState(null);
  const [discountValue, setDiscountValue] = useState("");
  const [finalizeError, setFinalizeError] = useState("");
  const [receipt, setReceipt] = useState(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products
      .filter(p => !p.incompleto)
      .filter(p => pdvSearchHay(p).includes(q))
      .filter(p => p.kind === "acessorio" ? Number(p.quantidade) > 0 : true)
      .slice(0, 8);
  }, [products, query]);

  const addToCart = (p) => {
    setCart(prev => {
      const already = prev.find(c => c.productId === p.id);
      if (already) {
        if (p.kind === "acessorio" && already.quantidade < p.quantidade) {
          return prev.map(c => c.productId === p.id ? {...c, quantidade: c.quantidade + 1} : c);
        }
        return prev;
      }
      return [...prev, {
        id: uid(),
        type: "produto",
        productId: p.id,
        kind: p.kind,
        nome: productDisplayName(p),
        sub: productSubtitle(p) || p.identifier,
        quantidade: 1,
        maxQty: p.kind === "acessorio" ? Number(p.quantidade) : 1,
        vendaUnit: Number(p.venda),
        precoOriginal: Number(p.venda),
        custoUnit: Number(p.custo) || 0,
      }];
    });
    setQuery("");
  };

  const addProtecao = (plano) => {
    setCart(prev => {
      const existing = prev.find(item => item.type === "protecao" && (item.planoId === plano.id || (!item.planoId && item.sub === plano.modelo)));
      if (existing) {
        return prev.map(item => item.id === existing.id ? {...item, quantidade: item.quantidade + 1} : item);
      }
      return [...prev, {
        id: uid(),
        planoId: plano.id,
        type: "protecao",
        kind: "protecao",
        nome: "Proteção Start",
        sub: plano.modelo,
        quantidade: 1,
        maxQty: 99,
        vendaUnit: Number(plano.valor) || 0,
      }];
    });
    setShowProtecaoPicker(false);
  };

  const addItemAvulso = ({nome, valor}) => {
    setCart(prev => [...prev, {
      id: uid(),
      type: "avulso",
      kind: "avulso",
      nome,
      sub: "item avulso · sem estoque",
      quantidade: 1,
      maxQty: 1,
      vendaUnit: Number(valor) || 0,
    }]);
    setShowAvulsoModal(false);
  };

  const changeQty = (id, delta) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = Math.min(c.maxQty, Math.max(1, c.quantidade + delta));
      return {...c, quantidade: next};
    }));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));

  const openDiscount = (item) => {
    setDiscountTargetId(item.id);
    setDiscountValue(item.vendaUnit);
  };

  const closeDiscount = () => {
    setDiscountTargetId(null);
    setDiscountValue("");
  };

  const applyDiscount = (item) => {
    const price = Number(discountValue);
    const minimum = Number(item.custoUnit) || 0;
    if (!Number.isFinite(price)) return toast.error("Informe um preço de venda válido.");
    if (price < minimum) return toast.error(`O menor preço permitido é ${formatBRL(minimum)} (preço de custo).`);
    setCart(prev => prev.map(cartItem => cartItem.id === item.id ? {...cartItem, vendaUnit: price} : cartItem));
    closeDiscount();
  };

  const removeDiscount = (item) => {
    setCart(prev => prev.map(cartItem => cartItem.id === item.id ? {...cartItem, vendaUnit: cartItem.precoOriginal} : cartItem));
    closeDiscount();
  };

  const handleAddTradeIn = async (data) => {
    setTradeIns(prev => [...prev, data]);
    setShowTradeModal(false);
    // ativa automaticamente a forma de pagamento "troca" somando o valor
    setPagamentos(prev => {
      const exists = prev.find(p => p.forma === "troca");
      if (exists) {
        return prev.map(p => p.forma === "troca" ? {...p, valor: (Number(p.valor) || 0) + data.valor} : p);
      }
      return [...prev, {forma: "troca", valor: data.valor}];
    });
  };

  const updateTradePayment = value => {
    const target = Math.max(0, Number(value) || 0);
    setPagamentoField("troca", "valor", value);
    setTradeIns(previous => {
      if (!previous.length) return previous;
      if (previous.length === 1) return [{...previous[0], valor: target}];
      const currentTotal = previous.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
      if (currentTotal <= 0) return previous.map((item, index) => ({...item, valor: index === previous.length - 1 ? target : 0}));
      const targetCents = Math.round(target * 100);
      let distributedCents = 0;
      return previous.map((item, index) => {
        const cents = index === previous.length - 1
          ? targetCents - distributedCents
          : Math.round(((Number(item.valor) || 0) / currentTotal) * targetCents);
        distributedCents += cents;
        return {...item, valor: cents / 100};
      });
    });
  };

  const removeTradeIn = index => {
    const next = tradeIns.filter((_, itemIndex) => itemIndex !== index);
    const nextTotal = next.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
    setTradeIns(next);
    setPagamentos(previous => next.length
      ? previous.map(payment => payment.forma === "troca" ? {...payment, valor: nextTotal} : payment)
      : previous.filter(payment => payment.forma !== "troca"));
  };

  const clearTradeIns = () => {
    setTradeIns([]);
    setPagamentos(previous => previous.filter(payment => payment.forma !== "troca"));
  };

  const total = useMemo(() => cart.reduce((acc, c) => acc + c.vendaUnit * c.quantidade, 0), [cart]);

  const taxaDe = (bandeira, parcelas) => Number((taxasCartao[bandeira] || {})[parcelas]) || 0;

  // O saldo da venda é calculado só com os valores "base" (o que cobre o preço
  // da venda). A taxa do cartão é um acréscimo que o cliente paga a mais em
  // cima do que já foi coberto — não entra nessa conta, então nunca aparece
  // como "excesso" só por causa da taxa.
  const pagoBase = useMemo(() => pagamentos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0), [pagamentos]);
  const saldo = total - pagoBase;

  const temCartaoCredito = pagamentos.some(p => p.forma === "cartao_credito");

  const togglePagamento = (forma) => {
    if (forma === "troca" && tradeIns.length > 0) {
      const tradeTotal = tradeIns.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
      setPagamentos(previous => previous.some(payment => payment.forma === "troca")
        ? previous.map(payment => payment.forma === "troca" ? {...payment, valor: tradeTotal} : payment)
        : [...previous, {forma: "troca", valor: tradeTotal}]);
      return;
    }
    if (forma === "cartao_credito" && temCartaoCredito) {
      // já tem cartão de crédito na venda — clicar de novo remove (só 1 por venda)
      setPagamentos(prev => prev.filter(p => p.forma !== "cartao_credito"));
      return;
    }
    setPagamentos(prev => {
      const exists = prev.find(p => p.forma === forma);
      if (exists) return prev.filter(p => p.forma !== forma);
      const sugestao = Math.max(0, total - pagoBase);
      const base = {forma, valor: sugestao ? sugestao.toFixed(2) : ""};
      if (forma === "cartao_credito") return [...prev, {...base, bandeira: bandeiras[0] || "", parcelas: 1}];
      return [...prev, base];
    });
  };

  const setPagamentoField = (forma, field, value) => {
    setPagamentos(prev => prev.map(p => p.forma === forma ? {...p, [field]: value} : p));
  };

  // Valor da parcela e total que o cliente paga no cartão, com taxa embutida.
  const cartaoCalculo = (p) => {
    const base = Number(p.valor) || 0;
    const taxaPct = taxaDe(p.bandeira, p.parcelas);
    const totalComTaxa = base * (1 + taxaPct / 100);
    const parcelas = Number(p.parcelas) || 1;
    return {totalComTaxa, valorParcela: totalComTaxa / parcelas, taxaPct};
  };

  const handleSelectExistingClient = (c) => {
    setClienteSelecionadoId(c.id);
    setClienteNome(c.nome);
    setClienteContato(c.contato || "");
  };

  const handleClienteNomeChange = (v) => {
    setClienteSelecionadoId(null);
    setClienteNome(v);
  };

  const handleFinalize = async () => {
    const errs = {};
    if (cart.length === 0) errs.cart = "Adicione ao menos um produto";
    const belowCost = cart.find(item => item.type === "produto" && Number(item.vendaUnit) < (Number(item.custoUnit) || 0));
    if (belowCost) errs.cart = `${belowCost.nome}: o preço de venda não pode ser menor que o custo (${formatBRL(belowCost.custoUnit)}).`;
    if (!clienteNome.trim()) errs.clienteNome = "Obrigatório";
    if (pagamentos.length === 0) errs.pagamentos = "Selecione a forma de pagamento";
    const tradeTotal = tradeIns.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
    const tradePayment = Number(pagamentos.find(payment => payment.forma === "troca")?.valor) || 0;
    if (tradeIns.length > 0 && Math.abs(tradeTotal - tradePayment) > 0.01) errs.pagamentos = "O valor da troca deve ser igual ao custo do aparelho recebido";
    if (pagamentos.length > 0 && Math.abs(saldo) > 0.01) errs.pagamentos = saldo > 0 ? "Ainda falta cobrir o valor da venda" : "O valor digitado passou do total da venda";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setFinalizeError("");
    setSaving(true);
    try {

      let clienteId = clienteSelecionadoId;
      if (!clienteId) {
        const novo = await onAddCliente({nome: clienteNome.trim(), contato: clienteContato.trim()});
        clienteId = novo.id;
      }

      const {sale, products: updated} = await db.finalizeSale({
        cartItems: cart.filter(c => c.type === "produto").map(c => ({productId: c.productId, kind: c.kind, quantidade: c.quantidade, vendaUnit: c.vendaUnit, nome: c.nome, sub: c.sub})),
        extras: cart.filter(c => c.type !== "produto").map(c => ({kind: c.kind, quantidade: c.quantidade, vendaUnit: c.vendaUnit, nome: c.nome, sub: c.sub, tipo: c.type})),
        tradeIns,
        cliente: {id: clienteId, nome: clienteNome.trim(), contato: clienteContato.trim(), documento: clientes.find(item => item.id === clienteId)?.documento || ""},
        pagamentos: pagamentos.map(p => {
          if (p.forma === "cartao_credito") {
            const calc = cartaoCalculo(p);
            const valorBase = Number(p.valor) || 0;
            return {forma: p.forma, valorBase, taxaPct: calc.taxaPct, valorTaxa: calc.totalComTaxa - valorBase, valor: calc.totalComTaxa, bandeira: p.bandeira || null, parcelas: p.parcelas || null};
          }
          const valor = Number(p.valor) || 0;
          return {forma: p.forma, valorBase: valor, taxaPct: 0, valorTaxa: 0, valor, bandeira: null, parcelas: null};
        }),
        total,
      });
      setReceipt({sale, tradeIns: tradeIns.map(item => ({...item}))});
      setSaleToast(true);
      setTimeout(() => setSaleToast(false), 2600);
      setCart([]);
      setTradeIns([]);
      setClienteSelecionadoId(null);
      setClienteNome("");
      setClienteContato("");
      setPagamentos([]);
      setErrors({});
      onSaleComplete(updated);
    } catch (error) {
      const message = error?.message || "Não foi possível finalizar a venda. Tente novamente.";
      setFinalizeError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pdv-layout">
      <div className="panel">
        <div className="panel-head">
          <h2><i className="ti ti-search" aria-hidden="true"></i>Buscar produto</h2>
          <span className="sub">por nome, modelo, IMEI ou serial</span>
        </div>
        <div className="pdv-product-search-row">
          <div className={"search" + (query ? " has-clear" : "")}>
            <i className="ti ti-search" aria-hidden="true"></i>
            <input type="text" placeholder="Ex: iPhone 13, 35291..., Cabo USB-C" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            {query && <button type="button" className="search-clear pdv-search-clear" onClick={event => { setQuery(""); event.currentTarget.previousElementSibling?.focus(); }} aria-label="Limpar busca" title="Limpar busca"><X size={18} strokeWidth={2.2} aria-hidden="true" /></button>}
          </div>
          <button type="button" className="btn pdv-stock-consult-button" onClick={() => setShowStockConsult(true)} aria-label="Consultar estoque" title="Consultar estoque"><ShoppingBag size={19} strokeWidth={1.9} aria-hidden="true" /></button>
        </div>
        {results.length > 0 && (
          <div className="pdv-search-results">
            {results.map(p => {
              const inCart = cart.find(c => c.productId === p.id);
              const disabled = p.kind !== "acessorio" && inCart;
              return (
                <div key={p.id} className={"pdv-result" + (disabled ? " disabled" : "")} onClick={() => !disabled && addToCart(p)}>
                  <div>
                    <div className="pr-name">{productDisplayName(p)}</div>
                    <div className="pr-sub">{productSubtitle(p) || p.identifier}{p.kind === "acessorio" ? ` · ${p.quantidade} disponível` : ""}{disabled ? " · já no carrinho" : ""}</div>
                  </div>
                  <div className="pr-price">{formatBRL(p.venda)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="actions" style={{marginTop: 14}}>
          <button type="button" className="btn sm" onClick={() => setShowProtecaoPicker(true)}>
            <i className="ti ti-shield-check" aria-hidden="true"></i>Proteção Start
          </button>
          <button type="button" className="btn sm" onClick={() => setShowTradeModal(true)}>
            <i className="ti ti-replace" aria-hidden="true"></i>Aparelho na troca
          </button>
          <button type="button" className="btn sm" onClick={() => setShowAvulsoModal(true)}>
            <i className="ti ti-tag" aria-hidden="true"></i>Item avulso
          </button>
        </div>
        {tradeIns.length > 0 && (
          <div style={{marginTop: 10}}>
            {tradeIns.map((t, idx) => (
              <span key={t.id || idx} className="badge" style={{marginRight: 6, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 5}}>
                <i className="ti ti-replace" aria-hidden="true"></i>{KIND_META[t.kind].label}{t.modelo ? " · " + t.modelo : ""} · {formatBRL(t.valor)}
                <button type="button" onClick={() => removeTradeIn(idx)} aria-label={`Retirar ${t.modelo || "aparelho"} da troca`} title="Retirar aparelho da troca" style={{display: "inline-flex", padding: 1, border: 0, background: "transparent", color: "var(--danger)", cursor: "pointer"}}>
                  <X size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="divider"></div>

        <div className="panel-head" style={{marginBottom: 14}}>
          <h2><i className="ti ti-user" aria-hidden="true"></i>Cliente</h2>
          <span className="sub">busque para evitar cadastro duplicado</span>
        </div>
        <div>
          <Field label="Nome" required error={errors.clienteNome}>
            <ClienteCombo value={clienteNome} onChange={handleClienteNomeChange} clientes={clientes} onSelectExisting={handleSelectExistingClient} onAddCliente={onAddCliente} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2><i className="ti ti-shopping-cart" aria-hidden="true"></i>Carrinho</h2>
          <span className="sub">{cart.length} {cart.length === 1 ? "item" : "itens"}</span>
        </div>

        {cart.length === 0 ? (
          <div className="empty-cart">
            <i className="ti ti-shopping-cart-off" aria-hidden="true"></i>
            <p>Busque um produto para adicionar à venda</p>
          </div>
        ) : (
          <div>
            {cart.map(c => {
              const priceChanged = c.type === "produto" && Math.abs(Number(c.vendaUnit) - Number(c.precoOriginal)) > 0.009;
              return (
                <div className="cart-item" key={c.id}>
                  <div className="cart-item-main">
                    <div className="ci-info">
                      <div className="ci-name">{c.nome}</div>
                      <div className="ci-sub">{c.sub}</div>
                    </div>
                    {c.kind === "acessorio" && (
                      <div className="ci-qty">
                        <button type="button" onClick={() => changeQty(c.id, -1)} aria-label="Diminuir quantidade"><span aria-hidden="true">−</span></button>
                        <span>{c.quantidade}</span>
                        <button type="button" onClick={() => changeQty(c.id, 1)} aria-label="Aumentar quantidade" disabled={c.quantidade >= c.maxQty}><span aria-hidden="true">+</span></button>
                      </div>
                    )}
                    {c.type === "protecao" && <span className="ci-static-qty" title="Quantidade adicionada pelo modal">{c.quantidade}x</span>}
                    <div className="ci-price">
                      {priceChanged && <small>Original: {formatBRL(c.precoOriginal * c.quantidade)}</small>}
                      {formatBRL(c.vendaUnit * c.quantidade)}
                    </div>
                    {c.type === "produto" && (
                      <button type="button" className={"icon-btn" + (priceChanged ? " active" : "")} onClick={() => openDiscount(c)} aria-label="Alterar preço de venda" title="Alterar preço de venda">
                        <Pencil size={18} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" className="icon-btn danger" onClick={() => setRemoveTarget(c)} aria-label="Remover do carrinho">
                      <X size={18} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                  {discountTargetId === c.id && (
                    <div className="discount-editor">
                      <div className="discount-field">
                        <label>Preço de venda</label>
                        <BRLCurrencyInput value={discountValue} onChange={setDiscountValue} />
                        <small>Mínimo permitido: {formatBRL(c.custoUnit)}</small>
                      </div>
                      <div className="discount-actions">
                        {priceChanged && <button type="button" className="discount-action-btn" onClick={() => removeDiscount(c)} aria-label="Restaurar preço original" title="Restaurar preço original"><RotateCcw size={17} aria-hidden="true" /></button>}
                        <button type="button" className="discount-action-btn" onClick={closeDiscount} aria-label="Cancelar alteração" title="Cancelar alteração"><X size={17} aria-hidden="true" /></button>
                        <button type="button" className="discount-action-btn primary" onClick={() => applyDiscount(c)} aria-label="Salvar novo preço" title="Salvar novo preço"><Check size={18} aria-hidden="true" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {errors.cart && <div className="err" style={{marginTop: 8}}>{errors.cart}</div>}

        <div className="divider"></div>

        <div className="panel-head" style={{marginBottom: 12}}>
          <h2 style={{fontSize: 15}}><i className="ti ti-wallet" aria-hidden="true"></i>Forma de pagamento</h2>
        </div>
        <div className="pay-grid">
          {FORMAS_PAGAMENTO.map(fp => {
            const sel = pagamentos.find(p => p.forma === fp.key);
            return (
              <button type="button" key={fp.key} className={"pay-chip" + (sel ? " sel" : "")} onClick={() => togglePagamento(fp.key)}>
                <i className={"ti " + fp.icon} aria-hidden="true"></i>{fp.label}
              </button>
            );
          })}
        </div>
        {pagamentos.map(p => {
          const calc = p.forma === "cartao_credito" ? cartaoCalculo(p) : null;
          return (
            <div key={p.forma}>
              <div className="pay-amount-row">
                <span className="mono" style={{minWidth: 110}}>{FORMAS_PAGAMENTO.find(f => f.key === p.forma).label}</span>
                <BRLCurrencyInput value={p.valor} onChange={value => p.forma === "troca" ? updateTradePayment(value) : setPagamentoField(p.forma, "valor", value)} />
                {p.forma === "troca" && tradeIns.length > 0 && (
                  <button type="button" className="icon-btn danger" onClick={clearTradeIns} aria-label="Retirar aparelho da troca" title="Retirar aparelho da troca">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </div>
              {p.forma === "cartao_credito" && (
                <React.Fragment>
                  <div className="pay-amount-row" style={{marginTop: 6}}>
                    <select className="filter-select" style={{flex: 1}} value={p.bandeira} onChange={e => setPagamentoField(p.forma, "bandeira", e.target.value)}>
                      {bandeiras.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <select className="filter-select" style={{flex: 1}} value={p.parcelas} onChange={e => setPagamentoField(p.forma, "parcelas", Number(e.target.value))}>
                      {Array.from({length: PARCELAS_MAX}, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}x{taxaDe(p.bandeira, n) ? ` · taxa ${taxaDe(p.bandeira, n)}%` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="cartao-resumo">
                    <div><span>Total no cartão (com taxa)</span><b>{formatBRL(calc.totalComTaxa)}</b></div>
                    <div><span>{p.parcelas}x de</span><b>{formatBRL(calc.valorParcela)}</b></div>
                  </div>
                </React.Fragment>
              )}
            </div>
          );
        })}
        {errors.pagamentos && <div className="err" style={{marginTop: 8}}>{errors.pagamentos}</div>}

        <div className="cart-summary">
          <div className="row sale-total"><span>Total da venda</span><strong>{formatBRL(total)}</strong></div>
          {pagamentos.length > 0 && (
            saldo > 0.01 ? (
              <div className="row total"><span>Total a pagar</span><span>{formatBRL(saldo)}</span></div>
            ) : (
              <div className="row total" style={{color: "var(--ok)"}}><span>Saldo</span><span><i className="ti ti-circle-check" aria-hidden="true" style={{marginRight: 4}}></i>Fechado</span></div>
            )
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={saving} onClick={handleFinalize} style={{flex: 1, justifyContent: "center"}}>
            {saving ? <React.Fragment><i className="ti ti-loader-2" aria-hidden="true"></i>Finalizando...</React.Fragment> : <React.Fragment><i className="ti ti-check" aria-hidden="true"></i>Finalizar venda</React.Fragment>}
          </button>
        </div>
        {finalizeError && <div className="auth-alert danger" style={{marginTop: 10}}>{finalizeError}</div>}
      </div>

      {saleToast && (
        <div className="toast"><i className="ti ti-circle-check" aria-hidden="true"></i>Venda registrada e estoque atualizado</div>
      )}

      {showTradeModal && (
        <TradeInModal
          clientes={clientes}
          historyProducts={historyProducts}
          selectedClient={clientes.find(client => client.id === clienteSelecionadoId) || null}
          onSelectClient={handleSelectExistingClient}
          onClientInputChange={handleClienteNomeChange}
          onAddCliente={onAddCliente}
          onAdd={handleAddTradeIn}
          onCancel={() => setShowTradeModal(false)}
        />
      )}

      {showAvulsoModal && (
        <ItemAvulsoModal onAdd={addItemAvulso} onCancel={() => setShowAvulsoModal(false)} />
      )}

      {showProtecaoPicker && <ProtecaoStartModal planos={protecaoPlanos} onSelect={addProtecao} onClose={() => setShowProtecaoPicker(false)} />}

      {showStockConsult && <StockConsultModal products={products} cart={cart} onAdd={addToCart} onClose={() => setShowStockConsult(false)} />}

      {removeTarget && (
        <CartRemoveConfirm item={removeTarget} onCancel={() => setRemoveTarget(null)} onConfirm={() => { removeFromCart(removeTarget.id); setRemoveTarget(null); }} />
      )}
      {receipt && <SaleReceiptModal receipt={receipt} companySettings={companySettings} onClose={() => setReceipt(null)} />}
    </div>
  );
}

/* =========================================================================
   HISTÓRICO DE VENDAS
   ========================================================================= */

function EstornoVendaModal({sale, onConfirm, onCancel}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setSaving(true);
    setError("");
    try {
      await onConfirm(motivo.trim());
    } catch (err) {
      setError(err?.message || "Não foi possível estornar a venda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <h3><RotateCcw size={18} aria-hidden="true" />Estornar venda</h3>
        <p>Tem certeza que deseja estornar a venda de <strong>{formatBRL(sale.total)}</strong>? Todos os produtos serão devolvidos ao estoque e a venda será marcada como estornada.</p>
        <Field label="Motivo (opcional)">
          <input type="text" value={motivo} placeholder="Ex: cliente desistiu, defeito..." onChange={e => setMotivo(e.target.value)} autoFocus />
        </Field>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn" style={{background: "var(--danger-dim)", borderColor: "rgba(242,84,91,0.4)", color: "var(--danger)"}} onClick={handleConfirm} disabled={saving}>
            {saving ? "Estornando venda..." : "Sim, estornar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrocaItemModal({item, products, onConfirm, onCancel}) {
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const candidatos = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products
      .filter(p => !p.incompleto && p.id !== item.productId)
      .filter(p => pdvSearchHay(p).includes(q))
      .slice(0, 8);
  }, [products, query, item]);

  const handleConfirm = async (novoProduto) => {
    setSaving(true);
    await onConfirm(novoProduto.id);
    setSaving(false);
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{maxWidth: 480}}>
        <h3><i className="ti ti-replace" aria-hidden="true" style={{color: "var(--accent)"}}></i>Trocar item</h3>
        <p>
          Trocando <strong>{item.nome}</strong>{item.sub ? ` · ${item.sub}` : ""} por outro produto do estoque.
          O item atual volta ao estoque e o valor pago (<strong>{formatBRL(item.vendaUnit * item.quantidade)}</strong>) é mantido na venda.
        </p>
        <div className="search">
          <i className="ti ti-search" aria-hidden="true"></i>
          <input type="text" placeholder="Buscar produto no estoque..." value={query} onChange={e => setQuery(e.target.value)} autoFocus />
        </div>
        {candidatos.length > 0 && (
          <div className="pdv-search-results" style={{marginTop: 8}}>
            {candidatos.map(p => (
              <div key={p.id} className="pdv-result" onClick={() => !saving && handleConfirm(p)}>
                <div>
                  <div className="pr-name">{productDisplayName(p)}</div>
                  <div className="pr-sub">{productSubtitle(p) || p.identifier}</div>
                </div>
                <div className="pr-price">{formatBRL(p.venda)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function SaleDetailsModal({sale, tradeIns, usersById, clientDocument, companySettings, onClose, onEstornarVenda}) {
  const user = usersById[sale.criadoPor];
  const userName = user ? `${user.full_name || user.email}${user.slug ? ` (@${user.slug})` : ""}` : "Não identificado";
  const paymentLabel = forma => FORMAS_PAGAMENTO.find(item => item.key === forma)?.label || forma;
  return (
    <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal sale-details-modal printable-sale-receipt" role="dialog" aria-modal="true" aria-labelledby="sale-details-title">
        <div className="product-details-head"><div><h3 id="sale-details-title"><i className="ti ti-receipt" aria-hidden="true"></i>Detalhes da venda</h3><p>{sale.cliente?.nome || "Cliente não identificado"}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar" title="Fechar"><X size={20} aria-hidden="true" /></button></div>
        {companySettings?.nomeFantasia && <div className="receipt-company">{companySettings.logoData && <img className="receipt-company-logo" src={companySettings.logoData} alt={`Logo ${companySettings.nomeFantasia}`} />}<strong>{companySettings.nomeFantasia}</strong>{companySettings.razaoSocial && <span>{companySettings.razaoSocial}</span>}<span>{[formatCpfCnpj(companySettings.documento), companySettings.telefone, companySettings.email].filter(value => value && value !== "Não informado").join(" · ")}</span>{companySettings.endereco && <span>{companySettings.endereco}</span>}</div>}
        <div className="receipt-meta"><div><span>Identificação</span><strong>{sale.id}</strong></div><div><span>Data</span><strong>{new Date(sale.criadoEm).toLocaleString("pt-BR")}</strong></div><div><span>Cliente</span><strong>{sale.cliente?.nome || "Não informado"}<small>CPF/CNPJ: {formatCpfCnpj(clientDocument || sale.cliente?.documento)}</small>{sale.cliente?.contato && <small>Contato: {sale.cliente.contato}</small>}</strong></div><div><span>Usuário responsável</span><strong>{userName}</strong></div><div><span>Status</span><strong>{sale.status === "ativo" ? "Ativa" : sale.status === "estornada" ? "Estornada" : "Parcialmente estornada"}</strong></div></div>
        <div className="receipt-section"><h4><ShoppingBag size={15} aria-hidden="true" />Itens da venda</h4>{sale.itens.map(item => <div className={"receipt-row sale-detail-item" + (item.status !== "ativo" ? " inactive" : "")} key={item.id}><span>{item.quantidade}x {item.nome}<small>{[item.sub, item.kind === "celular" && item.productSnapshot?.identifier ? `IMEI: ${formatImei(item.productSnapshot.identifier)}` : null, item.status !== "ativo" ? `${item.status}${item.motivoEstorno ? `: ${item.motivoEstorno}` : ""}` : null].filter(Boolean).join(" · ")}</small></span><strong>{formatBRL(item.vendaUnit * item.quantidade)}</strong></div>)}</div>
        <div className="receipt-section"><h4><CreditCard size={15} aria-hidden="true" />Pagamentos</h4>{sale.pagamentos.map((payment, index) => {
          const paidTowardSale = Number(payment.valorBase ?? payment.valor) || 0;
          const cardInterest = Number(payment.valorTaxa) || 0;
          return <div className="receipt-payment-group" key={payment.id || index}>
            <div className="receipt-row"><span>{paymentLabel(payment.forma)}{payment.bandeira ? ` · ${payment.bandeira} · ${payment.parcelas}x` : ""}{payment.forma === "troca" && tradeIns.map(item => <small key={item.id}>Modelo: {item.modelo || "Não informado"} · IMEI: {item.identifier ? formatImei(item.identifier) : "Não informado"}</small>)}</span><strong>{formatBRL(paidTowardSale)}</strong></div>
            {cardInterest > 0 && <div className="receipt-row receipt-interest-row"><span>Juros do cartão<small>Valor adicional cobrado pela operadora · taxa {payment.taxaPct}%</small></span><strong>+ {formatBRL(cardInterest)}</strong></div>}
          </div>;
        })}</div>
        <div className="receipt-total"><span><BadgeDollarSign size={18} aria-hidden="true" />Total da venda</span><strong>{formatBRL(sale.total)}</strong></div>
        <div className="sale-details-footer receipt-print-actions"><button className="btn receipt-pdf-button" type="button" onClick={() => printSaleReceipt(sale, true)}><FileDown size={17} aria-hidden="true" />Gerar PDF</button><button className="btn receipt-print-button" type="button" onClick={() => printSaleReceipt(sale, false)}><Printer size={17} aria-hidden="true" />Imprimir</button>{sale.status !== "estornada" && <button className="btn sale-void-button" type="button" onClick={onEstornarVenda}><RotateCcw size={17} aria-hidden="true" />Estornar venda</button>}</div>
      </div>
    </div>
  );
}

function Historico({sales, products, clientes, usersById, companySettings, reload, onEstornarVenda}) {
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [estornoTarget, setEstornoTarget] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return sales.filter(s => {
      if (!isWithinDateRange(s.criadoEm || s.created_at, startDate, endDate)) return false;
      if (!query.trim()) return true;
      const hay = [s.cliente?.nome, s.cliente?.contato, ...s.itens.map(i => i.nome)].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sales, query, startDate, endDate]);
  const effectivePageSize = pageSize === "all" ? Math.max(filtered.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleSales = filtered.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);
  useEffect(() => { setPage(1); }, [query, startDate, endDate, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  // Total "líquido" da venda: soma só os itens ainda ativos (descontando estornos)
  const totalAtivo = (s) => s.itens.filter(i => i.status === "ativo").reduce((acc, i) => acc + i.vendaUnit * i.quantidade, 0);

  const stats = useMemo(() => {
    const totalVendido = filtered.reduce((acc, s) => acc + totalAtivo(s), 0);
    const totalVendas = filtered.length;
    const totalItens = filtered.reduce((acc, s) => acc + s.itens.filter(i => i.status === "ativo").reduce((a, i) => a + Number(i.quantidade || 1), 0), 0);
    const totalAvulsos = filtered.reduce((acc, s) => acc + s.itens.filter(i => i.status === "ativo" && i.tipo === "avulso").reduce((a, i) => a + Number(i.quantidade || 1), 0), 0);
    return {totalVendido, totalVendas, totalItens, totalAvulsos};
  }, [filtered]);

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", year: "2-digit"}) + " às " + d.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
  };

  const statusBadge = (s) => {
    if (s.status === "estornada") return <span className="badge" style={{color: "var(--danger)", borderColor: "rgba(242,84,91,0.35)", background: "var(--danger-dim)"}}>estornada</span>;
    if (s.status === "parcialmente_estornada") return <span className="badge" style={{color: "var(--warn)", borderColor: "rgba(242,184,75,0.35)", background: "rgba(242,184,75,0.08)"}}>parcialmente estornada</span>;
    return null;
  };

  const handleEstorno = async (motivo) => {
    await onEstornarVenda(estornoTarget.id, motivo);
    setEstornoTarget(null);
    setSelectedSale(null);
  };

  return (
    <div>
      <div className="stat-row">
        <div className="stat"><div className="sl">Vendas</div><div className="sv">{stats.totalVendas}</div></div>
        <div className="stat"><div className="sl">Itens e serviços vendidos</div><div className="sv">{stats.totalItens}</div></div>
        <div className="stat"><div className="sl">Serviços / avulsos</div><div className="sv">{stats.totalAvulsos}</div></div>
        <div className="stat"><div className="sl">Total vendido</div><div className="sv">{formatBRL(stats.totalVendido)}</div></div>
      </div>

      <div className="stock-bar date-filter-bar">
        <div className="search">
          <i className="ti ti-search" aria-hidden="true"></i>
          <input type="text" placeholder="Buscar por cliente ou produto..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="date-range-filter" aria-label="Filtrar vendas por período">
          <label>
            <span>Data inicial</span>
            <input type="date" value={startDate} max={endDate || undefined} onChange={event => {
              const value = event.target.value;
              setStartDate(value);
              if (value && endDate && value > endDate) setEndDate(value);
            }} />
          </label>
          <label>
            <span>Data final</span>
            <input type="date" value={endDate} min={startDate || undefined} onChange={event => {
              const value = event.target.value;
              setEndDate(value);
              if (value && startDate && value < startDate) setStartDate(value);
            }} />
          </label>
        </div>
        <button className="btn sm inventory-refresh-btn" type="button" onClick={reload} aria-label="Atualizar vendas" title="Atualizar vendas">
          <RefreshCw size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <i className="ti ti-receipt-off" aria-hidden="true"></i>
          <p>{sales.length === 0 ? "Nenhuma venda registrada ainda." : "Nada encontrado para essa busca."}</p>
        </div>
      ) : (
        <div className="table-wrap sales-table-wrap">
          <table className="stock">
            <thead><tr><th>Cliente</th><th>Data</th><th>Itens</th><th>Pagamento</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>{visibleSales.map(sale => {
              const activePayments = sale.pagamentos.filter(payment => Number(payment.valor || 0) > 0);
              const paymentLabel = activePayments.length > 1
                ? "Pagamento misto"
                : (FORMAS_PAGAMENTO.find(item => item.key === activePayments[0]?.forma)?.label || activePayments[0]?.forma || "Não informado");
              return <tr key={sale.id} className="stock-clickable-row" tabIndex={0} onClick={() => setSelectedSale(sale)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedSale(sale); } }}>
                <td><div className="pname">{sale.cliente?.nome || "Cliente não identificado"}</div><div className="psub">{sale.cliente?.contato || sale.id}</div></td>
                <td className="mono">{formatDate(sale.criadoEm)}</td>
                <td><div className="sales-items-summary"><span className="badge">{sale.itens.filter(item => item.status === "ativo").reduce((sum, item) => sum + Number(item.quantidade || 1), 0)} itens</span>{sale.itens.filter(item => item.status === "ativo").map(item => <span className="sales-item-entry" key={item.id}>{item.tipo === "avulso" && <span className="badge sales-avulso-badge">Serviço avulso</span>}<span className="sales-item-name">{Number(item.quantidade || 1)}x {item.nome}</span></span>)}</div></td>
                <td><div className="sales-payment-summary"><span>{paymentLabel}</span></div></td>
                <td>{statusBadge(sale) || <span className="badge" style={{color: "var(--ok)"}}>ativa</span>}</td>
                <td className="mono sales-total-cell">{formatBRL(totalAtivo(sale))}</td>
              </tr>;
            })}</tbody>
          </table>
          <div className="list-pagination"><button type="button" className="btn sm" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><i className="ti ti-chevron-left" aria-hidden="true"></i>Anterior</button><div className="pagination-center"><PageSizeSelector value={pageSize} onChange={setPageSize} minimum={10} total={filtered.length} /><span>Página {currentPage} de {totalPages} · {filtered.length} {filtered.length === 1 ? "venda" : "vendas"}</span></div><button type="button" className="btn sm" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Próxima<i className="ti ti-chevron-right" aria-hidden="true"></i></button></div>
        </div>
      )}

      {estornoTarget && (
        <EstornoVendaModal sale={estornoTarget} onConfirm={handleEstorno} onCancel={() => setEstornoTarget(null)} />
      )}
      {selectedSale && <SaleDetailsModal sale={selectedSale} tradeIns={products.filter(product => product.vendaOrigemId === selectedSale.id)} usersById={usersById} clientDocument={clientes.find(client => client.id === selectedSale.cliente?.id)?.documento || ""} companySettings={companySettings} onClose={() => setSelectedSale(null)} onEstornarVenda={() => setEstornoTarget(selectedSale)} />}
    </div>
  );
}

/* =========================================================================
   CONFIGURAÇÕES — Proteção Start e taxas de cartão
   ========================================================================= */

function ImportPlanosModal({onConfirm, onCancel}) {
  const [rows, setRows] = useState(null); // null = nada carregado ainda
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const normalizeHeader = (h) => String(h || "").trim().toLowerCase();

  const handleFile = (file) => {
    setParseError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type: "array"});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {defval: ""});

        if (json.length === 0) {
          setParseError("A planilha está vazia.");
          setRows(null);
          return;
        }

        // Detecta as colunas de modelo e valor pelo cabeçalho, aceitando variações comuns
        const sample = json[0];
        const keys = Object.keys(sample);
        const modeloKey = keys.find(k => ["modelo", "produto", "aparelho"].includes(normalizeHeader(k)));
        const valorKey = keys.find(k => ["valor", "preço", "preco", "plano"].includes(normalizeHeader(k)));

        if (!modeloKey || !valorKey) {
          setParseError('Não encontrei as colunas "Modelo" e "Valor" na planilha. Confira o cabeçalho da primeira linha.');
          setRows(null);
          return;
        }

        const parsed = json.map(row => ({
          modelo: String(row[modeloKey] || "").trim(),
          valor: Number(String(row[valorKey]).toString().replace(",", ".")) || 0,
        })).filter(r => r.modelo);

        if (parsed.length === 0) {
          setParseError("Nenhuma linha válida encontrada.");
          setRows(null);
          return;
        }

        setRows(parsed);
      } catch (err) {
        setParseError("Não consegui ler esse arquivo. Confira se é um .xlsx válido.");
        setRows(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(rows);
    setSaving(false);
  };

  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{maxWidth: 560}}>
        <h3 style={{color: "var(--ink)"}}><i className="ti ti-file-spreadsheet" aria-hidden="true" style={{color: "var(--accent)"}}></i>Importar planos por planilha</h3>
        <p>
          Arquivo .xlsx com duas colunas: <strong>Modelo</strong> e <strong>Valor</strong>.
          A primeira linha deve ser o cabeçalho.
        </p>

        {!rows && (
          <div
            className="import-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
          >
            <i className="ti ti-upload" aria-hidden="true"></i>
            <p>Clique para escolher o arquivo ou arraste aqui</p>
            <span>.xlsx</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{display: "none"}}
              onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {parseError && (
          <div className="import-warn">
            <i className="ti ti-alert-triangle" aria-hidden="true"></i>
            <span>{parseError}</span>
          </div>
        )}

        {rows && (
          <React.Fragment>
            <p className="csub" style={{margin: "4px 0 0"}}>{fileName} · {rows.length} {rows.length === 1 ? "plano encontrado" : "planos encontrados"}</p>
            <div className="import-preview-wrap">
              <table className="stock">
                <thead><tr><th>Modelo</th><th>Valor</th></tr></thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx}>
                      <td className="pname">{r.modelo}</td>
                      <td className="mono">{formatBRL(r.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="import-warn">
              <i className="ti ti-alert-triangle" aria-hidden="true"></i>
              <span>Confirmar vai <strong>substituir todos</strong> os planos já cadastrados por estes {rows.length}.</span>
            </div>
          </React.Fragment>
        )}

        <div className="row" style={{marginTop: 20}}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          {rows ? (
            <React.Fragment>
              <button className="btn" onClick={() => { setRows(null); setFileName(""); setParseError(""); }}>Trocar arquivo</button>
              <button className="btn primary" onClick={handleConfirm} disabled={saving}>
                {saving ? "Importando..." : `Substituir e importar ${rows.length}`}
              </button>
            </React.Fragment>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProductHistoryPanel({products = [], sales = [], usersById = {}}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const queryDigits = query.replace(/\D/g, "").slice(0, 15);
  const selected = queryDigits.length === 15
    ? products.find(product => product.kind === "celular" && String(product.identifier || "").replace(/\D/g, "") === queryDigits) || null
    : null;
  const imeiSuggestions = useMemo(() => {
    if (!queryDigits || selected) return [];
    const seen = new Set();
    return products.filter(product => {
      if (product.kind !== "celular") return false;
      const imei = String(product.identifier || "").replace(/\D/g, "");
      if (!imei.includes(queryDigits) || seen.has(imei)) return false;
      seen.add(imei);
      return true;
    }).slice(0, 8);
  }, [products, queryDigits, selected]);
  const selectedPassageCount = useMemo(() => {
    if (!selected) return 0;
    const identifier = String(selected.identifier || "").replace(/\D/g, "");
    if (!identifier) return 1;
    return products.filter(product => String(product.identifier || "").replace(/\D/g, "") === identifier).length;
  }, [selected, products]);

  const timeline = useMemo(() => {
    if (!selected) return [];
    const digits = value => String(value || "").replace(/\D/g, "");
    const selectedDigits = digits(selected.identifier);
    const lineageProducts = selectedDigits
      ? products.filter(product => digits(product.identifier) === selectedDigits)
      : [selected];
    const passages = [...lineageProducts].sort((a, b) => new Date(a.criadoEm || 0) - new Date(b.criadoEm || 0));
    const lineageIds = new Set(lineageProducts.map(product => product.id));
    const sameProduct = item => lineageIds.has(item.productId) || (
      selected.identifier && digits(item.productSnapshot?.identifier) === digits(selected.identifier)
    );
    const snapshotFacts = product => [
      ["IMEI / serial", product.kind === "celular" ? formatImei(product.identifier) : product.identifier],
      ["Memória", product.memoria],
      ["Cor", product.cor],
      ["Saúde da bateria", product.bateria == null ? null : `${product.bateria}%`],
      ["Com caixa", product.caixa == null ? null : product.caixa ? "Sim" : "Não"],
      ["Categoria", product.categoria],
      ["Fornecedor", product.fornecedor],
      ["Custo de entrada", formatBRL(product.custo)],
      ["Venda prevista", product.venda ? formatBRL(product.venda) : null],
      ["Observações", product.descricao],
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");
    const events = passages.map((product, passageIndex) => {
      const originSale = sales.find(sale => sale.id === product.vendaOrigemId);
      return {
        id: `entry-${product.id}`,
        at: product.criadoEm,
        type: "entry",
        title: `${passageIndex + 1}ª passagem pela loja${originSale ? " — recebido como parte de pagamento" : ""}`,
        detail: originSale
          ? `O aparelho retornou na compra de ${originSale.cliente?.nome || "cliente não informado"} · venda ${originSale.id}`
          : "Características registradas quando o aparelho entrou no domínio da loja.",
        facts: snapshotFacts(product),
        userId: product.criado_por,
      };
    });
    sales.forEach(sale => sale.itens.filter(sameProduct).forEach(item => {
      events.push({
        id: `sold-${item.id}`,
        at: sale.criadoEm,
        type: "sale",
        title: "Vendido",
        detail: `${sale.cliente?.nome || "Cliente não informado"} · ${formatBRL(item.vendaUnit)} · venda ${sale.id}`,
        facts: item.productSnapshot ? snapshotFacts(item.productSnapshot) : null,
        userId: sale.criadoPor || item.criadoPor,
      });
      if (item.status === "estornado" && item.estornadoEm) events.push({
        id: `return-${item.id}`,
        at: item.estornadoEm,
        type: "return",
        title: "Venda estornada — retornou ao estoque",
        detail: item.motivoEstorno || `Estorno da venda ${sale.id}`,
        userId: item.atualizadoPor || sale.atualizadoPor,
      });
      if (item.status === "trocado" && item.trocadoEm) events.push({
        id: `exchange-${item.id}`,
        at: item.trocadoEm,
        type: "exchange",
        title: "Substituído em uma venda",
        detail: item.motivoEstorno || `Produto devolvido na venda ${sale.id}`,
        userId: item.atualizadoPor || sale.atualizadoPor,
      });
    }));
    const currentStatus = selected.vendido ? "Vendido" : selected.ativo === false ? "Inativo" : selected.statusAprovacao === "aguardando" ? "Aguardando aprovação" : selected.incompleto ? "A completar" : "Disponível para venda";
    events.push({id: `current-${selected.id}`, at: null, type: "current", title: "Situação atual", detail: currentStatus});
    return events.sort((a, b) => {
      if (!a.at) return 1;
      if (!b.at) return -1;
      return new Date(a.at) - new Date(b.at);
    });
  }, [selected, sales, products]);

  return (
    <div className="panel config-section product-history-section">
      <div className="product-history-launch"><div><h3><CalendarDays size={18} aria-hidden="true" />Histórico dos produtos</h3><p className="csub">consulte toda a trajetória de um aparelho pelo IMEI</p></div><button className="btn primary" type="button" onClick={() => setOpen(true)}><CalendarDays size={16} aria-hidden="true" />Consultar histórico</button></div>
      {open && <div className="modal-bg" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <div className="modal product-history-modal" role="dialog" aria-modal="true" aria-labelledby="product-history-title">
          <div className="product-details-head"><div><h3 id="product-history-title"><CalendarDays size={18} aria-hidden="true" />Consultar histórico</h3><p>Informe os 15 dígitos do IMEI do aparelho.</p></div><button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="Fechar" title="Fechar"><X size={20} aria-hidden="true" /></button></div>
          <Field label="IMEI">
            <div className="history-imei-input"><input autoFocus inputMode="numeric" maxLength={18} value={formatImei(queryDigits)} onChange={event => setQuery(event.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="00-000000-000000-0" />{queryDigits && <button type="button" onClick={event => { setQuery(""); event.currentTarget.previousElementSibling?.focus(); }} aria-label="Limpar IMEI" title="Limpar IMEI"><X size={17} aria-hidden="true" /></button>}</div>
          </Field>
          {imeiSuggestions.length > 0 && <div className="product-history-suggestions">{imeiSuggestions.map(product => <button key={product.id} type="button" onClick={() => setQuery(String(product.identifier || "").replace(/\D/g, ""))}><div><strong>{productDisplayName(product)}</strong><span>{formatImei(product.identifier)}</span></div><span className="badge">Selecionar</span></button>)}</div>}
          {queryDigits.length > 0 && queryDigits.length < 15 && imeiSuggestions.length === 0 && <div className="loader-text product-history-message">Nenhum IMEI corresponde à busca.</div>}
          {queryDigits.length === 15 && !selected && <div className="empty product-history-message"><p>Nenhum histórico encontrado para este IMEI.</p></div>}
          {selected && <div className="product-history-detail">
              <div className="product-history-heading"><div><h4>{productDisplayName(selected)}</h4><span>IMEI {formatImei(selected.identifier)}</span></div><span className="badge">{selectedPassageCount} {selectedPassageCount === 1 ? "passagem" : "passagens"} · {timeline.length - 1} eventos</span></div>
              <div className="product-timeline">{timeline.map(event => {
                const user = event.userId ? usersById[event.userId] : null;
                return <details className={`product-timeline-event product-timeline-accordion ${event.type}`} key={event.id}>
                  <summary><span className="product-timeline-dot" aria-hidden="true"></span><div><div className="product-timeline-meta">{event.at ? new Date(event.at).toLocaleString("pt-BR") : "Agora"}{user ? ` · ${user.full_name || user.email}` : ""}</div><strong>{event.title}</strong></div></summary>
                  <div className="product-timeline-event-body"><p>{event.detail}</p>{event.facts?.length > 0 && <div className="product-history-facts">{event.facts.map(([label, value]) => <div key={label}><span>{label}</span><b>{String(value)}</b></div>)}</div>}</div>
                </details>;
              })}</div>
            </div>}
        </div>
      </div>}
    </div>
  );
}

function Configuracoes({companySettings, protecaoPlanos, taxasCartao, bandeiras, products, sales, usersById, onSaveCompany, onAddPlano, onUpdatePlano, onDeletePlano, onSaveTaxas, onAddBandeira, onRenameBandeira, onImportPlanos}) {
  const [taxas, setTaxas] = useState(taxasCartao);
  const [company, setCompany] = useState(companySettings);
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingTaxas, setSavingTaxas] = useState(false);
  const [toast, setToast] = useState("");

  const [novoModelo, setNovoModelo] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [editId, setEditId] = useState(null);
  const [editModelo, setEditModelo] = useState("");
  const [editValor, setEditValor] = useState("");

  const [novaBandeira, setNovaBandeira] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const [showImport, setShowImport] = useState(false);

  useEffect(() => setTaxas(taxasCartao), [taxasCartao]);
  useEffect(() => setCompany(companySettings), [companySettings]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };
  const handleCompanyLogo = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      const logoData = await companyLogoToDataUrl(file);
      setCompany(previous => ({...previous, logoData}));
      showToast("Logo carregada. Salve os dados da empresa para confirmar.");
    } catch (error) {
      showToast(error.message || "Não foi possível carregar a logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const setTaxa = (bandeira, parcela, val) => setTaxas(prev => ({
    ...prev,
    [bandeira]: {...(prev[bandeira] || {}), [parcela]: val},
  }));

  const handleSaveTaxas = async () => {
    setSavingTaxas(true);
    await onSaveTaxas(taxas);
    setSavingTaxas(false);
    showToast("Taxas salvas");
  };

  const handleAddPlano = async () => {
    if (!novoModelo.trim() || !novoValor) return;
    await onAddPlano({modelo: novoModelo.trim(), valor: novoValor});
    setNovoModelo("");
    setNovoValor("");
    showToast("Plano adicionado");
  };

  const startEdit = (p) => { setEditId(p.id); setEditModelo(p.modelo); setEditValor(p.valor); };
  const cancelEdit = () => { setEditId(null); setEditModelo(""); setEditValor(""); };
  const saveEdit = async () => {
    await onUpdatePlano(editId, {modelo: editModelo.trim(), valor: Number(editValor) || 0});
    cancelEdit();
    showToast("Plano atualizado");
  };

  const handleAddBandeira = async () => {
    if (!novaBandeira.trim()) return;
    await onAddBandeira(novaBandeira.trim());
    setNovaBandeira("");
    showToast("Bandeira adicionada");
  };

  const handleImportConfirm = async (rows) => {
    await onImportPlanos(rows);
    setShowImport(false);
    showToast(`${rows.length} planos importados`);
  };

  const startRename = (b) => { setRenameTarget(b); setRenameValue(b); };
  const saveRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === renameTarget) { setRenameTarget(null); return; }
    await onRenameBandeira(renameTarget, renameValue.trim());
    setRenameTarget(null);
    showToast("Bandeira renomeada");
  };

  return (
    <div>
      <ProductHistoryPanel products={products} sales={sales} usersById={usersById} />
      <details className="panel config-section config-accordion company-config-section">
        <summary><div><h3><Building2 size={18} aria-hidden="true" />Dados da empresa</h3><p className="csub">informações exibidas no comprovante de venda, impressão e PDF</p></div></summary>
        <div className="config-accordion-body">
        <div className="company-logo-setting">
          <div className="company-logo-preview">{company.logoData ? <img src={company.logoData} alt="Logo da empresa" /> : <span>E</span>}</div>
          <div className="company-logo-copy"><strong>Logo da empresa</strong><span>PNG, JPG ou WEBP · até 5 MB. A imagem será redimensionada automaticamente.</span><div className="company-logo-actions"><label className={"btn sm" + (uploadingLogo ? " disabled" : "")}><FileDown size={16} aria-hidden="true" />{uploadingLogo ? "Processando..." : company.logoData ? "Trocar logo" : "Selecionar logo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingLogo} onChange={handleCompanyLogo} /></label>{company.logoData && <button type="button" className="btn sm ghost" onClick={() => setCompany(previous => ({...previous, logoData: ""}))}><Trash2 size={16} aria-hidden="true" />Remover</button>}</div></div>
        </div>
        <div className="grid g2">
          <Field label="Nome fantasia" required><input value={company.nomeFantasia || ""} placeholder="Ex.: Loja Celular" onChange={event => setCompany(previous => ({...previous, nomeFantasia: event.target.value}))} /></Field>
          <Field label="Razão social"><input value={company.razaoSocial || ""} placeholder="Ex.: Loja Celular LTDA" onChange={event => setCompany(previous => ({...previous, razaoSocial: event.target.value}))} /></Field>
          <Field label="CPF / CNPJ"><input inputMode="numeric" maxLength={18} value={formatCpfCnpjInput(company.documento)} placeholder="000.000.000-00 ou 00.000.000/0000-00" onChange={event => setCompany(previous => ({...previous, documento: formatCpfCnpjInput(event.target.value)}))} /></Field>
          <Field label="Telefone"><input inputMode="tel" maxLength={15} value={formatPhoneInput(company.telefone)} placeholder="(00) 00000-0000" onChange={event => setCompany(previous => ({...previous, telefone: formatPhoneInput(event.target.value)}))} /></Field>
          <Field label="E-mail"><input type="email" value={company.email || ""} placeholder="contato@empresa.com" onChange={event => setCompany(previous => ({...previous, email: event.target.value}))} /></Field>
          <Field label="Endereço"><input value={company.endereco || ""} placeholder="Rua, número, bairro, cidade/UF" onChange={event => setCompany(previous => ({...previous, endereco: event.target.value}))} /></Field>
        </div>
        <div className="row" style={{marginTop: 16}}><button className="btn primary" type="button" disabled={savingCompany || !company.nomeFantasia?.trim()} onClick={async () => { setSavingCompany(true); try { await onSaveCompany(company); showToast("Dados da empresa salvos"); } finally { setSavingCompany(false); } }}>{savingCompany ? "Salvando..." : "Salvar dados da empresa"}</button></div>
        </div>
      </details>
      <details className="panel config-section config-accordion">
        <summary><div><h3><ShieldCheck size={18} aria-hidden="true" />Proteção Start — planos por modelo</h3><p className="csub">cadastre o valor do plano para cada modelo de aparelho</p></div></summary>
        <div className="config-accordion-body">

        <div className="grid g3" style={{alignItems: "end"}}>
          <Field label="Modelo" span2>
            <input type="text" value={novoModelo} placeholder="Ex: iPhone 13" onChange={e => setNovoModelo(e.target.value)} />
          </Field>
          <Field label="Valor do plano">
            <BRLCurrencyInput value={novoValor} onChange={setNovoValor} />
          </Field>
        </div>
        <div className="actions" style={{marginTop: 10}}>
          <button className="btn sm primary" onClick={handleAddPlano} disabled={!novoModelo.trim() || !novoValor}>
            <i className="ti ti-plus" aria-hidden="true"></i>Adicionar plano
          </button>
          <button className="btn sm" onClick={() => setShowImport(true)}>
            <i className="ti ti-file-spreadsheet" aria-hidden="true"></i>Importar planilha (.xlsx)
          </button>
        </div>

        {protecaoPlanos.length > 0 && (
          <div className="table-wrap" style={{marginTop: 18}}>
            <table className="stock">
              <thead>
                <tr><th>Modelo</th><th>Valor</th><th></th></tr>
              </thead>
              <tbody>
                {protecaoPlanos.map(p => (
                  <tr key={p.id}>
                    {editId === p.id ? (
                      <React.Fragment>
                        <td><input type="text" value={editModelo} onChange={e => setEditModelo(e.target.value)} style={{width: "100%", background: "var(--bg-elev2)", border: "0.5px solid var(--line-strong)", borderRadius: 6, color: "var(--ink)", padding: "6px 8px", fontSize: 13}} /></td>
                        <td className="mono">
                          <div className="plan-edit-value"><BRLCurrencyInput value={editValor} onChange={setEditValor} /></div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" type="button" onClick={saveEdit} aria-label="Salvar" title="Salvar"><Check size={17} aria-hidden="true" /></button>
                            <button className="icon-btn" type="button" onClick={cancelEdit} aria-label="Cancelar" title="Cancelar"><X size={17} aria-hidden="true" /></button>
                          </div>
                        </td>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <td className="pname">{p.modelo}</td>
                        <td className="mono">{formatBRL(p.valor)}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" type="button" onClick={() => startEdit(p)} aria-label="Editar plano" title="Editar plano"><Pencil size={17} aria-hidden="true" /></button>
                            <button className="icon-btn danger" type="button" onClick={() => onDeletePlano(p.id)} aria-label="Remover plano" title="Remover plano"><Trash2 size={17} aria-hidden="true" /></button>
                          </div>
                        </td>
                      </React.Fragment>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </details>

      <details className="panel config-section config-accordion" style={{marginTop: 16}}>
        <summary><div><h3><CreditCard size={18} aria-hidden="true" />Bandeiras de cartão</h3><p className="csub">renomeie uma bandeira existente ou adicione uma nova</p></div></summary>
        <div className="config-accordion-body">

        <div className="chips">
          {bandeiras.map(b => (
            renameTarget === b ? (
              <input
                key={b}
                className="chip-input"
                value={renameValue}
                autoFocus
                onChange={e => setRenameValue(e.target.value)}
                onBlur={saveRename}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveRename(); } if (e.key === "Escape") setRenameTarget(null); }}
              />
            ) : (
              <button type="button" key={b} className="chip" onClick={() => startRename(b)} title="Clique para renomear">
                {b}<i className="ti ti-edit" aria-hidden="true" style={{fontSize: 11, marginLeft: 6, opacity: 0.6}}></i>
              </button>
            )
          ))}
        </div>

        <div className="pay-amount-row" style={{marginTop: 14, maxWidth: 320}}>
          <input type="text" value={novaBandeira} placeholder="Nova bandeira (ex: PagBank)" onChange={e => setNovaBandeira(e.target.value)} style={{flex: 1, background: "var(--bg-elev2)", border: "0.5px solid var(--line-strong)", borderRadius: 8, color: "var(--ink)", padding: "9px 12px", fontSize: 13.5}} />
          <button className="btn sm" onClick={handleAddBandeira} disabled={!novaBandeira.trim()}>
            <i className="ti ti-plus" aria-hidden="true"></i>Adicionar
          </button>
        </div>
        </div>
      </details>

      <details className="panel config-section config-accordion" style={{marginTop: 16, marginBottom: 0}}>
        <summary><div><h3><Percent size={18} aria-hidden="true" />Taxas de cartão de crédito</h3><p className="csub">% repassado ao cliente, por bandeira e parcela</p></div></summary>
        <div className="config-accordion-body">
        <div className="taxa-table-wrap">
          <table className="taxa">
            <thead>
              <tr>
                <th>Bandeira</th>
                {Array.from({length: PARCELAS_MAX}, (_, i) => i + 1).map(n => <th key={n}>{n}x</th>)}
              </tr>
            </thead>
            <tbody>
              {bandeiras.map(b => (
                <tr key={b}>
                  <td>{b}</td>
                  {Array.from({length: PARCELAS_MAX}, (_, i) => i + 1).map(n => (
                    <td key={n}>
                      <input
                        type="number" min="0" step="0.1"
                        value={(taxas[b] && taxas[b][n]) || ""}
                        placeholder="0"
                        onChange={e => setTaxa(b, n, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="save-bar">
          <button className="btn primary" onClick={handleSaveTaxas} disabled={savingTaxas}>
            {savingTaxas ? "Salvando..." : <React.Fragment><i className="ti ti-check" aria-hidden="true"></i>Salvar taxas</React.Fragment>}
          </button>
        </div>
        </div>
      </details>

      {toast && (
        <div className="toast"><i className="ti ti-circle-check" aria-hidden="true"></i>{toast}</div>
      )}

      {showImport && (
        <ImportPlanosModal onConfirm={handleImportConfirm} onCancel={() => setShowImport(false)} />
      )}
    </div>
  );
}

function LoginScreen({onAuthenticated}) {
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "login";
    const preferred = window.localStorage.getItem("estoque_auth_mode");
    window.localStorage.removeItem("estoque_auth_mode");
    return preferred === "register" ? "register" : "login";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [companyBrand, setCompanyBrand] = useState(() => {
    if (typeof window === "undefined") return {nomeFantasia: "", logoData: ""};
    try {
      return JSON.parse(window.localStorage.getItem(COMPANY_BRAND_CACHE_KEY)) || {nomeFantasia: "", logoData: ""};
    } catch (_error) {
      return {nomeFantasia: "", logoData: ""};
    }
  });

  useEffect(() => {
    if (!SUPABASE_READY) return undefined;
    let active = true;
    const loadCompanyBrand = async () => {
      const {data, error: companyError} = await supabaseClient
        .from("configuracoes_empresa")
        .select("nome_fantasia, logo_data")
        .eq("id", 1)
        .maybeSingle();
      if (!active || companyError || !data) return;
      const brand = {nomeFantasia: data.nome_fantasia || "", logoData: data.logo_data || ""};
      setCompanyBrand(brand);
      try { window.localStorage.setItem(COMPANY_BRAND_CACHE_KEY, JSON.stringify(brand)); } catch (_error) {}
    };
    loadCompanyBrand();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadBootstrapStatus = async () => {
      if (!SUPABASE_READY) {
        if (active) {
          setAllowRegistration(false);
          setCheckingRegistration(false);
          setMode("login");
        }
        return;
      }
      try {
        const response = await fetch(BOOTSTRAP_STATUS_URL, {cache: "no-store"});
        const payload = await response.json();
        if (!active) return;
        const canRegister = Boolean(payload.allowRegistration);
        setAllowRegistration(canRegister);
        if (!canRegister) setMode("login");
      } catch (_err) {
        if (active) {
          setAllowRegistration(false);
          setMode("login");
        }
      } finally {
        if (active) setCheckingRegistration(false);
      }
    };
    loadBootstrapStatus();
    return () => { active = false; };
  }, []);

  const isRegister = mode === "register" && allowRegistration;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!SUPABASE_READY) {
      setError("Configure o Supabase no .env.local para usar login.");
      return;
    }
    if (mode === "register" && !allowRegistration) {
      setMode("login");
      setError("Cadastro pela tela de login está disponível apenas para o primeiro usuário.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Informe email e senha.");
      return;
    }
    if (isRegister && password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        const result = await signUpUser({email: email.trim(), password, fullName: fullName.trim()});
        if (result.session) onAuthenticated(result.session);
        else {
          setMessage("Usuário criado. Se o Supabase pedir confirmação por email, confirme antes de entrar.");
          setMode("login");
        }
      } else {
        const result = await signInUser({email: email.trim(), password});
        onAuthenticated(result.session);
      }
    } catch (err) {
      setError(err.message || "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand auth-brand">
          <div className={"brand-mark auth-brand-mark" + (companyBrand.logoData ? " has-logo" : "")}>
            {companyBrand.logoData ? <img src={companyBrand.logoData} alt={`Logo ${companyBrand.nomeFantasia || "da empresa"}`} /> : "E"}
          </div>
          <div className="brand-text">
            <h1>{companyBrand.nomeFantasia || "Cadastro de Estoque"}</h1>
          </div>
        </div>

        {isRegister && (
          <Field label="Nome">
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome do usuário" />
          </Field>
        )}
        <Field label="Email" required>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com" autoComplete="email" />
        </Field>
        <Field label="Senha" required>
          <div className="password-row auth-password-row">
            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete={isRegister ? "new-password" : "current-password"} />
            <button className="icon-btn password-action" type="button" onClick={() => setShowPassword(value => !value)} title={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </Field>

        {error && <div className="auth-alert danger">{error}</div>}
        {message && <div className="auth-alert ok">{message}</div>}

        <button className="btn primary auth-submit" type="submit" disabled={loading}>
          {loading ? "Aguarde..." : (isRegister ? "Criar usuário" : "Entrar")}
        </button>
        {(isRegister || (!checkingRegistration && allowRegistration)) && (
          <button
            className="auth-mode-switch"
            type="button"
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setError("");
              setMessage("");
            }}
          >
            {isRegister ? "Já possui acesso? Entrar" : "Ainda não possui acesso? Cadastrar"}
          </button>
        )}
      </form>
    </div>
  );
}

function AddUserModal({form, setForm, creating, error, onConfirm, onCancel, currentProfile}) {
  const [copiedPassword, setCopiedPassword] = useState(false);

  const copyPassword = async () => {
    if (!form.password) return;
    try {
      await navigator.clipboard.writeText(form.password);
      setCopiedPassword(true);
      toast.success("Senha copiada");
      window.setTimeout(() => setCopiedPassword(false), 1600);
    } catch (err) {
      toast.error("Não foi possível copiar a senha.");
    }
  };
  const roleOptions = userRoleOptionsFor(currentProfile);

  return (
    <div className="modal-bg">
      <form className="modal user-modal" onSubmit={onConfirm}>
        <h3><i className="ti ti-user-plus" aria-hidden="true"></i>Adicionar usuário</h3>
        <p>Crie o acesso e defina o nível inicial do usuário.</p>
        <div className="grid">
          <Field label="Nome" span2>
            <input type="text" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Nome do usuário" autoFocus />
          </Field>
          <Field label="Email" required>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="usuario@empresa.com" />
          </Field>
          <Field label="Senha" required>
            <div className="password-row">
              <input type="text" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Mínimo 6 caracteres" />
              <button className="icon-btn password-action" type="button" onClick={copyPassword} title="Copiar senha" aria-label="Copiar senha">
                {copiedPassword ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              </button>
            </div>
            <span className="field-hint">Senha gerada automaticamente. Copie ou edite se quiser definir outra.</span>
          </Field>
          <Field label="Nível" required span2>
            <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              {roleOptions.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </Field>
        </div>
        {error && <div className="auth-alert danger">{error}</div>}
        <div className="row">
          <button className="btn ghost" type="button" onClick={onCancel} disabled={creating}>Cancelar</button>
          <button className="btn primary" type="submit" disabled={creating}>{creating ? "Salvando..." : "Salvar usuário"}</button>
        </div>
      </form>
    </div>
  );
}

function UserManagement({currentProfile}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(() => newUserForm());

  const resetForm = () => setForm(newUserForm(currentProfile));

  const loadUsers = async () => {
    if (!SUPABASE_READY || !canManageUsers(currentProfile)) return;
    setLoading(true);
    setError("");
    const {data, error: fetchError} = await supabaseClient
      .from("user_profiles")
      .select("*")
      .order("created_at", {ascending: false});
    if (fetchError) setError(fetchError.message);
    else setUsers((data || []).filter(user => canSeeUserProfile(user, currentProfile)));
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [currentProfile?.role]);

  const updateRole = async (userId, role) => {
    setSavingId(userId);
    setError("");
    const {error: updateError} = await supabaseClient
      .from("user_profiles")
      .update({role})
      .eq("id", userId);
    if (updateError) setError(updateError.message);
    await loadUsers();
    setSavingId(null);
  };

  const openCreate = () => {
    resetForm();
    setCreateError("");
    setSuccess("");
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setShowCreate(false);
    setCreateError("");
  };

  const createUser = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setSuccess("");
    try {
      const {data: sessionData} = await supabaseClient.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar usuário.");
      setSuccess("Usuário criado com sucesso.");
      resetForm();
      setShowCreate(false);
      await loadUsers();
    } catch (err) {
      setCreateError(err.message || "Não foi possível criar usuário.");
    } finally {
      setCreating(false);
    }
  };

  if (!canManageUsers(currentProfile)) {
    return (
      <div className="panel user-panel">
        <div className="panel-head">
          <h2><i className="ti ti-users" aria-hidden="true"></i>Usuários</h2>
          <span className="sub">somente administradores</span>
        </div>
        <p className="muted">Seu nível não permite gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="users-layout">
      <div className="panel user-panel">
        <div className="panel-head">
          <h2><i className="ti ti-users" aria-hidden="true"></i>Usuários</h2>
          <button className="btn primary sm" type="button" onClick={openCreate}><i className="ti ti-user-plus" aria-hidden="true"></i>Adicionar usuário</button>
        </div>
        {error && <div className="auth-alert danger">{error}</div>}
        {success && <div className="auth-alert ok">{success}</div>}
        {loading ? (
          <p className="muted">Carregando usuários...</p>
        ) : (
          <div className="user-table">
            {users.map(user => (
              <div className="user-row" key={user.id}>
                <div>
                  <strong>{user.full_name || user.email}</strong>
                  <span>{user.email}</span>
                </div>
                {user.id === currentProfile.id ? (
                  <span className="role-badge">{ROLE_LABELS[normalizeRole(user.role)]}</span>
                ) : (
                  <select
                    className="role-badge role-badge-select"
                    value={normalizeRole(user.role)}
                    onChange={e => updateRole(user.id, e.target.value)}
                    disabled={savingId === user.id}
                    aria-label={`Nível de acesso de ${user.full_name || user.email}`}
                  >
                    {userRoleOptionsFor(currentProfile).map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <AddUserModal
          currentProfile={currentProfile}
          form={form}
          setForm={setForm}
          creating={creating}
          error={createError}
          onConfirm={createUser}
          onCancel={closeCreate}
        />
      )}
    </div>
  );
}
/* =========================================================================
   APP
   ========================================================================= */

function EstoqueApp() {
  const [tab, setTab] = useState("pdv");
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [acessorioCategorias, setAcessorioCategorias] = useState([]);
  const [fabricantes, setFabricantes] = useState(FABRICANTES_PADRAO);
  const [sales, setSales] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [protecaoPlanos, setProtecaoPlanos] = useState(PROTECAO_PADRAO);
  const [bandeiras, setBandeiras] = useState(BANDEIRAS_PADRAO);
  const [taxasCartao, setTaxasCartao] = useState({});
  const [companySettings, setCompanySettings] = useState({nomeFantasia: "", razaoSocial: "", documento: "", telefone: "", email: "", endereco: ""});
  const [userProfiles, setUserProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");

  const load = async () => {
    const [p, s, c, fabs, v, cli, planos, band, taxas, users, company] = await Promise.all([
      db.listProducts(), db.listSuppliers(), db.listAcessorioCategorias(), db.listFabricantes(), db.listSales(),
      db.listClientes(), db.listProtecaoPlanos(), db.listBandeiras(), db.getTaxasCartao(), db.listUserProfiles(), db.getCompanySettings(),
    ]);
    setProducts(p);
    setSuppliers(s);
    setAcessorioCategorias(c);
    setFabricantes(mergeFabricantes(fabs, p));
    setSales(v);
    setClientes(cli);
    setProtecaoPlanos(planos);
    setBandeiras(band);
    setTaxasCartao(taxas);
    setUserProfiles(users);
    setCompanySettings(company);
    try {
      window.localStorage.setItem(COMPANY_BRAND_CACHE_KEY, JSON.stringify({nomeFantasia: company.nomeFantasia || "", logoData: company.logoData || ""}));
    } catch (_error) {}
    setLoading(false);
  };

  const enterSupabaseMode = async () => {
    const currentSession = await getCurrentSession();
    if (currentSession?.user && isSessionExpired(currentSession.user.id)) {
      await signOutUser();
      clearSessionExpiration();
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    if (currentSession?.user) startSessionExpiration(currentSession.user.id);
    setSession(currentSession);
    if (currentSession?.user) {
      const userProfile = await getUserProfile(currentSession.user.id);
      setActiveProfile(userProfile);
      setProfile(userProfile);
      await load();
      if (window.location.hash.includes("access_token")) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    } else {
      setActiveProfile(null);
      setProfile(null);
      setLoading(false);
    }
  };

  const chooseStorageMode = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      if (!SUPABASE_READY) throw new Error("Configure as credenciais do Supabase para usar o sistema.");
      if (!(await canUseSupabaseNow())) throw new Error("Nao foi possivel conectar ao Supabase. Verifique sua internet e tente novamente.");
      await enterSupabaseMode();
    } catch (err) {
      setAuthError(err.message || "Erro ao carregar sessao.");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      if (!mounted) return;
      clearLegacyBusinessStorage();
      await chooseStorageMode();
    };

    boot();

    const handleOffline = () => {
      if (!mounted) return;
      toast.error("Sem conexao com o Supabase. Nenhum dado sera salvo ate a conexao voltar.");
    };

    const handleOnline = async () => {
      if (!mounted) return;
      await chooseStorageMode();
      if (browserIsOnline() && SUPABASE_READY) toast.success("Conexao restaurada. Usando Supabase.");
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (!SUPABASE_READY) {
      return () => {
        mounted = false;
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener("online", handleOnline);
      };
    }

    const {data: listener} = supabaseClient.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted || !(await canUseSupabaseNow())) return;
      try {
        setAuthError("");
        if (event === "SIGNED_OUT") clearSessionExpiration();
        if (nextSession?.user && isSessionExpired(nextSession.user.id)) {
          await signOutUser();
          clearSessionExpiration();
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        if (nextSession?.user) startSessionExpiration(nextSession.user.id);
        setSession(nextSession);
        if (nextSession?.user) {
          const userProfile = await getUserProfile(nextSession.user.id);
          setActiveProfile(userProfile);
          setProfile(userProfile);
          await load();
          if (window.location.hash.includes("access_token")) {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        } else {
          setActiveProfile(null);
          setProfile(null);
          setLoading(false);
        }
      } catch (err) {
        setAuthError(err.message || "Erro ao confirmar acesso.");
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      listener?.subscription?.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!profile?.role || canUseTab(profile.role, tab)) return;
    setTab(allowedTabsForRole(profile.role)[0]);
  }, [profile?.role, tab]);

  const handleAddSupplier = async (data) => {
    const list = await db.addSupplier(data);
    setSuppliers(list);
    const pessoas = await db.listClientes();
    setClientes(pessoas);
    toast.success("Fornecedor salvo com sucesso.");
    return list;
  };

  const handleAddAcessorioCategoria = async (name) => {
    const list = await db.addAcessorioCategoria(name);
    setAcessorioCategorias(list);
  };

  const handleAddFabricante = async (name) => {
    const list = await db.addFabricante(name);
    setFabricantes(mergeFabricantes(list, products));
    return list;
  };

  const handleDeleteFabricante = async (name) => {
    if (products.some(product => String(product.fabricante || "").toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      toast.error("Esse fabricante está em uso e não pode ser excluído.");
      return;
    }
    const list = await db.deleteFabricante(name);
    setFabricantes(mergeFabricantes(list, products));
    toast.success("Fabricante excluído.");
  };

  const handleSaved = (product) => {
    setProducts(prev => [product, ...prev]);
  };

  const handleDelete = async (id) => {
    await db.deleteProduct(id);
    const list = await db.listProducts();
    setProducts(list);
  };

  const handleRestore = async (id) => {
    await db.restoreProduct(id);
    const list = await db.listProducts();
    setProducts(list);
    toast.success("Produto reativado.");
  };

  const handleReviewTradeIn = async (id, approved) => {
    await db.reviewTradeIn(id, approved);
    const list = await db.listProducts();
    setProducts(list);
    toast.success(approved ? "Aparelho aprovado no estoque." : "Aparelho recusado e inativado.");
  };

  const handleUpdateProduct = async (id, patch) => {
    const updated = await db.updateProduct(id, patch);
    setProducts(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleSaleComplete = async (updatedProducts) => {
    setProducts(updatedProducts);
    const [v, cli] = await Promise.all([db.listSales(), db.listClientes()]);
    setSales(v);
    setClientes(cli);
  };

  const handleDirectSale = async (product, price, client, payment) => {
    const customer = client || {id: null, nome: "Cliente não informado", contato: "", documento: ""};
    const feeRate = Number(payment.taxaPct) || 0;
    const feeValue = Number(price) * feeRate / 100;
    const {products: updatedProducts} = await db.finalizeSale({
      cartItems: [{
        productId: product.id,
        kind: product.kind,
        quantidade: 1,
        vendaUnit: Number(price),
        nome: productDisplayName(product),
        sub: productSubtitle(product) || product.identifier || "",
      }],
      extras: [],
      tradeIns: [],
      cliente: {id: customer.id || null, nome: customer.nome, contato: customer.contato || "", documento: customer.documento || ""},
      pagamentos: [{forma: payment.forma, valorBase: Number(price), taxaPct: feeRate, valorTaxa: feeValue, valor: Number(price) + feeValue, bandeira: payment.bandeira || null, parcelas: payment.parcelas || null}],
      total: Number(price),
    });
    await handleSaleComplete(updatedProducts);
    toast.success("Venda direta efetuada com sucesso.");
  };

  const handleEstornarItem = async (saleId, itemId, motivo) => {
    const {products: updated} = await db.estornarItemVenda(saleId, itemId, motivo);
    setProducts(updated);
    const v = await db.listSales();
    setSales(v);
  };

  const handleSaveCompany = async data => {
    const saved = await db.saveCompanySettings(data);
    setCompanySettings(saved);
    try {
      window.localStorage.setItem(COMPANY_BRAND_CACHE_KEY, JSON.stringify({nomeFantasia: saved.nomeFantasia || "", logoData: saved.logoData || ""}));
    } catch (_error) {}
    toast.success("Dados da empresa salvos.");
  };

  const handleEstornarVenda = async (saleId, motivo) => {
    const {products: updated} = await db.estornarVenda(saleId, motivo);
    setProducts(updated);
    const v = await db.listSales();
    setSales(v);
  };

  const handleTrocarItem = async (saleId, itemId, novoProductId) => {
    const {products: updated} = await db.trocarItemVenda(saleId, itemId, novoProductId);
    setProducts(updated);
    const v = await db.listSales();
    setSales(v);
  };

  const handleAddTradeIn = async (data) => {
    const product = await db.addTradeIn(data);
    setProducts(prev => [product, ...prev]);
    return product;
  };

  const handleAddCliente = async (data) => {
    const existing = clientes.find(c => c.nome.toLowerCase() === data.nome.toLowerCase() && (c.contato || "") === (data.contato || ""));
    if (existing) {
      if (!existing.cliente) {
        const updated = await db.updateCliente(existing.id, {cliente: true});
        setClientes(prev => prev.map(c => c.id === existing.id ? updated : c));
        return updated;
      }
      return existing;
    }
    const cliente = await db.addCliente({...data, cliente: true});
    setClientes(prev => [cliente, ...prev]);
    return cliente;
  };

  const handleSavePessoa = async (id, data) => {
    if (id) await db.updateCliente(id, data);
    else await db.addCliente(data);
    const [pessoas, listaFornecedores] = await Promise.all([db.listClientes(), db.listSuppliers()]);
    setClientes(pessoas);
    setSuppliers(listaFornecedores);
    toast.success("Cadastro salvo com sucesso.");
  };

  const handleAddPlano = async (data) => {
    const list = await db.addProtecaoPlano(data);
    setProtecaoPlanos(list);
  };

  const handleUpdatePlano = async (id, patch) => {
    const list = await db.updateProtecaoPlano(id, patch);
    setProtecaoPlanos(list);
  };

  const handleDeletePlano = async (id) => {
    const list = await db.deleteProtecaoPlano(id);
    setProtecaoPlanos(list);
  };

  const handleImportPlanos = async (rows) => {
    const list = await db.replaceProtecaoPlanos(rows);
    setProtecaoPlanos(list);
  };

  const handleSaveTaxas = async (values) => {
    const saved = await db.setTaxasCartao(values);
    setTaxasCartao(saved);
  };

  const handleAddBandeira = async (name) => {
    const list = await db.addBandeira(name);
    setBandeiras(list);
  };

  const handleRenameBandeira = async (oldName, newName) => {
    const {bandeiras: list, taxas} = await db.renameBandeira(oldName, newName);
    setBandeiras(list);
    setTaxasCartao(taxas);
  };

  const handleAuthenticated = async (nextSession) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      startSessionExpiration(nextSession.user.id, true);
      setSession(nextSession);
      const userProfile = await getUserProfile(nextSession.user.id);
      setActiveProfile(userProfile);
      setProfile(userProfile);
      setTab(canUseTab(userProfile.role, "pdv") ? "pdv" : allowedTabsForRole(userProfile.role)[0]);
      await load();
    } catch (err) {
      setAuthError(err.message || "Erro ao carregar usuário.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } finally {
      clearSessionExpiration();
      setSession(null);
      setActiveProfile(null);
      setProfile(null);
      setProducts([]);
      setSales([]);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    let expiring = false;

    const expireIfNeeded = async () => {
      if (expiring || !isSessionExpired(userId)) return;
      expiring = true;
      try {
        await signOutUser();
      } finally {
        clearSessionExpiration();
        setSession(null);
        setActiveProfile(null);
        setProfile(null);
        setProducts([]);
        setSales([]);
        toast.info("Sua sessão expirou. Entre novamente.");
      }
    };

    const interval = window.setInterval(expireIfNeeded, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") expireIfNeeded();
    };
    window.addEventListener("storage", expireIfNeeded);
    document.addEventListener("visibilitychange", handleVisibility);
    expireIfNeeded();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", expireIfNeeded);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session?.user?.id]);

  const currentRole = normalizeRole(profile?.role || "vendedor");
  const allowedTabs = allowedTabsForRole(currentRole);
  const usingSupabase = true;
  const connectionLabel = "Conectado";
  const connectionTitle = "Sistema conectado";

  if (authLoading) {
    return <div className="auth-shell"><div className="auth-card"><div className="loader-text">Carregando acesso...</div></div></div>;
  }

  if (authError) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-alert danger">{authError}</div>
          <button className="btn primary auth-submit" type="button" onClick={handleSignOut}>Voltar para login</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app">
      <AppHeader brandName={companySettings.nomeFantasia} logoData={companySettings.logoData} usingSupabase={usingSupabase} connectionLabel={connectionLabel} connectionTitle={connectionTitle} userName={profile?.full_name || session.user.email} userEmail={session.user.email} roleLabel={ROLE_LABELS[currentRole]} onSignOut={handleSignOut} />

      <ResponsiveNavigation
        allowedTabs={allowedTabs}
        tab={tab}
        onChange={setTab}
        usingSupabase={usingSupabase}
        counts={{products: products.length, clientes: clientes.length, sales: sales.length, fabricantes: fabricantes.length}}
      />

      <div className="nav legacy-nav" aria-hidden="true">
        {allowedTabs.includes("cadastro") && (
          <button className={tab === "cadastro" ? "active" : ""} onClick={() => setTab("cadastro")}>
            <i className="ti ti-plus" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Produto
          </button>
        )}
        {allowedTabs.includes("estoque") && (
          <button className={tab === "estoque" ? "active" : ""} onClick={() => setTab("estoque")}>
            <i className="ti ti-list" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Estoque<span className="n">{products.length}</span>
          </button>
        )}
        {allowedTabs.includes("clientes") && (
          <button className={tab === "clientes" ? "active" : ""} onClick={() => setTab("clientes")}>
            <i className="ti ti-address-book" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Clientes e fornecedores<span className="n">{clientes.length}</span>
          </button>
        )}
        {allowedTabs.includes("pdv") && (
          <button className={tab === "pdv" ? "active" : ""} onClick={() => setTab("pdv")}>
            <i className="ti ti-shopping-cart" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>PDV
          </button>
        )}
        {allowedTabs.includes("historico") && (
          <button className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>
            <i className="ti ti-receipt" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Vendas<span className="n">{sales.length}</span>
          </button>
        )}
        {usingSupabase && allowedTabs.includes("usuarios") && (
          <button className={tab === "usuarios" ? "active" : ""} onClick={() => setTab("usuarios")}>
            <i className="ti ti-users" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Usuários
          </button>
        )}
        {allowedTabs.includes("config") && (
          <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>
            <i className="ti ti-settings" aria-hidden="true" style={{marginRight: 6, fontSize: 13}}></i>Configurações
          </button>
        )}
      </div>

      {loading ? null : tab === "cadastro" ? (
        <CadastroPage><CadastroForm
            suppliers={suppliers.filter(supplier => supplier.ativo !== false)}
            companySettings={companySettings}
            onSaved={handleSaved}
            onAddSupplier={handleAddSupplier}
            acessorioCategorias={acessorioCategorias}
            onAddAcessorioCategoria={handleAddAcessorioCategoria}
            fabricantes={fabricantes}
            products={products}
            onAddFabricante={handleAddFabricante}
            canUploadPhotos={usingSupabase}
          /></CadastroPage>
      ) : tab === "estoque" ? (
        <EstoquePage><Estoque
            products={products}
            usersById={Object.fromEntries(userProfiles.map(user => [user.id, user]))}
            clientes={clientes.filter(client => client.cliente && client.ativo !== false)}
            bandeiras={bandeiras}
            taxasCartao={taxasCartao}
            onAddCliente={handleAddCliente}
            onDirectSale={handleDirectSale}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onUpdate={handleUpdateProduct}
            onReviewTradeIn={handleReviewTradeIn}
            suppliers={suppliers.filter(supplier => supplier.ativo !== false)}
            onAddSupplier={handleAddSupplier}
            reload={load}
          /></EstoquePage>
      ) : tab === "clientes" ? (
        <PessoasPage pessoas={clientes} onSave={handleSavePessoa} />
      ) : tab === "pdv" ? (
        <PdvPage><PDV
            products={products.filter(product => product.ativo !== false)}
            historyProducts={products}
            clientes={clientes.filter(c => c.cliente && c.ativo !== false)}
            suppliers={suppliers.filter(supplier => supplier.ativo !== false)}
            protecaoPlanos={protecaoPlanos}
            taxasCartao={taxasCartao}
            bandeiras={bandeiras}
            onSaleComplete={handleSaleComplete}
            onAddTradeIn={handleAddTradeIn}
            onAddCliente={handleAddCliente}
          /></PdvPage>
      ) : tab === "historico" ? (
        <VendasPage><Historico
            sales={sales}
            products={products}
            clientes={clientes}
            companySettings={companySettings}
            usersById={Object.fromEntries(userProfiles.map(user => [user.id, user]))}
            reload={load}
            onEstornarVenda={handleEstornarVenda}
          /></VendasPage>
      ) : tab === "usuarios" ? (
        <UsuariosPage><UserManagement currentProfile={profile} /></UsuariosPage>
      ) : tab === "fabricantes" ? (
        <FabricantesPage fabricantes={fabricantes} products={products} onAdd={handleAddFabricante} onDelete={handleDeleteFabricante} />
      ) : (
        <ConfiguracoesPage><Configuracoes
            companySettings={companySettings}
            protecaoPlanos={protecaoPlanos}
            taxasCartao={taxasCartao}
            bandeiras={bandeiras}
            products={products}
            sales={sales}
            usersById={Object.fromEntries(userProfiles.map(user => [user.id, user]))}
            onAddPlano={handleAddPlano}
            onUpdatePlano={handleUpdatePlano}
            onDeletePlano={handleDeletePlano}
            onImportPlanos={handleImportPlanos}
            onSaveTaxas={handleSaveTaxas}
            onAddBandeira={handleAddBandeira}
            onRenameBandeira={handleRenameBandeira}
            onSaveCompany={handleSaveCompany}
          /></ConfiguracoesPage>
      )}

    </div>
  );
}
export default EstoqueApp;























