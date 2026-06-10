import base64
import io
import logging
import asyncio
import httpx
import json
import os
import numpy as np
from gtts import gTTS

try:
    import soundfile as sf
    from kokoro import KPipeline
except ImportError:
    sf = None
    KPipeline = None

logger = logging.getLogger(__name__)

# Lazy initialization of KPipeline
_kokoro_pipeline_pt = None
_kokoro_pipeline_en = None

def get_kokoro_pipeline(lang: str):
    global _kokoro_pipeline_pt, _kokoro_pipeline_en
    if KPipeline is None:
        raise Exception("Kokoro is not installed")
        
    if lang.startswith("pt"):
        if _kokoro_pipeline_pt is None:
            logger.info("Initializing Kokoro pipeline for Portuguese (p)")
            _kokoro_pipeline_pt = KPipeline(lang_code='p')
        return _kokoro_pipeline_pt
    else:
        if _kokoro_pipeline_en is None:
            logger.info("Initializing Kokoro pipeline for English (a)")
            _kokoro_pipeline_en = KPipeline(lang_code='a')
        return _kokoro_pipeline_en

async def kokoro_text_to_speech_base64(text: str, lang: str = "pt", voice: str = "") -> str:
    """
    Generates TTS using Kokoro open-weight model locally.
    """
    if sf is None or KPipeline is None:
        raise Exception("Kokoro dependencies (soundfile, kokoro) are not installed")

    pipeline = get_kokoro_pipeline(lang)
    
    # Select appropriate voice
    # Default Portuguese voice: pf_dora or pm_alex
    # Default English voice: af_heart
    if not voice:
        voice = 'pm_alex' if lang.startswith('pt') else 'af_heart'
        
    logger.info(f"Kokoro synthesizing text: '{text[:50]}...' using voice '{voice}'")
    
    generator = pipeline(text, voice=voice, speed=1)
    
    # Collect all audio segments
    audio_segments = []
    sample_rate = 24000
    
    # generator can be blocking, so we run it in a thread if it causes issues, but for now we'll iterate.
    # The generation happens immediately, but KPipeline blocks while processing.
    for i, (gs, ps, audio) in enumerate(generator):
        audio_segments.append(audio)
        
    if not audio_segments:
        raise Exception("Kokoro generated no audio")
        
    # Concatenate all audio numpy arrays
    final_audio = np.concatenate(audio_segments)
    
    # Write to a byte stream
    fp = io.BytesIO()
    sf.write(fp, final_audio, sample_rate, format='WAV')
    fp.seek(0)
    
    logger.info("Kokoro TTS synthesis complete")
    return base64.b64encode(fp.read()).decode("utf-8")

async def text_to_speech_base64(text: str, lang: str = "pt") -> str:
    """
    Converts a text string to an audio file.
    Priority:
    1. Kokoro (if installed)
    2. Miso One (Omnivoice, if MISO_COOKIE is set)
    3. gTTS (fallback)
    Returns its content as a base64 encoded string.
    """
    
    # 1. Try Kokoro First
    if KPipeline is not None:
        try:
            logger.info(f"Synthesizing text using Kokoro: '{text[:50]}...'")
            return await kokoro_text_to_speech_base64(text, lang)
        except Exception as e:
            logger.error(f"Error generating Kokoro TTS: {e}. Falling back to Miso One/gTTS.")
            
    # 2. Try Miso One (Omnivoice)
    miso_cookie = os.environ.get("MISO_COOKIE")
    if miso_cookie:
        try:
            logger.info(f"Synthesizing text using Miso One (Omnivoice) TTS: '{text[:50]}...'")
            return await miso_one_text_to_speech_base64(text, miso_cookie, lang)
        except Exception as e:
            logger.error(f"Error generating Miso One TTS: {e}. Falling back to gTTS.")
    
    # 3. Fallback to gTTS
    try:
        logger.info(f"Synthesizing text: '{text[:50]}...' using language '{lang}' (gTTS)")
        tts = gTTS(text=text, lang=lang)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        audio_bytes = fp.read()
        logger.info("TTS synthesis complete")
        return base64.b64encode(audio_bytes).decode("utf-8")
    except Exception as e:
        logger.error(f"Error generating TTS with gTTS: {e}")
        raise e

async def miso_one_text_to_speech_base64(text: str, cookie: str, lang: str = "pt", voice: str = "Adam") -> str:
    app_url = "https://misooneai.com"
    headers = {
        "Content-Type": "application/json",
        "Cookie": cookie
    }
    
    payload = {
        "mediaType": "speech",
        "presetId": "miso-one",
        "options": {
            "dialogue": [
                {"voice": voice, "text": text}
            ],
            "language_code": lang
        }
    }
    
    async with httpx.AsyncClient() as client:
        # 1. Create task
        resp = await client.post(f"{app_url}/api/ai/generate", json=payload, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            raise Exception(f"Generate API failed: {data.get('message')} - {data.get('data')}")
            
        task_id = data["data"]["id"]
        
        # 2. Poll task status
        for _ in range(60): # max 60 seconds wait
            await asyncio.sleep(1)
            query_resp = await client.post(
                f"{app_url}/api/ai/query", 
                json={"taskId": task_id}, 
                headers=headers
            )
            query_data = query_resp.json()
            status = query_data["data"]["status"]
            
            if status == "success":
                task_info_str = query_data["data"].get("taskInfo", "{}")
                task_info = json.loads(task_info_str) if task_info_str else {}
                audios = task_info.get("audios", [])
                if audios:
                    audio_url = audios[0].get("audioUrl")
                    # Download audio
                    audio_resp = await client.get(audio_url)
                    audio_resp.raise_for_status()
                    return base64.b64encode(audio_resp.content).decode("utf-8")
            elif status in ["failed", "canceled"]:
                raise Exception(f"Task {status}: {query_data}")
                
        raise Exception("Timeout waiting for audio generation")

