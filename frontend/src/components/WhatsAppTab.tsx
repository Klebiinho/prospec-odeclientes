import { useState, useEffect, useCallback } from "react";
import { api, WhatsAppSettings, WhatsAppTemplate, WhatsAppStatus, Search } from "@/lib/api";

export function WhatsAppTab({
  searches,
  onToast
}: {
  searches: Search[];
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [settings, setSettings] = useState<WhatsAppSettings>({
    url: "",
    global_api_key: "",
    instance_name: "prospec_ode",
    auto_approve_messages: false
  });
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [newTemplate, setNewTemplate] = useState({ title: "", content: "" });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const [bulkSearchId, setBulkSearchId] = useState("");
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sets, stat, tpls] = await Promise.all([
        api.getWhatsAppSettings(),
        api.getWhatsAppStatus(),
        api.getTemplates()
      ]);
      
      if (sets) setSettings(sets);
      setStatus(stat);
      setTemplates(tpls);

      // If configured but not connected, load QR code
      if (stat.configured && stat.status?.instance?.state !== "open") {
        const qr: any = await api.getWhatsAppQRCode();
        if (qr) {
          if (typeof qr.qrcode === 'string') {
            setQrCode(qr.qrcode);
          } else if (qr.qrcode && qr.qrcode.base64) {
            setQrCode(qr.qrcode.base64);
          } else if (qr.base64) {
            setQrCode(qr.base64);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll for QR/status updates if not open
    const interval = setInterval(() => {
      if (status?.configured && status?.status?.instance?.state !== "open") {
        loadData();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData, status?.configured, status?.status?.instance?.state]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      await api.saveWhatsAppSettings(settings);
      onToast("Configurações salvas!", "success");
      await loadData();
    } catch (error) {
      onToast("Erro ao salvar configurações", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logoutWhatsApp();
      onToast("Desconectado do WhatsApp", "success");
      await loadData();
    } catch {
      onToast("Erro ao desconectar", "error");
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingTemplate(true);
      await api.createTemplate(newTemplate.title, newTemplate.content);
      onToast("Template criado", "success");
      setNewTemplate({ title: "", content: "" });
      const tpls = await api.getTemplates();
      setTemplates(tpls);
    } catch {
      onToast("Erro ao criar template", "error");
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      onToast("Template excluído", "success");
    } catch {
      onToast("Erro ao excluir template", "error");
    }
  };

  const handleBulkSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkSearchId || !bulkTemplateId) {
      onToast("Selecione uma busca e um template", "error");
      return;
    }
    try {
      setSendingBulk(true);
      // Fetch all leads for this search
      const data = await api.listLeads({ search_id: bulkSearchId, limit: 1000 });
      const leadIds = data.leads.filter(l => !!l.phone && !l.contacted).map(l => l.id);
      
      if (leadIds.length === 0) {
        onToast("Nenhum lead elegível encontrado nesta busca (sem telefone ou já contatado).", "error");
        return;
      }
      
      await api.sendBulkMessages(leadIds, bulkTemplateId);
      onToast(`Disparo iniciado para ${leadIds.length} leads!`, "success");
    } catch {
      onToast("Erro ao iniciar disparos", "error");
    } finally {
      setSendingBulk(false);
    }
  };

  if (loading && !status) {
    return <div className="p-4" style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /> Carregando configurações...</div>;
  }

  const isConnected = status?.status?.instance?.state === "open";

  return (
    <div className="whatsapp-tab" style={{ display: "flex", flexDirection: "column", gap: "2rem", paddingBottom: "2rem" }}>
      
      {/* SEÇÃO 1: CONEXÃO EVOLUTION API */}
      <section className="card p-4" style={{ backgroundColor: "var(--card-bg)", borderRadius: "12px", padding: "1.5rem" }}>
        <h2>⚙️ Conexão Evolution API</h2>
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <form onSubmit={handleSaveSettings} style={{ flex: "1", minWidth: "300px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>URL da Evolution API</label>
              <input 
                className="search-bar__input" 
                type="url" 
                value={settings.url} 
                onChange={e => setSettings({...settings, url: e.target.value})} 
                placeholder="Ex: http://3.16.46.140:8080" 
                required 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>Global API Key</label>
              <input 
                className="search-bar__input" 
                type="password" 
                value={settings.global_api_key} 
                onChange={e => setSettings({...settings, global_api_key: e.target.value})} 
                required 
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>Nome da Instância</label>
              <input 
                className="search-bar__input" 
                type="text" 
                value={settings.instance_name} 
                onChange={e => setSettings({...settings, instance_name: e.target.value})} 
                required 
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input 
                type="checkbox" 
                id="auto_approve_messages"
                checked={settings.auto_approve_messages || false}
                onChange={e => setSettings({...settings, auto_approve_messages: e.target.checked})} 
                style={{ width: "20px", height: "20px" }}
              />
              <label htmlFor="auto_approve_messages" style={{ cursor: "pointer" }}>Aprovar Mensagens da IA Automaticamente</label>
            </div>
            <button className="search-bar__btn" type="submit" disabled={savingSettings}>
              {savingSettings ? "Salvando..." : "Salvar Configurações"}
            </button>
          </form>

          <div style={{ flex: "1", minWidth: "300px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "1rem" }}>
            {status?.configured ? (
              <>
                <h3 style={{ marginBottom: "1rem" }}>
                  Status: {isConnected ? <span style={{ color: "#4CAF50" }}>Conectado ✅</span> : <span style={{ color: "#FFC107" }}>Aguardando Leitura ⏳</span>}
                </h3>
                
                {isConnected ? (
                  <button className="lead-card__action-btn lead-card__action-btn--danger" onClick={handleLogout}>
                    Desconectar WhatsApp
                  </button>
                ) : (
                  qrCode ? (
                    <div style={{ textAlign: "center" }}>
                      <img src={qrCode} alt="QR Code WhatsApp" style={{ width: "250px", height: "250px", background: "white", padding: "10px", borderRadius: "8px" }} />
                      <p style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>Leia o QR Code com o seu WhatsApp</p>
                    </div>
                  ) : (
                    <p>Gerando QR Code...</p>
                  )
                )}
              </>
            ) : (
              <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Salve as configurações para gerar o QR Code de conexão.</p>
            )}
          </div>
        </div>
      </section>

      {/* SEÇÃO 2: DISPARO EM MASSA */}
      {isConnected && (
        <section className="card p-4" style={{ backgroundColor: "var(--card-bg)", borderRadius: "12px", padding: "1.5rem" }}>
          <h2>🚀 Disparo em Massa</h2>
          <form onSubmit={handleBulkSend} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>1. Selecione a Busca (Histórico)</label>
              <select className="search-bar__select" style={{ width: "100%" }} value={bulkSearchId} onChange={e => setBulkSearchId(e.target.value)} required>
                <option value="">-- Selecione --</option>
                {searches.filter(s => s.total_results > 0).map(s => (
                  <option key={s.id} value={s.id}>{s.query} ({s.total_results} leads)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>2. Selecione o Template de Mensagem</label>
              <select className="search-bar__select" style={{ width: "100%" }} value={bulkTemplateId} onChange={e => setBulkTemplateId(e.target.value)} required>
                <option value="">-- Selecione --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <button className="search-bar__btn" style={{ background: "#4CAF50", color: "white" }} type="submit" disabled={sendingBulk}>
              {sendingBulk ? "Iniciando disparos..." : "Iniciar Disparos em Massa"}
            </button>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              * As mensagens serão enviadas apenas para leads que possuam número de telefone válido e que ainda não tenham sido contatados.
            </p>
          </form>
        </section>
      )}

      {/* SEÇÃO 3: TEMPLATES */}
      <section className="card p-4" style={{ backgroundColor: "var(--card-bg)", borderRadius: "12px", padding: "1.5rem" }}>
        <h2>📝 Templates de Mensagem</h2>
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginTop: "1rem" }}>
          
          <form onSubmit={handleCreateTemplate} style={{ flex: "1", minWidth: "300px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3>Criar Novo Template</h3>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>Título Interno</label>
              <input className="search-bar__input" type="text" value={newTemplate.title} onChange={e => setNewTemplate({...newTemplate, title: e.target.value})} required placeholder="Ex: Abordagem Dentistas SP" />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>Conteúdo da Mensagem</label>
              <textarea 
                className="search-bar__input" 
                style={{ height: "120px", resize: "vertical" }}
                value={newTemplate.content} 
                onChange={e => setNewTemplate({...newTemplate, content: e.target.value})} 
                required 
                placeholder="Olá {{primeiro_nome}}, tudo bem? Vi sua empresa {{nome}} no Google Maps localizada em {{endereco}}..."
              />
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                Variáveis disponíveis: {'{{nome}}'}, {'{{primeiro_nome}}'}, {'{{endereco}}'}
              </p>
            </div>
            <button className="search-bar__btn" type="submit" disabled={creatingTemplate}>
              {creatingTemplate ? "Criando..." : "Criar Template"}
            </button>
          </form>

          <div style={{ flex: "1", minWidth: "300px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3>Meus Templates</h3>
            {templates.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>Nenhum template criado.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {templates.map(t => (
                  <div key={t.id} style={{ border: "1px solid rgba(255,255,255,0.1)", padding: "1rem", borderRadius: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <strong style={{ color: "var(--primary)" }}>{t.title}</strong>
                      <button className="lead-card__action-btn lead-card__action-btn--danger" onClick={() => handleDeleteTemplate(t.id)}>🗑️</button>
                    </div>
                    <p style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", color: "var(--text-secondary)" }}>{t.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
