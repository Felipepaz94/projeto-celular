import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fail = (message, status = 400) => NextResponse.json({error: message}, {status});

async function requireAdmin(request) {
  if (!url || !anonKey || !serviceKey) throw new Error("Configure as credenciais do Supabase.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return {error: fail("Sessão não enviada.", 401)};
  const auth = createClient(url, anonKey);
  const {data, error} = await auth.auth.getUser(token);
  if (error || !data.user) return {error: fail("Sessão inválida.", 401)};
  const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const profile = await admin.from("user_profiles").select("role").eq("id", data.user.id).single();
  if (profile.error || profile.data?.role !== "admin") return {error: fail("Apenas administradores podem gerenciar o financeiro.", 403)};
  return {admin, userId: data.user.id};
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const {searchParams} = new URL(request.url);
    const start = searchParams.get("start"), end = searchParams.get("end"), type = searchParams.get("type");
    let movementsQuery = auth.admin.from("financial_movements").select("*").order("movement_date", {ascending: false}).order("created_at", {ascending: false});
    if (start) movementsQuery = movementsQuery.gte("movement_date", start);
    if (end) movementsQuery = movementsQuery.lte("movement_date", end);
    if (type && type !== "all") movementsQuery = movementsQuery.eq("movement_type", type);
    let expensesQuery = auth.admin.from("despesas").select("*, categoria:categorias_despesas(id,nome)").order("competencia", {ascending: false});
    if (start) expensesQuery = expensesQuery.gte("competencia", start);
    if (end) expensesQuery = expensesQuery.lte("competencia", end);
    const [movements, expenses, categories] = await Promise.all([
      movementsQuery,
      expensesQuery,
      auth.admin.from("categorias_despesas").select("id,nome,ativo").eq("ativo", true).order("nome"),
    ]);
    if (movements.error) throw movements.error;
    if (expenses.error) throw expenses.error;
    if (categories.error) throw categories.error;
    return NextResponse.json({movements: movements.data || [], expenses: expenses.data || [], expenseCategories: categories.data || []});
  } catch (error) {
    return fail(error.message || "Não foi possível consultar o financeiro.", 500);
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const body = await request.json();
    if (body.resource === "expense") {
      const amount = Number(body.amount);
      if (!body.description?.trim() || !Number.isFinite(amount) || amount <= 0) return fail("Informe descrição e valor da despesa.");
      const categoryName = String(body.category || "Outros").trim() || "Outros";
      const category = await auth.admin.from("categorias_despesas").upsert({nome: categoryName, ativo: true}, {onConflict: "nome"}).select("id").single();
      if (category.error) throw category.error;
      const competence = /^\d{4}-\d{2}$/.test(body.competence || "") ? `${body.competence}-01` : body.competence;
      const paymentDate = body.paymentDate || null;
      const row = {
        descricao: body.description.trim(), categoria_id: category.data.id, competencia,
        vencimento: body.dueDate, data_pagamento: paymentDate, valor: amount,
        status: paymentDate ? "paga" : "pendente", tipo: body.expenseType === "fixa" ? "fixa" : "variavel",
        recorrente: Boolean(body.recurring), observacao: String(body.notes || "").trim() || null,
        created_by: auth.userId, updated_by: auth.userId,
      };
      if (!row.competencia || !row.vencimento) return fail("Informe competência e vencimento.");
      const result = await auth.admin.from("despesas").insert(row).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({expense: result.data}, {status: 201});
    }

    const type = body.movementType, amount = Number(body.amount);
    if (!["entrada", "despesa"].includes(type)) return fail("Tipo de movimentação inválido.");
    if (!Number.isFinite(amount) || amount <= 0) return fail("Informe um valor maior que zero.");
    const category = String(body.category || "").trim() || "Outros";
    const isCommissionDeduction = body.resource === "commission_deduction" || category === "Vale para vendedor";
    if (isCommissionDeduction && !body.sellerId) return fail("Selecione o vendedor da deducao.");
    if (category === "Vale para vendedor" && !body.sellerId) return fail("Selecione o usuário que receberá o vale.");
    let linkedUser = null;
    if (body.sellerId) {
      const userResult = await auth.admin.from("user_profiles").select("id,full_name,email").eq("id", body.sellerId).maybeSingle();
      if (userResult.error) throw userResult.error;
      if (!userResult.data) return fail("O usuário selecionado não foi encontrado.");
      linkedUser = userResult.data;
    }
    const row = {movement_type: type, category, description: String(body.description || "").trim(), amount, movement_date: body.movementDate || new Date().toISOString().slice(0, 10), seller_id: body.sellerId || null, seller_name: linkedUser ? (linkedUser.full_name || linkedUser.email) : null, notes: String(body.notes || "").trim() || null, status: "ativo", created_by: auth.userId, updated_by: auth.userId};
    row.applies_to_commission = isCommissionDeduction;
    row.deduction_type = isCommissionDeduction ? String(body.deductionType || "outro").trim() : null;
    if (!row.description) return fail("Informe a descrição.");
    const result = await auth.admin.from("financial_movements").insert(row).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({movement: result.data}, {status: 201});
  } catch (error) {
    return fail(error.message || "Não foi possível salvar o lançamento.", 500);
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const body = await request.json();
    if (!body.id || !body.paymentDate) return fail("Informe a despesa e a data de pagamento.");
    const result = await auth.admin.from("despesas").update({status: "paga", data_pagamento: body.paymentDate, updated_by: auth.userId, updated_at: new Date().toISOString()}).eq("id", body.id).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({expense: result.data});
  } catch (error) {
    return fail(error.message || "Não foi possível registrar o pagamento.", 500);
  }
}

export async function DELETE(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const {searchParams} = new URL(request.url);
    const rawId = searchParams.get("id"), isExpense = rawId?.startsWith("expense:");
    const id = isExpense ? rawId.slice("expense:".length) : rawId;
    if (!id) return fail("Lançamento não informado.");
    const resource = searchParams.get("resource");
    const result = resource === "expense" || isExpense
      ? await auth.admin.from("despesas").update({status: "cancelada", updated_by: auth.userId, updated_at: new Date().toISOString()}).eq("id", id)
      : await auth.admin.from("financial_movements").update({status: "cancelado", updated_by: auth.userId, updated_at: new Date().toISOString()}).eq("id", id);
    if (result.error) throw result.error;
    return NextResponse.json({ok: true});
  } catch (error) {
    return fail(error.message || "Não foi possível cancelar o lançamento.", 500);
  }
}
