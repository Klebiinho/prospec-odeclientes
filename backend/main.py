"""
ProspecOde Clientes - FastAPI Backend
Google Maps Lead Scraper API
"""

import asyncio
import csv
import io
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional, Any, cast
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import create_client, Client

from scraper import GoogleMapsScraper

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

supabase: Optional[Client] = None
scraper_instance: Optional[GoogleMapsScraper] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    global supabase, scraper_instance
    # Startup
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    else:
        logger.warning("Supabase credentials not configured!")

    scraper_instance = GoogleMapsScraper()
    await scraper_instance.start_browser()
    logger.info("Playwright browser started")

    yield

    # Shutdown
    if scraper_instance:
        await scraper_instance.close_browser()
        logger.info("Playwright browser closed")


app = FastAPI(
    title="ProspecOde Clientes API",
    description="Google Maps Lead Scraper API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Pydantic Models ============


class CreateLeadRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Lead name")
    phone: Optional[str] = Field(None, description="Phone number")
    address: Optional[str] = Field(None, description="Address")
    website: Optional[str] = Field(None, description="Website")
    category: Optional[str] = Field(None, description="Category")
    search_id: Optional[str] = Field(None, description="Associated Search ID")


class SendAudioRequest(BaseModel):
    lead_id: str
    text: str


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200, description="Search query")
    location: Optional[str] = Field(None, max_length=100, description="Location filter")
    max_results: int = Field(30, ge=5, le=100, description="Max results")


class SearchResponse(BaseModel):
    id: str
    query: str
    location: Optional[str]
    status: str
    total_results: int
    created_at: str


class LeadResponse(BaseModel):
    id: str
    name: str
    address: Optional[str]
    phone: Optional[str]
    website: Optional[str]
    rating: Optional[float]
    reviews_count: Optional[int]
    category: Optional[str]
    google_maps_url: Optional[str]
    created_at: str
    contacted: Optional[bool] = False
    contacted_at: Optional[str] = None


class UpdateLeadRequest(BaseModel):
    contacted: Optional[bool] = Field(None, description="Mark lead as contacted or not")


class SearchDetailResponse(BaseModel):
    search: SearchResponse
    leads: list[LeadResponse]


class StatsResponse(BaseModel):
    total_leads: int
    total_searches: int
    leads_with_phone: int
    leads_with_address: int


# -- WhatsApp Models --
class WhatsAppSettingsResponse(BaseModel):
    id: str
    url: str
    global_api_key: str
    instance_name: str

class WhatsAppSettingsRequest(BaseModel):
    url: str = Field(..., description="Evolution API URL")
    global_api_key: str = Field(..., description="Evolution API Global Key")
    instance_name: str = Field("prospec_ode", description="Instance Name")
    auto_approve_messages: bool = Field(False, description="Auto approve AI generated messages")

class MessageTemplateResponse(BaseModel):
    id: str
    title: str
    content: str
    created_at: str

class MessageTemplateRequest(BaseModel):
    title: str
    content: str

class SendMessageRequest(BaseModel):
    lead_id: str
    text: str

class BulkSendRequest(BaseModel):
    lead_ids: list[str]
    template_id: str


# ============ Background Task ============

from evolution_api import EvolutionAPI, format_whatsapp_number

async def run_scraping_task(search_id: str, query: str, max_results: int):
    """Background task to run the Google Maps scraper."""
    global supabase, scraper_instance
    if not supabase or not scraper_instance:
        logger.error("Supabase or Scraper not initialized.")
        return

    try:
        # Update search status to running
        supabase.table("searches").update(
            {"status": "running"}
        ).eq("id", search_id).execute()

        # Build full query
        full_query = query

        # Run scraper
        leads = await scraper_instance.search(
            query=full_query,
            max_results=max_results,
            max_scrolls=min(max_results // 5, 15),
        )

        # Save leads to Supabase
        saved_count = 0
        if leads:
            # Check existing leads to avoid duplicates
            urls = [lead.get("google_maps_url") for lead in leads if lead.get("google_maps_url")]  # type: ignore
            existing_urls = set()
            if urls:
                for i in range(0, len(urls), 100):
                    batch_urls = urls[i:i+100]
                    res = supabase.table("leads").select("google_maps_url").in_("google_maps_url", batch_urls).execute()
                    if res.data:
                        for row in res.data:
                            if isinstance(row, dict) and "google_maps_url" in row:
                                existing_urls.add(str(row["google_maps_url"]))

            lead_records = []
            for lead in leads:
                url = lead.get("google_maps_url", "")  # type: ignore
                if url and url in existing_urls:
                    continue
                if url:
                    existing_urls.add(url)
                    
                lead_records.append({
                    "search_id": search_id,
                    "name": lead.get("name", ""),  # type: ignore
                    "address": lead.get("address", ""),  # type: ignore
                    "phone": lead.get("phone", ""),  # type: ignore
                    "website": lead.get("website", ""),  # type: ignore
                    "rating": lead.get("rating"),  # type: ignore
                    "reviews_count": lead.get("reviews_count"),  # type: ignore
                    "category": lead.get("category", ""),  # type: ignore
                    "google_maps_url": url,
                })

            saved_count = len(lead_records)
            # Insert in batches of 50
            for i in range(0, len(lead_records), 50):
                batch = lead_records[i : i + 50]
                supabase.table("leads").insert(batch).execute()

        # Update search as completed
        supabase.table("searches").update(
            {
                "status": "completed",
                "total_results": saved_count,
            }
        ).eq("id", search_id).execute()

        logger.info(f"Search {search_id} completed with {saved_count} leads")

    except Exception as e:
        logger.error(f"Scraping task error for search {search_id}: {e}")
        supabase.table("searches").update(
            {
                "status": "failed",
                "error_message": str(e)[:500],
            }
        ).eq("id", search_id).execute()


async def run_bulk_send_task(lead_ids: list[str], template_content: str):
    """Background task to send bulk WhatsApp messages with delay."""
    global supabase
    if not supabase:
        return

    # Fetch settings
    settings_res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    settings_data = settings_res.data
    if not settings_data or not isinstance(settings_data, list):
        logger.error("No WhatsApp settings configured for bulk send.")
        return
    
    settings = settings_data[0]
    if not isinstance(settings, dict):
        logger.error("WhatsApp settings format is invalid.")
        return

    url = settings.get("url")  # type: ignore
    global_api_key = settings.get("global_api_key")  # type: ignore
    instance_name = settings.get("instance_name")  # type: ignore

    if not isinstance(url, str) or not isinstance(global_api_key, str) or not isinstance(instance_name, str):
        logger.error("WhatsApp settings contain invalid URL, Key or Instance name.")
        return

    api = EvolutionAPI(url, global_api_key)

    # Check connection
    status = await api.get_instance_status(instance_name)
    instance_status = status.get("instance")
    if not isinstance(instance_status, dict) or instance_status.get("state") != "open":
        logger.error("WhatsApp instance not connected for bulk send.")
        return

    for lead_id in lead_ids:
        try:
            # Get lead
            lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
            lead_data = lead_res.data
            if not lead_data or not isinstance(lead_data, list):
                continue
            
            lead = lead_data[0]
            if not isinstance(lead, dict):
                continue
                
            if lead.get("contacted"):  # type: ignore
                continue  # Skip already contacted

            phone = format_whatsapp_number(str(lead.get("phone", "")))  # type: ignore
            if not phone:
                continue

            # Format template
            name = str(lead.get("name", "amigo"))  # type: ignore
            address = str(lead.get("address", ""))  # type: ignore
            first_name = name.split()[0] if name else "amigo"
            
            text = template_content.replace("{{nome}}", name)
            text = text.replace("{{primeiro_nome}}", first_name)
            text = text.replace("{{endereco}}", address)

            # Send message
            # Using 5000ms to 15000ms delay to avoid ban
            res = await api.send_text_message(instance_name, phone, text, delay=5000)
            
            if "error" not in res:
                # Mark as contacted
                supabase.table("leads").update({
                    "contacted": True,
                    "contacted_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", lead_id).execute()
            else:
                logger.error(f"Error sending message to {phone}: {res.get('error')}")

            # Added fixed sleep interval between messages to be safe
            await asyncio.sleep(5.0)

        except Exception as e:
            logger.error(f"Error processing lead {lead_id} for bulk send: {e}")


# ============ API Endpoints ============


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "supabase_connected": supabase is not None,
        "browser_ready": scraper_instance is not None and scraper_instance.browser is not None,
    }


@app.post("/api/search", response_model=SearchResponse)
async def create_search(request: SearchRequest, background_tasks: BackgroundTasks):
    """Start a new Google Maps search."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Build the full query string
    full_query = request.query
    if request.location:
        full_query = f"{request.query} em {request.location}"

    # Create search record
    result = (
        supabase.table("searches")
        .insert(
            {
                "query": full_query,
                "location": request.location,
                "status": "pending",
                "total_results": 0,
            }
        )
        .execute()
    )

    if not result.data or not isinstance(result.data, list):
        raise HTTPException(status_code=500, detail="Failed to create search record")
    search_data = result.data[0]  # type: ignore
    if not isinstance(search_data, dict):
        raise HTTPException(status_code=500, detail="Search record has invalid format")

    # Start scraping in background
    background_tasks.add_task(
        run_scraping_task,
        search_id=str(search_data["id"]),
        query=full_query,
        max_results=request.max_results,
    )

    return SearchResponse(
        id=str(search_data["id"]),
        query=str(search_data["query"]),
        location=str(search_data["location"]) if search_data.get("location") else None,
        status=str(search_data["status"]),
        total_results=0,
        created_at=str(search_data["created_at"]),
    )


@app.get("/api/search/{search_id}", response_model=SearchDetailResponse)
async def get_search(search_id: str):
    """Get search details and its leads."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Get search
    search_result = (
        supabase.table("searches")
        .select("*")
        .eq("id", search_id)
        .execute()
    )

    search_result_data = search_result.data
    if not search_result_data or not isinstance(search_result_data, list):
        raise HTTPException(status_code=404, detail="Search not found")

    search_data = search_result_data[0]
    if not isinstance(search_data, dict):
        raise HTTPException(status_code=500, detail="Search record has invalid format")

    # Get leads
    leads_result = (
        supabase.table("leads")
        .select("*")
        .eq("search_id", search_id)
        .order("created_at", desc=False)
        .execute()
    )

    leads = []
    if isinstance(leads_result.data, list):
        for l in leads_result.data:
            if isinstance(l, dict):
                leads.append(
                    LeadResponse(
                        id=l.get("id", ""),  # type: ignore
                        name=l.get("name", ""),  # type: ignore
                        address=l.get("address"),  # type: ignore
                        phone=l.get("phone"),  # type: ignore
                        website=l.get("website"),  # type: ignore
                        rating=l.get("rating"),  # type: ignore
                        reviews_count=l.get("reviews_count"),  # type: ignore
                        category=l.get("category"),  # type: ignore
                        google_maps_url=l.get("google_maps_url"),  # type: ignore
                        created_at=l.get("created_at", ""),  # type: ignore
                        contacted=l.get("contacted", False),  # type: ignore
                        contacted_at=l.get("contacted_at"),  # type: ignore
                    )
                )

    return SearchDetailResponse(
        search=SearchResponse(
            id=str(search_data.get("id", "")),
            query=str(search_data.get("query", "")),
            location=str(search_data["location"]) if search_data.get("location") else None,
            status=str(search_data.get("status", "")),
            total_results=int(str(search_data.get("total_results", 0))),
            created_at=str(search_data.get("created_at", "")),
        ),
        leads=leads,
    )


@app.get("/api/searches")
async def list_searches(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all searches ordered by most recent."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    result = (
        supabase.table("searches")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "searches": result.data,
        "count": len(result.data),
    }

@app.post("/api/leads", response_model=LeadResponse)
async def create_lead(request: CreateLeadRequest):
    """Create a new lead manually."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    lead_data = {
        "name": request.name,
        "phone": request.phone or "",
        "address": request.address or "",
        "website": request.website or "",
        "category": request.category or "",
        "search_id": request.search_id or None,
        "contacted": False,
        "contacted_at": None,
    }

    result = supabase.table("leads").insert(lead_data).execute()

    if not result.data or not isinstance(result.data, list):
        raise HTTPException(status_code=500, detail="Erro ao criar lead no banco de dados.")

    l = result.data[0]  # type: ignore
    return LeadResponse(
        id=l.get("id", ""),  # type: ignore
        name=l.get("name", ""),  # type: ignore
        address=l.get("address"),  # type: ignore
        phone=l.get("phone"),  # type: ignore
        website=l.get("website"),  # type: ignore
        rating=l.get("rating"),  # type: ignore
        reviews_count=l.get("reviews_count"),  # type: ignore
        category=l.get("category"),  # type: ignore
        google_maps_url=l.get("google_maps_url"),  # type: ignore
        created_at=l.get("created_at", ""),  # type: ignore
        contacted=l.get("contacted", False),  # type: ignore
        contacted_at=l.get("contacted_at"),  # type: ignore
    )


@app.get("/api/leads")  # type: ignore
async def list_leads(
    search_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: Optional[str] = None,
):
    """List leads with optional filtering."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    query = supabase.table("leads").select("*")

    if search_id:
        query = query.eq("search_id", search_id)

    if search:
        query = query.or_(
            f"name.ilike.%{search}%,address.ilike.%{search}%,phone.ilike.%{search}%"
        )

    result = (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "leads": result.data,
        "count": len(result.data),
    }


@app.post("/api/leads")
async def create_lead(request: CreateLeadRequest):
    """Create a lead manually."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
        
    lead_data = {
        "name": request.name,
        "phone": request.phone,
        "address": request.address,
        "website": request.website,
        "category": request.category,
        "search_id": request.search_id,
        "contacted": False
    }
    
    result = supabase.table("leads").insert(lead_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create lead")
        
    return result.data[0]

async def get_whatsapp_config(settings: dict):
    url = settings.get("url")
    global_api_key = settings.get("global_api_key")
    instance_name = settings.get("instance_name")
    
    # Fallback automático para a instância AWS configurada
    if not url or not global_api_key or not instance_name:
        url = "http://3.16.46.140:8080"
        global_api_key = "prospec_evolution_key_secret_123"
        instance_name = "prospec_ode"
        
    return url, global_api_key, instance_name



@app.patch("/api/leads/{lead_id}")
async def update_lead(lead_id: str, request: UpdateLeadRequest):
    """Update a specific lead (e.g. contacted status)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    update_data = {}
    if request.contacted is not None:
        update_data["contacted"] = request.contacted
        update_data["contacted_at"] = datetime.now(timezone.utc).isoformat() if request.contacted else None

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar informado.")

    result = supabase.table("leads").update(update_data).eq("id", lead_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    return result.data[0]  # type: ignore


async def generate_groq_message(lead_data: dict, api_key: str, model: str = "llama-3.3-70b-versatile") -> str:
    import httpx
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    prompt = f"""
Você é um especialista em vendas e prospecção comercial. Escreva uma mensagem de abordagem fria (cold outreach) curta, amigável, altamente persuasiva e personalizada para enviar via WhatsApp para a seguinte empresa encontrada no Google Maps:

Nome da Empresa: {lead_data.get('name', '')}  # type: ignore
Categoria: {lead_data.get('category', '')}  # type: ignore
Endereço: {lead_data.get('address', '')}  # type: ignore
Website: {lead_data.get('website', '')}  # type: ignore
Avaliação no Google: {lead_data.get('rating', 'N/A')} ({lead_data.get('reviews_count', 0)} avaliações)  # type: ignore

Instruções da mensagem:
1. Seja muito natural, amigável e profissional. Evite parecer um robô ou spam.
2. Inicie cumprimentando e mencione que encontrou a empresa deles no Google Maps e achou o trabalho deles muito interessante (se tiver boa avaliação, elogie a nota de {lead_data.get('rating')} estrelas).  # type: ignore
3. Seja breve (no máximo 3 a 4 parágrafos curtos). Use espaçamentos e emojis de forma moderada.
4. Apresente uma proposta de valor rápida e direta (ex: ajudar a conseguir mais clientes na região).
5. Termine com uma chamada para ação clara e simples (ex: "Podemos conversar por 2 minutos aqui pelo WhatsApp?").
6. NÃO use colchetes, chaves ou placeholders como [Seu Nome] ou [Minha Empresa]. Se precisar se referir ao remetente, faça-o de forma genérica ou não assine com nome próprio (apenas finalize com "Atenciosamente, equipe de prospecção" ou similar).
7. Retorne APENAS o texto da mensagem completo, sem introduções ou explicações antes ou depois.
"""

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 500
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload
        )
        if response.status_code != 200:
            raise Exception(f"Groq API Error: {response.text}")
            
        result = response.json()
        return result["choices"][0]["message"]["content"].strip()


@app.post("/api/leads/{lead_id}/generate-message")
async def generate_lead_message(lead_id: str):
    """Generate a personalized sales message using Groq and mark lead as contacted."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
        
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(
            status_code=400, 
            detail="GROQ_API_KEY não configurada no backend. Por favor, adicione-a no arquivo .env"
        )
        
    # Get Lead
    lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
    if not lead_res.data or not isinstance(lead_res.data, list):
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    lead = lead_res.data[0]  # type: ignore
    if not isinstance(lead, dict):
        raise HTTPException(status_code=500, detail="Formato de lead inválido.")
        
    phone = format_whatsapp_number(str(lead.get("phone", "")))  # type: ignore
    if not phone:
        raise HTTPException(status_code=400, detail="Este lead não possui um telefone válido para WhatsApp.")
        
    # Mark as contacted automatically
    supabase.table("leads").update({
        "contacted": True,
        "contacted_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", lead_id).execute()
    
    try:
        # Call Groq to generate message
        message = await generate_groq_message(lead, groq_api_key)
        return {
            "phone": phone,
            "message": message
        }
    except Exception as e:
        logger.error(f"Erro ao gerar mensagem com Groq: {e}")
        # Fallback to a nice template message if Groq fails
        name = str(lead.get("name", "amigo"))  # type: ignore
        first_name = name.split()[0] if name else "amigo"
        address = str(lead.get("address", ""))  # type: ignore
        fallback_msg = f"Olá {first_name}! Vi sua empresa '{name}' no Google Maps no endereço {address} e gostaria de saber mais sobre os seus serviços. Como posso falar com o responsável?"
        return {
            "phone": phone,
            "message": fallback_msg,
            "warning": "Usando mensagem de fallback devido a um erro no Groq."
        }


@app.delete("/api/leads/{lead_id}")
async def delete_lead(lead_id: str):
    """Delete a specific lead."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    result = supabase.table("leads").delete().eq("id", lead_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    return {"message": "Lead deleted successfully"}


@app.delete("/api/search/{search_id}")
async def delete_search(search_id: str):
    """Delete a search and all its leads."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Cascade delete handled by foreign key
    result = supabase.table("searches").delete().eq("id", search_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Search not found")

    return {"message": "Search and leads deleted successfully"}


@app.get("/api/export/{search_id}")
async def export_leads_csv(search_id: str):
    """Export leads from a search as CSV."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Get search info
    search_result = (
        supabase.table("searches")
        .select("query")
        .eq("id", search_id)
        .execute()
    )

    if not search_result.data:
        raise HTTPException(status_code=404, detail="Search not found")

    # Get all leads
    leads_result = (
        supabase.table("leads")
        .select("*")
        .eq("search_id", search_id)
        .order("created_at", desc=False)
        .execute()
    )

    # Generate CSV
    output = io.StringIO()
    output.write("\ufeff")  # BOM to help Excel recognize UTF-8
    writer = csv.writer(output, delimiter=";")

    # Header
    writer.writerow([
        "Nome", "Endereço", "Telefone", "Website",
        "Avaliação", "Nº Avaliações", "Categoria", "Google Maps URL"
    ])

    # Data
    for lead in leads_result.data:
        writer.writerow([
            lead.get("name", ""),  # type: ignore
            lead.get("address", ""),  # type: ignore
            lead.get("phone", ""),  # type: ignore
            lead.get("website", ""),  # type: ignore
            lead.get("rating", ""),  # type: ignore
            lead.get("reviews_count", ""),  # type: ignore
            lead.get("category", ""),  # type: ignore
            lead.get("google_maps_url", ""),  # type: ignore
        ])

    output.seek(0)

    query_name = str(search_result.data[0]["query"]).replace(" ", "_")[:30]  # type: ignore
    filename = f"leads_{query_name}_{datetime.now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats():
    """Get overall statistics."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    # Total leads
    leads_result = supabase.table("leads").select("id", count="exact").execute()  # type: ignore
    total_leads = leads_result.count or 0

    # Total searches
    searches_result = supabase.table("searches").select("id", count="exact").execute()  # type: ignore
    total_searches = searches_result.count or 0

    # Leads with phone
    phone_result = (
        supabase.table("leads")
        .select("id", count="exact")  # type: ignore
        .neq("phone", "")
        .execute()
    )
    leads_with_phone = phone_result.count or 0

    # Leads with address
    addr_result = (
        supabase.table("leads")
        .select("id", count="exact")  # type: ignore
        .neq("address", "")
        .execute()
    )
    leads_with_address = addr_result.count or 0

    return StatsResponse(
        total_leads=total_leads,
        total_searches=total_searches,
        leads_with_phone=leads_with_phone,
        leads_with_address=leads_with_address,
    )


# ============ WhatsApp Endpoints ============

@app.get("/api/whatsapp/settings")
async def get_whatsapp_settings():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if res.data and isinstance(res.data, list):
        return res.data[0]  # type: ignore
    return None

@app.post("/api/whatsapp/settings")
async def save_whatsapp_settings(settings: WhatsAppSettingsRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    
    # Check if exists
    res = supabase.table("whatsapp_settings").select("id").limit(1).execute()
    if res.data and isinstance(res.data, list):
        # Update
        updated = supabase.table("whatsapp_settings").update({
            "url": settings.url,
            "global_api_key": settings.global_api_key,
            "instance_name": settings.instance_name,
            "auto_approve_messages": settings.auto_approve_messages,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", res.data[0]["id"]).execute()  # type: ignore
        if updated.data and isinstance(updated.data, list):
            return updated.data[0]  # type: ignore
    else:
        # Insert
        inserted = supabase.table("whatsapp_settings").insert({
            "url": settings.url,
            "global_api_key": settings.global_api_key,
            "instance_name": settings.instance_name,
            "auto_approve_messages": settings.auto_approve_messages
        }).execute()
        if inserted.data and isinstance(inserted.data, list):
            return inserted.data[0]  # type: ignore
    raise HTTPException(status_code=500, detail="Failed to save settings")

@app.get("/api/whatsapp/templates")
async def get_whatsapp_templates():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("message_templates").select("*").order("created_at", desc=True).execute()
    return res.data

@app.post("/api/whatsapp/templates")
async def create_whatsapp_template(template: MessageTemplateRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("message_templates").insert({
        "title": template.title,
        "content": template.content
    }).execute()
    if res.data and isinstance(res.data, list):
        return res.data[0]  # type: ignore
    raise HTTPException(status_code=500, detail="Failed to create template")

@app.delete("/api/whatsapp/templates/{template_id}")
async def delete_whatsapp_template(template_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    supabase.table("message_templates").delete().eq("id", template_id).execute()
    return {"message": "Template deleted"}

@app.get("/api/whatsapp/status")
async def get_whatsapp_status():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if not res.data or not isinstance(res.data, list):
        return {"configured": False}
    
    settings = res.data[0]  # type: ignore
    if not isinstance(settings, dict):
        return {"configured": False}
        
    url, global_api_key, instance_name = await get_whatsapp_config(settings)
    
    api = EvolutionAPI(url, global_api_key)
    status = await api.get_instance_status(instance_name)
    
    # If instance doesn't exist, create it
    if "instance" in status and isinstance(status["instance"], dict) and status["instance"].get("state") == "not_found":
        await api.create_instance(instance_name)
        status = await api.get_instance_status(instance_name)
        
    return {"configured": True, "status": status}

@app.get("/api/whatsapp/qrcode")
async def get_whatsapp_qrcode():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if not res.data or not isinstance(res.data, list):
        raise HTTPException(status_code=400, detail="Settings not configured")
        
    settings = res.data[0]  # type: ignore
    if not isinstance(settings, dict):
        raise HTTPException(status_code=400, detail="Invalid settings format")
        
    url, global_api_key, instance_name = await get_whatsapp_config(settings)
    api = EvolutionAPI(url, global_api_key)
    qr = await api.get_qrcode(instance_name)
    return qr

@app.post("/api/whatsapp/logout")
async def logout_whatsapp():
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
    res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if not res.data or not isinstance(res.data, list):
        raise HTTPException(status_code=400, detail="Settings not configured")
        
    settings = res.data[0]  # type: ignore
    if not isinstance(settings, dict):
        raise HTTPException(status_code=400, detail="Invalid settings format")
        
    url, global_api_key, instance_name = await get_whatsapp_config(settings)
    api = EvolutionAPI(url, global_api_key)
    result = await api.logout_instance(instance_name)
    return result

@app.post("/api/whatsapp/send")
async def send_whatsapp_message(request: SendMessageRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
        
    # Get Lead
    lead_res = supabase.table("leads").select("*").eq("id", request.lead_id).execute()
    if not lead_res.data or not isinstance(lead_res.data, list):
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = lead_res.data[0]  # type: ignore
    if not isinstance(lead, dict):
        raise HTTPException(status_code=500, detail="Invalid lead format")
    
    phone = format_whatsapp_number(str(lead.get("phone", "")))  # type: ignore
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    # Get Settings
    settings_res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if not settings_res.data or not isinstance(settings_res.data, list):
        raise HTTPException(status_code=400, detail="Settings not configured")
    settings = settings_res.data[0]  # type: ignore
    if not isinstance(settings, dict):
        raise HTTPException(status_code=500, detail="Invalid settings format")
        
    url, global_api_key, instance_name = await get_whatsapp_config(settings)
    
    api = EvolutionAPI(url, global_api_key)
    
    # Process text for variables
    name = str(lead.get("name", "amigo"))  # type: ignore
    address = str(lead.get("address", ""))  # type: ignore
    first_name = name.split()[0] if name else "amigo"
    
    text = request.text.replace("{{nome}}", name)
    text = text.replace("{{primeiro_nome}}", first_name)
    text = text.replace("{{endereco}}", address)
    
    # Send
    result = await api.send_text_message(instance_name, phone, text)
    print("EVOLUTION API RESULT:", result)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=str(result))
        
    # Mark as contacted
    supabase.table("leads").update({
        "contacted": True,
        "contacted_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", request.lead_id).execute()
    
    return {"message": "Success", "details": result}

@app.post("/api/whatsapp/send-audio")
async def send_whatsapp_audio(request: SendAudioRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
        
    # Get Lead
    lead_res = supabase.table("leads").select("*").eq("id", request.lead_id).execute()
    if not lead_res.data or not isinstance(lead_res.data, list):
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = lead_res.data[0]  # type: ignore
    if not isinstance(lead, dict):
        raise HTTPException(status_code=500, detail="Invalid lead format")
    
    phone = format_whatsapp_number(str(lead.get("phone", "")))  # type: ignore
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    # Get Settings
    settings_res = supabase.table("whatsapp_settings").select("*").limit(1).execute()
    if not settings_res.data or not isinstance(settings_res.data, list):
        raise HTTPException(status_code=400, detail="Settings not configured")
    settings = settings_res.data[0]  # type: ignore
    if not isinstance(settings, dict):
        raise HTTPException(status_code=500, detail="Invalid settings format")
        
    url, global_api_key, instance_name = await get_whatsapp_config(settings)
    
    api = EvolutionAPI(url, global_api_key)
    
    # Process text for variables
    name = str(lead.get("name", "amigo"))  # type: ignore
    address = str(lead.get("address", ""))  # type: ignore
    first_name = name.split()[0] if name else "amigo"
    
    text = request.text.replace("{{nome}}", name)
    text = text.replace("{{primeiro_nome}}", first_name)
    text = text.replace("{{endereco}}", address)
    
    # Generate Audio Base64
    try:
        from tts import text_to_speech_base64
        audio_base64 = await text_to_speech_base64(text)
        audio_uri = audio_base64
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar áudio por IA: {str(e)}")
        
    # Send
    result = await api.send_audio_message(instance_name, phone, audio_uri)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
        
    # Mark as contacted
    supabase.table("leads").update({
        "contacted": True,
        "contacted_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", request.lead_id).execute()
    
    return {"message": "Success", "details": result}

@app.post("/api/whatsapp/bulk-send")
async def bulk_send_whatsapp_messages(request: BulkSendRequest, background_tasks: BackgroundTasks):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")
        
    # Get template
    tpl_res = supabase.table("message_templates").select("*").eq("id", request.template_id).execute()
    if not tpl_res.data or not isinstance(tpl_res.data, list):
        raise HTTPException(status_code=404, detail="Template not found")
        
    template = tpl_res.data[0]  # type: ignore
    if not isinstance(template, dict):
        raise HTTPException(status_code=500, detail="Invalid template format")
        
    template_content = template.get("content")
    if not isinstance(template_content, str):
        raise HTTPException(status_code=500, detail="Invalid template content format")
    
    # Trigger background task
    background_tasks.add_task(
        run_bulk_send_task,
        lead_ids=request.lead_ids,
        template_content=template_content
    )
    
    return {"message": f"Bulk sending started for {len(request.lead_ids)} leads"}
