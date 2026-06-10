"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type Lead, type Search, type Stats } from "@/lib/api";
import { WhatsAppTab } from "@/components/WhatsAppTab";

// ============ Helper Functions ============

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderStars(rating: number | null): string {
  if (!rating) return "";
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}

// ============ Toast System ============

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type}`}
          onClick={() => onDismiss(toast.id)}
        >
          <span>{toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}</span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ============ Stats Panel ============

function StatsPanel({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="stats-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton--stat" />
        ))}
      </div>
    );
  }

  const items = [
    { icon: "👥", value: stats?.total_leads || 0, label: "Total Leads" },
    { icon: "🔍", value: stats?.total_searches || 0, label: "Buscas" },
    { icon: "📞", value: stats?.leads_with_phone || 0, label: "Com Telefone" },
    { icon: "📍", value: stats?.leads_with_address || 0, label: "Com Endereço" },
  ];

  return (
    <div className="stats-grid">
      {items.map((item, i) => (
        <div key={i} className="stat-card">
          <div className="stat-card__icon">{item.icon}</div>
          <div className="stat-card__value">{item.value.toLocaleString("pt-BR")}</div>
          <div className="stat-card__label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ============ Search Bar ============

function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (query: string, location: string, maxResults: number) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), location.trim(), maxResults);
    }
  };

  return (
    <div className="search-section">
      <div className="search-bar">
        <form className="search-bar__form" onSubmit={handleSubmit}>
          <div className="search-bar__input-group">
            <span className="search-bar__icon">🔍</span>
            <input
              id="search-query"
              className="search-bar__input"
              type="text"
              placeholder="Ex: Restaurantes, Dentistas, Academias..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </div>
          <div className="search-bar__input-group">
            <span className="search-bar__icon">📍</span>
            <input
              id="search-location"
              className="search-bar__input"
              type="text"
              placeholder="Cidade ou bairro..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="search-bar__options">
            <select
              id="search-max-results"
              className="search-bar__select"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            id="search-submit"
            className="search-bar__btn"
            type="submit"
            disabled={loading || !query.trim()}
          >
            <span>
              {loading ? (
                <>
                  <span className="spinner" /> Buscando...
                </>
              ) : (
                "🚀 Buscar Leads"
              )}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ============ Lead Card ============

function LeadCard({
  lead,
  onDelete,
  onToggleContacted,
  onToast,
}: {
  lead: Lead;
  onDelete: (id: string) => void;
  onToggleContacted: (id: string, contacted: boolean) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [selectedAction, setSelectedAction] = useState<"api_text" | "api_audio">("api_text");

  const copyPhone = () => {
    if (lead.phone) {
      navigator.clipboard.writeText(lead.phone);
      onToast("Telefone copiado para a área de transferência!", "success");
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOptionClick = async (action: "web" | "api_text" | "api_audio") => {
    setShowMenu(false);
    if (!lead.phone) return;
    try {
      setGenerating(true);
      onToast("Gerando mensagem personalizada com IA...", "info");
      const res = await api.generateLeadMessage(lead.id);
      
      if (action === "web") {
        onToggleContacted(lead.id, true);
        const waUrl = `https://api.whatsapp.com/send?phone=${res.phone}&text=${encodeURIComponent(res.message)}`;
        window.open(waUrl, "_blank");
        onToast("WhatsApp Web aberto!", "success");
        setGenerating(false);
        return;
      }
      
      const sets = await api.getWhatsAppSettings();
      const autoApprove = sets?.auto_approve_messages;

      if (autoApprove) {
        if (action === "api_text") {
          onToast("Enviando mensagem de texto...", "info");
          await api.sendMessage(lead.id, res.message);
          onToggleContacted(lead.id, true);
          onToast("Mensagem de texto enviada pelo WhatsApp!", "success");
        } else if (action === "api_audio") {
          onToast("Sintetizando áudio e enviando...", "info");
          await api.sendWhatsAppAudio(lead.id, res.message);
          onToggleContacted(lead.id, true);
          onToast("Mensagem de áudio enviada pelo WhatsApp!", "success");
        }
        setGenerating(false);
      } else {
        setGeneratedText(res.message);
        setSelectedAction(action);
        setApprovalModal(true);
        setGenerating(false);
      }
    } catch (err: any) {
      onToast(err.message || "Erro ao processar envio.", "error");
      setGenerating(false);
    }
  };

  const handleConfirmSend = async () => {
    setApprovalModal(false);
    try {
      setGenerating(true);
      if (selectedAction === "api_text") {
        onToast("Enviando mensagem de texto...", "info");
        await api.sendMessage(lead.id, generatedText);
        onToggleContacted(lead.id, true);
        onToast("Mensagem de texto enviada pelo WhatsApp!", "success");
      } else if (selectedAction === "api_audio") {
        onToast("Sintetizando áudio e enviando...", "info");
        await api.sendWhatsAppAudio(lead.id, generatedText);
        onToggleContacted(lead.id, true);
        onToast("Mensagem de áudio enviada pelo WhatsApp!", "success");
      }
    } catch (err: any) {
      onToast(err.message || "Erro ao enviar mensagem.", "error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="lead-card">
      <div className="lead-card__header">
        <h3 className="lead-card__name">{lead.name}</h3>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          {lead.category && (
            <span className="lead-card__category">{lead.category}</span>
          )}
          <span className={`lead-card__contacted ${lead.contacted ? "lead-card__contacted--yes" : "lead-card__contacted--no"}`}>
            {lead.contacted ? "💬 Enviado" : "⏳ Pendente"}
          </span>
        </div>
      </div>

      <div className="lead-card__details">
        {lead.phone && (
          <div className="lead-card__detail" onClick={copyPhone} style={{ cursor: "pointer" }}>
            <span className="lead-card__detail-icon">📞</span>
            <span className="lead-card__detail-value lead-card__detail-value--phone">
              {lead.phone}
            </span>
          </div>
        )}
        {lead.address && (
          <div className="lead-card__detail">
            <span className="lead-card__detail-icon">📍</span>
            <span className="lead-card__detail-value">{lead.address}</span>
          </div>
        )}
        {lead.website && (
          <div className="lead-card__detail">
            <span className="lead-card__detail-icon">🌐</span>
            <a
              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lead-card__detail-value"
            >
              {lead.website}
            </a>
          </div>
        )}
      </div>

      <div className="lead-card__footer">
        <div className="lead-card__rating">
          {lead.rating && (
            <>
              <span className="lead-card__rating-stars">{renderStars(lead.rating)}</span>
              <span className="lead-card__rating-value">{lead.rating}</span>
              {lead.reviews_count && (
                <span className="lead-card__rating-count">
                  ({lead.reviews_count.toLocaleString("pt-BR")})
                </span>
              )}
            </>
          )}
        </div>
        <div className="lead-card__actions">
          {lead.google_maps_url && (
            <a
              href={lead.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="lead-card__action-btn lead-card__action-btn--maps"
            >
              🗺️ Maps
            </a>
          )}
          {lead.phone && (
            <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
              <button 
                className="lead-card__action-btn"
                onClick={() => setShowMenu(!showMenu)}
                disabled={generating}
                style={{
                  background: "rgba(37, 211, 102, 0.1)",
                  borderColor: "rgba(37, 211, 102, 0.3)",
                  color: "#25D366",
                  fontWeight: 600
                }}
              >
                {generating ? "⏳ IA..." : "💬 WhatsApp ▾"}
              </button>
              
              {showMenu && (
                <div style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "0",
                  marginBottom: "8px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: "200px",
                  overflow: "hidden",
                  backdropFilter: "blur(20px)"
                }}>
                  <button
                    onClick={() => handleOptionClick("web")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-primary)",
                      padding: "10px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "var(--font-size-sm)",
                      transition: "background var(--transition-fast)"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-strong)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    🌐 WhatsApp Web
                  </button>
                  <button
                    onClick={() => handleOptionClick("api_text")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-primary)",
                      padding: "10px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "var(--font-size-sm)",
                      transition: "background var(--transition-fast)",
                      borderTop: "1px solid var(--border)"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-strong)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    📲 Texto Direto (API)
                  </button>
                  <button
                    onClick={() => handleOptionClick("api_audio")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-primary)",
                      padding: "10px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "var(--font-size-sm)",
                      transition: "background var(--transition-fast)",
                      borderTop: "1px solid var(--border)"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-glass-strong)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    🎙️ Áudio de Voz (IA)
                  </button>
                </div>
              )}
            </div>
          )}
          {lead.phone && (
            <button className="lead-card__action-btn" onClick={copyPhone}>
              📋 Copiar
            </button>
          )}
          <button
            className={`lead-card__action-btn ${lead.contacted ? "lead-card__action-btn--success" : ""}`}
            onClick={() => onToggleContacted(lead.id, !lead.contacted)}
            title={lead.contacted ? "Marcar como pendente" : "Marcar como enviado"}
          >
            {lead.contacted ? "✅ Enviado" : "💬 Marcar"}
          </button>
          <button
            className="lead-card__action-btn lead-card__action-btn--danger"
            onClick={() => onDelete(lead.id)}
          >
            🗑️
          </button>
        </div>
      </div>

      {approvalModal && (
        <div className="modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex",
          alignItems: "center", justifyContent: "center"
        }}>
          <div className="card" style={{ padding: "2rem", width: "90%", maxWidth: "500px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3>Revisar Mensagem ({selectedAction === "api_audio" ? "Áudio" : "Texto"})</h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
              Edite a mensagem abaixo se necessário antes de enviar.
            </p>
            <textarea
              className="search-bar__input"
              style={{ minHeight: "150px", resize: "vertical" }}
              value={generatedText}
              onChange={(e) => setGeneratedText(e.target.value)}
            />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}
                onClick={() => setApprovalModal(false)}
              >
                Cancelar
              </button>
              <button 
                className="search-bar__btn" 
                onClick={handleConfirmSend}
              >
                Confirmar e Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Leads List ============

function LeadsList({
  leads,
  loading,
  onDeleteLead,
  onToggleContacted,
  onToast,
}: {
  leads: Lead[];
  loading: boolean;
  onDeleteLead: (id: string) => void;
  onToggleContacted: (id: string, contacted: boolean) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}) {
  if (loading) {
    return (
      <div className="leads-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton--card" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🔍</div>
        <h3 className="empty-state__title">Nenhum lead encontrado</h3>
        <p className="empty-state__description">
          Faça uma busca acima para começar a coletar leads do Google Maps
        </p>
      </div>
    );
  }

  return (
    <div className="leads-grid">
      {leads.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onDelete={onDeleteLead}
          onToggleContacted={onToggleContacted}
          onToast={onToast}
        />
      ))}
    </div>
  );
}

// ============ Search History ============

function SearchHistory({
  searches,
  loading,
  onSelectSearch,
  onDeleteSearch,
  onExport,
  activeSearchId,
}: {
  searches: Search[];
  loading: boolean;
  onSelectSearch: (searchId: string) => void;
  onDeleteSearch: (searchId: string) => void;
  onExport: (searchId: string) => void;
  activeSearchId: string | null;
}) {
  if (loading) {
    return (
      <div className="history-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton--card" style={{ height: 100 }} />
        ))}
      </div>
    );
  }

  if (searches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📋</div>
        <h3 className="empty-state__title">Sem histórico</h3>
        <p className="empty-state__description">
          Suas buscas aparecerão aqui
        </p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {searches.map((search) => (
        <div
          key={search.id}
          className="history-item"
          onClick={() => onSelectSearch(search.id)}
          style={{
            borderColor: activeSearchId === search.id ? "var(--primary)" : undefined,
          }}
        >
          <div className="history-item__header">
            <span className="history-item__query">{search.query}</span>
            <span className={`history-item__status history-item__status--${search.status}`}>
              {search.status === "completed" && "✅ Concluído"}
              {search.status === "running" && "⏳ Buscando..."}
              {search.status === "pending" && "🕐 Pendente"}
              {search.status === "failed" && "❌ Falhou"}
            </span>
          </div>
          <div className="history-item__meta">
            <span>📊 {search.total_results} leads</span>
            <span>📅 {formatDate(search.created_at)}</span>
          </div>
          {search.status === "completed" && search.total_results > 0 && (
            <div className="history-item__actions">
              <button
                className="lead-card__action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(search.id);
                }}
              >
                📥 Exportar CSV
              </button>
              <button
                className="lead-card__action-btn lead-card__action-btn--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSearch(search.id);
                }}
              >
                🗑️ Excluir
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ Main Dashboard ============

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"leads" | "history" | "whatsapp">("leads");
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searches, setSearches] = useState<Search[]>([]);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [searchesLoading, setSearchesLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filterText, setFilterText] = useState("");
  const [showOnlyWithPhone, setShowOnlyWithPhone] = useState(false);
  const [showOnlyNotContacted, setShowOnlyNotContacted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    name: "",
    phone: "",
    category: "",
    address: "",
    website: "",
  });

  // Toast helpers
  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load initial data
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const data = await api.getStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to load stats", error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadSearches = useCallback(async () => {
    try {
      setSearchesLoading(true);
      const data = await api.listSearches(20, 0);
      setSearches(data.searches);
    } catch (error) {
      console.error("Failed to load searches", error);
    } finally {
      setSearchesLoading(false);
    }
  }, []);

  const loadLeads = useCallback(
    async (searchId?: string, filter?: string) => {
      try {
        setLeadsLoading(true);
        const data = await api.listLeads({
          search_id: searchId || undefined,
          limit: 100,
          search: filter || undefined,
        });
        setLeads(data.leads);
      } catch (error) {
        console.error("Failed to load leads", error);
      } finally {
        setLeadsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadStats();
    loadSearches();
    loadLeads();
  }, [loadStats, loadSearches, loadLeads]);

  // Poll for running searches
  useEffect(() => {
    const hasRunning = searches.some(
      (s) => s.status === "running" || s.status === "pending"
    );

    if (hasRunning) {
      pollRef.current = setInterval(async () => {
        await loadSearches();
        await loadStats();
        if (activeSearchId) {
          await loadLeads(activeSearchId, filterText);
        } else {
          await loadLeads(undefined, filterText);
        }
      }, 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [searches, activeSearchId, filterText, loadSearches, loadStats, loadLeads]);

  // Handlers
  const handleSearch = async (query: string, location: string, maxResults: number) => {
    try {
      setSearchLoading(true);
      const search = await api.createSearch({
        query,
        location: location || undefined,
        max_results: maxResults,
      });
      addToast(`Busca iniciada: "${search.query}"`, "success");
      setSearches((prev) => [search, ...prev]);
      setActiveSearchId(search.id);
      setActiveTab("leads");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Erro ao iniciar busca",
        "error"
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectSearch = async (searchId: string) => {
    setActiveSearchId(searchId);
    setActiveTab("leads");
    await loadLeads(searchId, filterText);
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      await api.deleteLead(leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      addToast("Lead removido", "success");
      loadStats();
    } catch {
      addToast("Erro ao remover lead", "error");
    }
  };

  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.name.trim()) {
      addToast("O nome da empresa é obrigatório.", "error");
      return;
    }
    try {
      const created = await api.createLead({
        name: newLead.name,
        phone: newLead.phone || undefined,
        address: newLead.address || undefined,
        website: newLead.website || undefined,
        category: newLead.category || undefined,
        search_id: activeSearchId || undefined,
      });
      setLeads((prev) => [created, ...prev]);
      addToast("Lead adicionado com sucesso!", "success");
      setIsAddLeadOpen(false);
      setNewLead({ name: "", phone: "", category: "", address: "", website: "" });
      loadStats();
    } catch (error: any) {
      addToast(error.message || "Erro ao adicionar lead", "error");
    }
  };

  const handleToggleContacted = async (leadId: string, contacted: boolean) => {
    try {
      await api.updateLead(leadId, { contacted });
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, contacted, contacted_at: contacted ? new Date().toISOString() : null }
            : l
        )
      );
      addToast(
        contacted ? "Lead marcado como enviado!" : "Lead marcado como pendente!",
        "success"
      );
      loadStats();
    } catch {
      addToast("Erro ao atualizar status do lead", "error");
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    try {
      await api.deleteSearch(searchId);
      setSearches((prev) => prev.filter((s) => s.id !== searchId));
      if (activeSearchId === searchId) {
        setActiveSearchId(null);
        loadLeads();
      }
      addToast("Busca removida", "success");
      loadStats();
    } catch {
      addToast("Erro ao remover busca", "error");
    }
  };

  const handleExport = (searchId: string) => {
    const url = api.getExportUrl(searchId);
    window.open(url, "_blank");
    addToast("Download do CSV iniciado", "success");
  };

  const handleClearFilter = () => {
    setActiveSearchId(null);
    setFilterText("");
    setShowOnlyWithPhone(false);
    setShowOnlyNotContacted(false);
    loadLeads();
  };

  // Filter leads client-side
  const filteredLeads = leads.filter((lead) => {
    if (showOnlyWithPhone && !lead.phone) return false;
    if (showOnlyNotContacted && lead.contacted) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return (
        lead.name.toLowerCase().includes(search) ||
        (lead.address && lead.address.toLowerCase().includes(search)) ||
        (lead.phone && lead.phone.includes(search)) ||
        (lead.category && lead.category.toLowerCase().includes(search))
      );
    }
    return true;
  });

  return (
    <div className="page-wrapper">
      <div className="container">
        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Header */}
        <header className="header">
          <div className="header__logo">
            <div className="header__icon">🎯</div>
            <div>
              <h1 className="header__title">ProspecOde</h1>
              <p className="header__subtitle">Scraper de Leads</p>
            </div>
          </div>
        </header>

        {/* Stats */}
        <StatsPanel stats={stats} loading={statsLoading} />

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} loading={searchLoading} />

        {/* Tabs */}
        <div className="tabs">
          <button
            id="tab-leads"
            className={`tab ${activeTab === "leads" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("leads")}
          >
            📋 Leads {leads.length > 0 && <span className="badge">{filteredLeads.length}</span>}
          </button>
          <button
            id="tab-history"
            className={`tab ${activeTab === "history" ? "tab--active" : ""}`}
            onClick={() => {
              setActiveTab("history");
              loadSearches();
            }}
          >
            🕐 Histórico {searches.length > 0 && <span className="badge">{searches.length}</span>}
          </button>
          <button
            id="tab-whatsapp"
            className={`tab ${activeTab === "whatsapp" ? "tab--active" : ""}`}
            onClick={() => setActiveTab("whatsapp")}
          >
            💬 Disparos
          </button>
        </div>

        {/* Content */}
        {activeTab === "leads" && (
          <>
            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="search-bar__input-group" style={{ maxWidth: 300 }}>
                <span className="search-bar__icon">🔎</span>
                <input
                  id="filter-leads"
                  className="search-bar__input"
                  type="text"
                  placeholder="Filtrar leads..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  style={{ padding: "8px 0" }}
                />
              </div>
              <button
                className={`filter-chip ${showOnlyWithPhone ? "filter-chip--active" : ""}`}
                onClick={() => setShowOnlyWithPhone(!showOnlyWithPhone)}
              >
                📞 Com telefone
              </button>
              <button
                className={`filter-chip ${showOnlyNotContacted ? "filter-chip--active" : ""}`}
                onClick={() => setShowOnlyNotContacted(!showOnlyNotContacted)}
              >
                ⏳ Não contatados
              </button>
              {(activeSearchId || filterText || showOnlyWithPhone || showOnlyNotContacted) && (
                <button className="filter-chip" onClick={handleClearFilter}>
                  ✕ Limpar filtros
                </button>
              )}
              <button
                className="filter-chip"
                onClick={() => setIsAddLeadOpen(true)}
                style={{
                  marginLeft: "auto",
                  background: "rgba(16, 185, 129, 0.1)",
                  borderColor: "rgba(16, 185, 129, 0.3)",
                  color: "#10B981",
                  fontWeight: 600
                }}
              >
                ➕ Novo Lead
              </button>
            </div>

            <LeadsList
              leads={filteredLeads}
              loading={leadsLoading}
              onDeleteLead={handleDeleteLead}
              onToggleContacted={handleToggleContacted}
              onToast={addToast}
            />

            {/* Modal de Adicionar Lead */}
            {isAddLeadOpen && (
              <div className="modal-overlay" onClick={() => setIsAddLeadOpen(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
                  <button className="modal__close" onClick={() => setIsAddLeadOpen(false)}>✕</button>
                  <h2 className="modal__title">➕ Adicionar Lead Manual</h2>
                  <form onSubmit={handleAddLeadSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "14px", color: "var(--text-secondary)" }}>Nome da Empresa *</label>
                      <input
                        className="search-bar__input"
                        type="text"
                        required
                        placeholder="Ex: Pizzaria Bella Italia"
                        value={newLead.name}
                        onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "14px", color: "var(--text-secondary)" }}>Telefone (com DDD)</label>
                      <input
                        className="search-bar__input"
                        type="text"
                        placeholder="Ex: 5511999999999"
                        value={newLead.phone}
                        onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "14px", color: "var(--text-secondary)" }}>Categoria</label>
                      <input
                        className="search-bar__input"
                        type="text"
                        placeholder="Ex: Restaurante, Advocacia"
                        value={newLead.category}
                        onChange={(e) => setNewLead({ ...newLead, category: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "14px", color: "var(--text-secondary)" }}>Endereço</label>
                      <input
                        className="search-bar__input"
                        type="text"
                        placeholder="Ex: Av. Paulista, 1000 - São Paulo"
                        value={newLead.address}
                        onChange={(e) => setNewLead({ ...newLead, address: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "14px", color: "var(--text-secondary)" }}>Website</label>
                      <input
                        className="search-bar__input"
                        type="text"
                        placeholder="Ex: pizzariabella.com.br"
                        value={newLead.website}
                        onChange={(e) => setNewLead({ ...newLead, website: e.target.value })}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <button className="search-bar__btn" type="submit" style={{ marginTop: "1rem", width: "100%" }}>
                      Salvar Lead
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "history" && (
          <SearchHistory
            searches={searches}
            loading={searchesLoading}
            onSelectSearch={handleSelectSearch}
            onDeleteSearch={handleDeleteSearch}
            onExport={handleExport}
            activeSearchId={activeSearchId}
          />
        )}

        {activeTab === "whatsapp" && (
          <WhatsAppTab searches={searches} onToast={addToast} />
        )}

        {/* Mobile Bottom Nav */}
        <nav className="bottom-nav">
          <button
            className={`bottom-nav__item ${activeTab === "leads" ? "bottom-nav__item--active" : ""}`}
            onClick={() => setActiveTab("leads")}
          >
            <span className="bottom-nav__icon">📋</span>
            Leads
          </button>
          <button
            className={`bottom-nav__item ${activeTab === "history" ? "bottom-nav__item--active" : ""}`}
            onClick={() => {
              setActiveTab("history");
              loadSearches();
            }}
          >
            <span className="bottom-nav__icon">🕐</span>
            Histórico
          </button>
          <button
            className={`bottom-nav__item ${activeTab === "whatsapp" ? "bottom-nav__item--active" : ""}`}
            onClick={() => setActiveTab("whatsapp")}
          >
            <span className="bottom-nav__icon">💬</span>
            Disparos
          </button>
        </nav>
      </div>
    </div>
  );
}
