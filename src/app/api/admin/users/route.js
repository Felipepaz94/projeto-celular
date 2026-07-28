import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function jsonError(message, status = 400) {
  return NextResponse.json({error: message}, {status});
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "vendedor";
}

function allowedRolesFor(role) {
  return role === "admin" ? ["admin", "vendedor"] : [];
}

async function requireManager(request) {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error("Configure SUPABASE_SERVICE_ROLE_KEY no .env.local para criar usuários pelo painel.");
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Sessão não enviada.");

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {data: userData, error: userError} = await authClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Sessão inválida.");

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const {data: profile, error: profileError} = await adminClient
    .from("user_profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  if (profileError) throw new Error(profileError.message);
  const managerRole = normalizeRole(profile?.role);
  if (!allowedRolesFor(managerRole).length) throw new Error("Seu nível não permite criar usuários.");

  return {adminClient, profile: {...profile, role: managerRole}};
}

export async function POST(request) {
  try {
    const {adminClient, profile} = await requireManager(request);
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const requestedRole = normalizeRole(body.role);
    const allowed = allowedRolesFor(profile.role);
    const role = allowed.includes(requestedRole) ? requestedRole : allowed[0];

    if (!email || !password) return jsonError("Informe email e senha.");
    if (password.length < 6) return jsonError("A senha precisa ter pelo menos 6 caracteres.");

    const {data: created, error: createError} = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {full_name: fullName},
    });
    if (createError) return jsonError(createError.message, 400);

    const {error: profileError} = await adminClient.from("user_profiles").upsert({
      id: created.user.id,
      email,
      full_name: fullName || null,
      role,
    });
    if (profileError) return jsonError(profileError.message, 400);

    return NextResponse.json({user: created.user});
  } catch (error) {
    return jsonError(error.message || "Não foi possível criar usuário.", 400);
  }
}
