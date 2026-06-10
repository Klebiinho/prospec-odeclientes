import httpx
import re
from typing import Optional, Dict, Any

class EvolutionAPI:
    def __init__(self, base_url: str, global_api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "apikey": global_api_key,
            "Content-Type": "application/json"
        }

    async def get_instance_status(self, instance_name: str) -> Dict[str, Any]:
        """Check connection state of an instance"""
        url = f"{self.base_url}/instance/connectionState/{instance_name}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 404:
                    return {"instance": {"state": "not_found"}}
                return {"error": response.text}
            except Exception as e:
                return {"error": str(e)}

    async def create_instance(self, instance_name: str) -> Dict[str, Any]:
        """Create a new WhatsApp instance"""
        url = f"{self.base_url}/instance/create"
        payload = {
            "instanceName": instance_name,
            "token": "",
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS"
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=15.0)
                return response.json()
            except Exception as e:
                return {"error": str(e)}
                
    async def get_qrcode(self, instance_name: str) -> Dict[str, Any]:
        """Get the base64 QR code for scanning"""
        url = f"{self.base_url}/instance/connect/{instance_name}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
                return {"error": response.text}
            except Exception as e:
                return {"error": str(e)}

    async def logout_instance(self, instance_name: str) -> Dict[str, Any]:
        """Logout the instance"""
        url = f"{self.base_url}/instance/logout/{instance_name}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(url, headers=self.headers, timeout=10.0)
                return response.json()
            except Exception as e:
                return {"error": str(e)}

    async def send_text_message(self, instance_name: str, number: str, text: str, delay: int = 1200) -> Dict[str, Any]:
        """Send a text message. Delay in ms."""
        url = f"{self.base_url}/message/sendText/{instance_name}"
        payload = {
            "number": number,
            "text": text,
            "delay": delay,
            "linkPreview": False
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=30.0)
                if response.status_code in (200, 201):
                    return response.json()
                return {"error": f"HTTP {response.status_code}: {response.text}"}
            except httpx.TimeoutException as e:
                return {"error": f"Timeout connecting to Evolution API at {url}"}
            except httpx.RequestError as e:
                return {"error": f"Connection error to Evolution API at {url}: {type(e).__name__}"}
            except Exception as e:
                return {"error": f"Unexpected error: {type(e).__name__} - {str(e)}"}

    async def send_audio_message(self, instance_name: str, number: str, audio_base64: str, delay: int = 1200) -> Dict[str, Any]:
        """Send an audio message (voice note). Delay in ms. audio_base64 is a base64 string or data URI."""
        url = f"{self.base_url}/message/sendWhatsAppAudio/{instance_name}"
        payload = {
            "number": number,
            "audio": audio_base64,
            "delay": delay,
            "encoding": True
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self.headers, timeout=30.0)
                if response.status_code in (200, 201):
                    return response.json()
                return {"error": f"HTTP {response.status_code}: {response.text}"}
            except httpx.TimeoutException as e:
                return {"error": f"Timeout connecting to Evolution API at {url}"}
            except httpx.RequestError as e:
                return {"error": f"Connection error to Evolution API at {url}: {type(e).__name__}"}
            except Exception as e:
                return {"error": f"Unexpected error: {type(e).__name__} - {str(e)}"}


def format_whatsapp_number(phone: str) -> Optional[str]:
    """
    Cleans phone number for WhatsApp.
    Removes non-digits. Adds 55 if length is 10 or 11.
    """
    if not phone:
        return None
    cleaned = re.sub(r"\D", "", phone)
    
    if len(cleaned) == 0:
        return None
        
    # If it's a Brazilian number missing 55
    if len(cleaned) in (10, 11):
        cleaned = "55" + cleaned
    
    # Validation logic - minimal for now
    if len(cleaned) < 10:
        return None
        
    return cleaned
