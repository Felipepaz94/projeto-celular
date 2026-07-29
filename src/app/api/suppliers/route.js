import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message, status = 400) {
  return NextResponse.json({error: message}, {status});
}

function documentDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function requireAuthorizedUser(request) {
  if (!url || !anonKey || !serviceKey) throw new Error("Configure as credenciais do Supabase no .env.local.");
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return {error: fail("Sessão não enviada.", 401)};

  const authClient = createClient(url, anonKey);
  const {data, error} = await authClient.auth.getUser(token);
  if (error || !data.user) return {error: fail("Sessão inválida.", 401)};

  const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: profile, error: profileError} = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (profileError || !["admin", "vendedor"].includes(profile?.role)) {
    return {error: fail("Usuário sem permissão para cadastrar fornecedores.", 403)};
  }
  return {admin, userId: data.user.id};
}

export async function POST(request) {
  try {
    const authorization = await requireAuthorizedUser(request);
    if (authorization.error) return authorization.error;
    const {admin, userId} = authorization;
    const body = await request.json();
    const nome = String(body.nome || body.name || "").trim();
    if (!nome) return fail("Informe o nome do fornecedor.");

    const documento = String(body.documento || "").trim();
    const digits = documentDigits(documento);
    if (digits) {
      const {data: documents, error: documentError} = await admin
        .from("clientes").select("id,nome,documento").not("documento", "is", null);
      if (documentError) throw documentError;
      const duplicate = documents.find(item =>
        documentDigits(item.documento) === digits
        && String(item.nome || "").trim().toLowerCase() !== nome.toLowerCase()
      );
      if (duplicate) return fail(`CPF/CNPJ já cadastrado para ${duplicate.nome}.`, 409);
    }

    const {data: existingSupplier, error: existingSupplierError} = await admin
      .from("suppliers").select("name").ilike("name", nome).limit(1).maybeSingle();
    if (existingSupplierError) throw existingSupplierError;
    const supplierResult = existingSupplier
      ? await admin.from("suppliers").update({name: nome, ativo: true, inativado_em: null, atualizado_por: userId}).eq("name", existingSupplier.name).select("name").single()
      : await admin.from("suppliers").insert({name: nome, ativo: true, criado_por: userId, atualizado_por: userId}).select("name").single();
    const {data: supplier, error: supplierError} = supplierResult;
    if (supplierError) throw supplierError;

    const {data: existing, error: findError} = await admin
      .from("clientes").select("id,cliente").ilike("nome", nome).limit(1).maybeSingle();
    if (findError) throw findError;

    const pessoa = {
      nome,
      contato: String(body.contato || "").trim() || null,
      email: String(body.email || "").trim() || null,
      documento: documento || null,
      observacoes: String(body.observacoes || "").trim() || null,
      cliente: existing ? Boolean(existing.cliente) || Boolean(body.cliente) : Boolean(body.cliente),
      fornecedor: true,
      ativo: true,
      inativado_em: null,
      atualizado_por: userId,
    };
    if (!existing) pessoa.criado_por = userId;
    const saved = existing
      ? await admin.from("clientes").update(pessoa).eq("id", existing.id).select("*").single()
      : await admin.from("clientes").insert(pessoa).select("*").single();
    if (saved.error) throw saved.error;

    return NextResponse.json({supplier: {id: saved.data.id, name: supplier.name}, pessoa: saved.data});
  } catch (error) {
    if (error?.code === "23505") return fail("Este CPF/CNPJ já está cadastrado.", 409);
    return fail(error.message || "Não foi possível salvar o fornecedor.");
  }
}
