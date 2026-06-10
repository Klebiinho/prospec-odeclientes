-- ============================================
-- ProspecOde Clientes - Supabase Schema
-- Google Maps Lead Scraper Database
-- ============================================

-- Tabela de buscas realizadas
CREATE TABLE IF NOT EXISTS searches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query TEXT NOT NULL,
    location TEXT,
    total_results INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de leads encontrados
CREATE TABLE IF NOT EXISTS leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    search_id UUID REFERENCES searches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    website TEXT,
    rating DECIMAL(2,1),
    reviews_count INTEGER,
    category TEXT,
    google_maps_url TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_search_id ON leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(name);
CREATE INDEX IF NOT EXISTS idx_searches_status ON searches(status);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at DESC);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para auto-update do timestamp
CREATE TRIGGER update_searches_updated_at
    BEFORE UPDATE ON searches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - desabilitado para acesso via service role
ALTER TABLE searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para acesso anônimo e autenticado (acesso total)
CREATE POLICY "Allow anonymous full access on searches" ON searches
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous full access on leads" ON leads
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- WhatsApp Integration (Evolution API)
-- ============================================

CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    global_api_key TEXT NOT NULL,
    instance_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: The following columns were added via ALTER TABLE to leads:
-- contacted BOOLEAN DEFAULT FALSE
-- contacted_at TIMESTAMPTZ

ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous full access on whatsapp_settings" ON whatsapp_settings
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous full access on message_templates" ON message_templates
    FOR ALL USING (true) WITH CHECK (true);
