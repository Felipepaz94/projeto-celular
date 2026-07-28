# Cadastro de Estoque Next

Versão React com Next.js do cadastro de estoque integrado ao Supabase, para uma única operação e sem multitenancy.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Supabase

1. No Supabase, abra SQL Editor.
2. Rode o único arquivo de banco: `supabase.sql`.
3. Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

Essas variaveis usam prefixo `NEXT_PUBLIC_` porque rodam no navegador. A seguranca dos dados depende das politicas RLS do Supabase.

### Expiração da sessão

A sessão autenticada expira automaticamente após 8 horas e o usuário volta para a tela de login. Para alterar o tempo, configure no `.env.local` o valor em minutos:

```env
NEXT_PUBLIC_SESSION_EXPIRATION_MINUTES=480
```

O cabeçalho também possui o botão **Sair**, que encerra imediatamente a sessão no Supabase e remove os dados locais de autenticação.

## Deploy em VPS

Build de producao:

```bash
npm install
npm run build
npm run start
```

Para VPS, rode o app com PM2 ou systemd e coloque Nginx/Caddy na frente com HTTPS.
## PM2 na VPS

```bash
npm install
npm run build
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

Depois configure Nginx ou Caddy como proxy reverso para `http://127.0.0.1:3000`.
## Login e niveis

O `supabase.sql` também cria `user_profiles`, o trigger de perfil e as políticas RLS autenticadas.

Niveis disponiveis:

- `admin`: acesso completo e gerenciamento de usuarios.
- `vendedor`: cadastro, estoque, PDV e historico; sem configuracoes.

O primeiro usuario criado no app vira `admin` automaticamente. Os proximos usuarios entram como `vendedor`.
## Correção rápida de login

Se aparecer erro dizendo que `public.user_profiles` não existe, execute novamente o arquivo completo `supabase.sql`.

## Criar usuarios pelo painel admin

Para a aba `Usuários` criar contas sem derrubar a sessão do admin, preencha `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`. No Supabase: Project Settings > API > service_role. Nunca exponha essa chave no frontend ou no navegador.

## Fotos de produtos com Cloudflare R2

O backend ja tem a rota `POST /api/uploads/product-photos`, compativel com Cloudflare R2 via API S3.

Configure no `.env.local`:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_URL=https://cdn.seudominio.com
```

Sem essas variaveis, o botao de adicionar fotos fica desabilitado no cadastro de produto.

No Supabase, rode novamente `supabase.sql` para criar a tabela `product_photos`.
