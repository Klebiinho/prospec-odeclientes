const getApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_SCRAPER_API_URL) {
    return process.env.NEXT_PUBLIC_SCRAPER_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Default to relative path if on vercel/production, so Next.js rewrites handle it.
    // If local development, use localhost:8000
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:8000`;
    }
    return "";
  }
  return "";
};

const API_BASE = getApiBase();

interface SearchRequest {
  query: string;
  location?: string;
  max_results?: number;
}

export interface Lead {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  category: string | null;
  google_maps_url: string | null;
  created_at: string;
  search_id?: string;
  contacted?: boolean;
  contacted_at?: string | null;
}

export interface Search {
  id: string;
  query: string;
  location: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_results: number;
  error_message?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface SearchDetail {
  search: Search;
  leads: Lead[];
}

export interface Stats {
  total_leads: number;
  total_searches: number;
  leads_with_phone: number;
  leads_with_address: number;
}

export interface WhatsAppSettings {
  id?: string;
  url: string;
  global_api_key: string;
  instance_name: string;
  auto_approve_messages?: boolean;
  kokoro_voice?: string;
}

export interface WhatsAppTemplate {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface WhatsAppStatus {
  configured: boolean;
  status?: {
    instance?: {
      state: string;
    };
  };
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
      }
      throw error;
    }
  }

  // ======= Search Endpoints =======

  async createSearch(data: SearchRequest): Promise<Search> {
    return this.request<Search>('/api/search', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSearch(searchId: string): Promise<SearchDetail> {
    return this.request<SearchDetail>(`/api/search/${searchId}`);
  }

  async listSearches(limit = 20, offset = 0): Promise<{ searches: Search[]; count: number }> {
    return this.request(`/api/searches?limit=${limit}&offset=${offset}`);
  }

  async deleteSearch(searchId: string): Promise<void> {
    await this.request(`/api/search/${searchId}`, { method: 'DELETE' });
  }

  // ======= Lead Endpoints =======

  async listLeads(params?: {
    search_id?: string;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ leads: Lead[]; count: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search_id) searchParams.set('search_id', params.search_id);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.search) searchParams.set('search', params.search);

    return this.request(`/api/leads?${searchParams.toString()}`);
  }

  async deleteLead(leadId: string): Promise<void> {
    await this.request(`/api/leads/${leadId}`, { method: 'DELETE' });
  }

  async updateLead(leadId: string, data: { contacted: boolean }): Promise<Lead> {
    return this.request<Lead>(`/api/leads/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async createLead(data: {
    name: string;
    phone?: string;
    address?: string;
    website?: string;
    category?: string;
    search_id?: string;
  }): Promise<Lead> {
    return this.request<Lead>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateLeadMessage(leadId: string): Promise<{ phone: string; message: string; warning?: string }> {
    return this.request<{ phone: string; message: string; warning?: string }>(`/api/leads/${leadId}/generate-message`, {
      method: 'POST',
    });
  }


  // ======= Stats =======

  async getStats(): Promise<Stats> {
    return this.request<Stats>('/api/stats');
  }

  // ======= Export =======

  getExportUrl(searchId: string): string {
    return `${this.baseUrl}/api/export/${searchId}`;
  }

  // ======= Health =======

  async healthCheck(): Promise<{ status: string; browser_ready: boolean }> {
    return this.request('/api/health');
  }

  // ======= WhatsApp =======

  async getWhatsAppSettings(): Promise<WhatsAppSettings | null> {
    try {
      const result = await this.request<WhatsAppSettings | null>('/api/whatsapp/settings');
      return result;
    } catch {
      return null;
    }
  }

  async saveWhatsAppSettings(settings: WhatsAppSettings): Promise<WhatsAppSettings> {
    return this.request<WhatsAppSettings>('/api/whatsapp/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getWhatsAppStatus(): Promise<WhatsAppStatus> {
    return this.request<WhatsAppStatus>('/api/whatsapp/status');
  }

  async getWhatsAppQRCode(): Promise<{ qrcode?: string; error?: string }> {
    return this.request<{ qrcode?: string; error?: string }>('/api/whatsapp/qrcode');
  }

  async logoutWhatsApp(): Promise<void> {
    await this.request('/api/whatsapp/logout', { method: 'POST' });
  }

  async getTemplates(): Promise<WhatsAppTemplate[]> {
    return this.request<WhatsAppTemplate[]>('/api/whatsapp/templates');
  }

  async createTemplate(title: string, content: string): Promise<WhatsAppTemplate> {
    return this.request<WhatsAppTemplate>('/api/whatsapp/templates', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.request(`/api/whatsapp/templates/${templateId}`, { method: 'DELETE' });
  }

  async sendBulkMessages(leadIds: string[], templateId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/whatsapp/bulk-send', {
      method: 'POST',
      body: JSON.stringify({ lead_ids: leadIds, template_id: templateId }),
    });
  }

  async sendMessage(leadId: string, text: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId, text }),
    });
  }

  async sendWhatsAppAudio(leadId: string, text: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/api/whatsapp/send-audio', {
      method: 'POST',
      body: JSON.stringify({ lead_id: leadId, text }),
    });
  }
}

export const api = new ApiClient();
