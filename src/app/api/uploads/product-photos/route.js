import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.R2_BUCKET;
const r2PublicUrl = process.env.R2_PUBLIC_URL;

function isR2Configured() {
  return Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket);
}

function jsonError(message, status = 400) {
  return NextResponse.json({error: message}, {status});
}

function safeName(name) {
  return String(name || "foto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "foto";
}

async function requireUser(request) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Sessao nao enviada.");
  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {data, error} = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessao invalida.");
  return data.user;
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

export async function GET() {
  return NextResponse.json({enabled: isR2Configured()});
}

export async function POST(request) {
  try {
    if (!isR2Configured()) return jsonError("Cloudflare R2 nao configurado.", 503);
    await requireUser(request);

    const formData = await request.formData();
    const productId = String(formData.get("productId") || "").trim();
    const files = formData.getAll("files").filter(file => file && typeof file.arrayBuffer === "function");

    if (!productId) return jsonError("Produto sem identificador.");
    if (files.length === 0) return jsonError("Nenhuma imagem enviada.");
    if (files.length > 3) return jsonError("Envie no maximo 3 imagens.");

    const client = r2Client();
    const uploads = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!String(file.type || "").startsWith("image/")) return jsonError("Envie apenas imagens.");
      const ext = safeName(file.name).split(".").pop() || "jpg";
      const key = `products/${productId}/${Date.now()}-${index + 1}-${crypto.randomUUID()}.${ext}`;
      const body = Buffer.from(await file.arrayBuffer());

      await client.send(new PutObjectCommand({
        Bucket: r2Bucket,
        Key: key,
        Body: body,
        ContentType: file.type || "application/octet-stream",
      }));

      uploads.push({
        key,
        url: r2PublicUrl ? `${r2PublicUrl.replace(/\/$/, "")}/${key}` : null,
        name: file.name,
        contentType: file.type,
        size: file.size,
        position: index,
      });
    }

    return NextResponse.json({photos: uploads});
  } catch (error) {
    return jsonError(error.message || "Nao foi possivel enviar imagens.", 400);
  }
}