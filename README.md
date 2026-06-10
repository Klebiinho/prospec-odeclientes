# 🎯 ProspecOde Clientes

Scraper de leads do Google Maps usando Playwright. Extrai automaticamente **nome**, **telefone**, **endereço**, **avaliação** e **website** de estabelecimentos.

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Next.js (Vercel)│────▶│ FastAPI (Render)  │────▶│  Supabase    │
│  Frontend UI     │     │ Playwright Scraper│     │  PostgreSQL  │
└─────────────────┘     └──────────────────┘     └──────────────┘
```

- **Frontend**: Next.js hospedado na Vercel (mobile-first, dark theme)
- **Backend**: Python FastAPI + Playwright hospedado no Render (Docker)
- **Database**: Supabase (PostgreSQL gratuito)

## 🚀 Setup Local

### 1. Supabase

1. Crie uma conta em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. No **SQL Editor**, execute o conteúdo de `supabase/schema.sql`
4. Copie a **Project URL** e a **Service Role Key** (Settings > API)

### 2. Backend (Python)

```bash
cd backend

# Criar ambiente virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Instalar dependências
pip install -r requirements.txt

# Instalar Playwright browsers
playwright install chromium

# Configurar variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais do Supabase

# Rodar servidor
uvicorn main:app --reload --port 8000
```

### 3. Frontend (Next.js)

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.local.example .env.local
# Edite .env.local com a URL do backend

# Rodar servidor
npm run dev
```

Acesse: http://localhost:3000

## 🌐 Deploy em Produção

### Backend no Render

1. Faça push do projeto para o GitHub
2. Acesse [render.com](https://render.com) e crie um **New Web Service**
3. Conecte seu repositório GitHub
4. Selecione **Docker** como environment
5. Configure o **Root Directory** para `backend`
6. Adicione as variáveis de ambiente:
   - `SUPABASE_URL` = sua URL do Supabase
   - `SUPABASE_KEY` = sua Service Role Key
   - `ALLOWED_ORIGINS` = URL do frontend na Vercel

### Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e importe o repositório
2. Configure o **Root Directory** para `frontend`
3. Adicione as variáveis de ambiente:
   - `NEXT_PUBLIC_SCRAPER_API_URL` = URL do backend no Render
   - `SCRAPER_API_URL` = URL do backend no Render (server-side)

## 📡 API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/search` | Iniciar nova busca |
| `GET` | `/api/search/:id` | Detalhes de uma busca |
| `GET` | `/api/searches` | Listar buscas |
| `DELETE` | `/api/search/:id` | Excluir busca |
| `GET` | `/api/leads` | Listar leads |
| `DELETE` | `/api/leads/:id` | Excluir lead |
| `GET` | `/api/export/:id` | Exportar CSV |
| `GET` | `/api/stats` | Estatísticas |

## 📱 Features

- ✅ Busca de leads no Google Maps via Playwright
- ✅ Extração de nome, telefone, endereço, website, avaliação
- ✅ Interface mobile-first com dark theme premium
- ✅ Exportação de leads em CSV
- ✅ Filtros e pesquisa de leads
- ✅ Histórico de buscas
- ✅ Estatísticas em tempo real
- ✅ Anti-detecção (stealth mode, delays aleatórios)
- ✅ Banco de dados Supabase (PostgreSQL)

## ⚠️ Aviso Legal

Este projeto é para fins educacionais. O scraping do Google Maps viola os Termos de Serviço do Google. Use com responsabilidade e respeite os limites de taxa.
