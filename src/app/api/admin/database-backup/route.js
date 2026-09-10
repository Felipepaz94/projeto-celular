import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BACKUP_TABLES = [
  "suppliers", "clientes", "fabricantes", "product_types", "bandeiras_cartao",
  "configuracoes_empresa", "user_profiles", "protecao_planos", "taxas_cartao",
  "products", "product_photos", "sales", "sale_items", "sale_payments",
  "comissoes_vendedores", "comissoes_movimentos", "categorias_despesas",
  "despesas", "financial_movements",
];

function fail(message, status = 400) {
  return NextResponse.json({error: message}, {status});
}

async function requireAdmin(request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error("As credenciais administrativas do Supabase não estão configuradas.");
  }
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão não enviada.");
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: userData, error: userError} = await authClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Sessão inválida ou expirada.");
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const {data: profile, error: profileError} = await adminClient.from("user_profiles").select("id,role").eq("id", userData.user.id).single();
  if (profileError) throw new Error(profileError.message);
  if (profile?.role !== "admin") throw new Error("Somente administradores podem gerar o backup.");
  return {adminClient, user: userData.user};
}

async function readAllRows(adminClient, table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const {data, error} = await adminClient.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`Falha ao exportar ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function readAuthUsers(adminClient) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const {data, error} = await adminClient.auth.admin.listUsers({page, perPage});
    if (error) throw new Error(`Falha ao exportar usuários de acesso: ${error.message}`);
    const pageUsers = data?.users || [];
    users.push(...pageUsers.map(user => ({
      id: user.id, email: user.email || null, phone: user.phone || null,
      created_at: user.created_at, updated_at: user.updated_at,
      last_sign_in_at: user.last_sign_in_at || null,
      email_confirmed_at: user.email_confirmed_at || null,
      user_metadata: user.user_metadata || {}, app_metadata: user.app_metadata || {},
    })));
    if (pageUsers.length < perPage) break;
  }
  return users;
}

export async function GET(request) {
  try {
    const {adminClient, user} = await requireAdmin(request);
    const tables = {};
    for (const table of BACKUP_TABLES) tables[table] = await readAllRows(adminClient, table);
    const generatedAt = new Date().toISOString();
    return NextResponse.json({
      format: "start-seminovos-supabase-backup", version: 1, generatedAt,
      generatedBy: user.email || user.id, restoreOrder: BACKUP_TABLES,
      tables, authUsers: await readAuthUsers(adminClient),
      notes: [
        "O arquivo JSON é o backup completo dos dados exportados.",
        "As senhas dos usuários não são exportadas pelo Supabase Auth.",
        "Na restauração manual, respeite restoreOrder para manter os relacionamentos.",
      ],
    }, {headers: {"Cache-Control": "no-store", "Content-Disposition": `attachment; filename=backup-supabase-${generatedAt.slice(0, 10)}.json`}});
  } catch (error) {
    return fail(error.message || "Não foi possível gerar o backup.", /Somente administradores/.test(error.message || "") ? 403 : 400);
  }
}
