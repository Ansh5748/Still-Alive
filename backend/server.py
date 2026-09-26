"""FastAPI app: JWT auth + profile + analyses + multi-agent pipeline."""
import os
import json
import logging
import asyncio
import tempfile
import shutil
import threading
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import uuid
import speech_recognition as sr
from pydub import AudioSegment, silence
import yt_dlp

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, UploadFile, File, Form, BackgroundTasks, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient

from models import AnalysisCreate, Analysis, RegisterReq, LoginReq, ProfileUpdate
from auth import (
    register_user, login_user, get_current_user,
    create_access_token, ACCESS_TTL_MIN, hash_password,
)
from agents import run_pipeline
from channels import fetch_channel_context
from firebase_auth import verify_firebase_id_token
import billing as billing_mod

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Sync mongo for the pipeline thread (motor is bound to its event loop)
sync_client = MongoClient(mongo_url)
sync_db = sync_client[os.environ['DB_NAME']]

app = FastAPI(title="Still Alive — Creator + Brand Intelligence")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger(__name__)


async def auth_user(request: Request):
    return await get_current_user(db, request)


def _set_cookie(response: Response, token: str):
    # In production, we need these attributes for cross-domain cookies to work
    is_prod = os.environ.get("RENDER", "false") == "true"
    response.set_cookie(
        key="access_token", value=token,
        httponly=True, 
        secure=True, 
        samesite="none" if is_prod else "lax",
        path="/", 
        max_age=ACCESS_TTL_MIN * 60,
    )


# ============== AUTH ==============
@api.post("/auth/register")
async def register(payload: RegisterReq, response: Response):
    user = await register_user(db, payload.email, payload.password, payload.name)
    token = create_access_token(user["user_id"], user["email"])
    _set_cookie(response, token)
    user["access_token"] = token
    return user


@api.post("/auth/login")
async def login(payload: LoginReq, response: Response):
    user = await login_user(db, payload.email, payload.password)
    token = create_access_token(user["user_id"], user["email"])
    _set_cookie(response, token)
    user["access_token"] = token
    return user


@api.get("/auth/me")
async def me(user=Depends(auth_user)):
    return user


@api.post("/auth/google")
async def auth_google(payload: dict, response: Response):
    """Exchange Firebase ID token for our JWT. Creates user on first sign-in."""
    token = (payload or {}).get("id_token")
    if not token:
        raise HTTPException(status_code=400, detail="id_token required")
    info = verify_firebase_id_token(token)
    if not info:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")
    email = info["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # Create user with random unusable password
        import secrets
        random_pw = secrets.token_urlsafe(32)
        user_doc = {
            "user_id": f"user_{secrets.token_hex(6)}",
            "email": email,
            "name": info["name"],
            "password_hash": hash_password(random_pw),
            "role": "user",
            "socials": {},
            "picture": info.get("picture"),
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)
        user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    jwt_token = create_access_token(user["user_id"], user["email"])
    _set_cookie(response, jwt_token)
    user.pop("password_hash", None)
    user["access_token"] = jwt_token
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    # In production with cross-site cookies (Render), we must match the attributes used to set the cookie
    is_prod = os.environ.get("RENDER", "false") == "true"
    response.delete_cookie(
        "access_token", 
        path="/", 
        samesite="none" if is_prod else "lax", 
        secure=True
    )
    return {"ok": True}


# ============== PROFILE ==============
@api.put("/profile")
async def update_profile(payload: ProfileUpdate, user=Depends(auth_user)):
    update: dict = {}
    if payload.name is not None and payload.name.strip():
        update["name"] = payload.name.strip()
    if payload.socials is not None:
        update["socials"] = payload.socials.model_dump(exclude_none=True)
    if not update:
        return user
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return fresh


def _profile_complete(user: dict) -> bool:
    s = user.get("socials") or {}
    return bool(s.get("instagram") or s.get("youtube"))


async def _get_free_transcription(url: Optional[str] = None, local_path: Optional[str] = None) -> str:
    """Fetches audio from ANY URL or local file and transcribes using the free Google Speech API."""
    target_wav = None
    downloaded_path = None
    
    # Sanity check for ffmpeg
    if not shutil.which("ffmpeg"):
        log.error("FFmpeg not found in system PATH. Transcription will fail.")
        return ""

    try:
        if url:
            log.info(f"Attempting to download audio from URL: {url}")
            base_name = os.path.join(tempfile.gettempdir(), f"sa_dl_{uuid.uuid4().hex}")

            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': base_name + ".%(ext)s",
                'postprocessors': [{'key': 'FFmpegExtractAudio','preferredcodec': 'mp3','preferredquality': '192'}],
                'quiet': True, 'no_warnings': True, 'noplaylist': True, 'socket_timeout': 15, 'nocheckcertificate': True,
                'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            def _dl():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if 'requested_downloads' in info:
                        return info['requested_downloads'][0]['filepath']
                    return ydl.prepare_filename(info)
            
            downloaded_path = await asyncio.to_thread(_dl)
            if not downloaded_path or not os.path.exists(downloaded_path):
                log.error(f"yt-dlp failed to download audio for URL: {url}")
                return ""
            local_path = downloaded_path

        if not local_path or not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
            log.error(f"Local audio file not found or empty: {local_path}")
            return ""

        # Convert to WAV and Split by silence for line-by-line transcription
        log.info(f"Processing {local_path} for line-by-line transcription...")
        audio = await asyncio.to_thread(lambda: AudioSegment.from_file(local_path))
        
        # Normalize audio for better silence detection
        audio = await asyncio.to_thread(lambda: audio.normalize())
        
        # Split on silence to get "lines"
        # min_silence_len: 600ms (slightly shorter for tighter lines), silence_thresh: -32dB (less aggressive)
        # Using dynamic silence threshold based on normalized audio
        chunks = await asyncio.to_thread(lambda: silence.split_on_silence(
            audio, 
            min_silence_len=600, 
            silence_thresh=audio.dBFS-14, 
            keep_silence=300
        ))
        
        r = sr.Recognizer()
        # Calibrate for ambient noise if we were using a microphone, but here we just set sensitivity
        r.energy_threshold = 300 
        full_text = []
        
        for i, chunk in enumerate(chunks):
            # Export chunk to temporary wav
            chunk_wav = os.path.join(tempfile.gettempdir(), f"sa_chunk_{uuid.uuid4().hex}.wav")
            await asyncio.to_thread(lambda: chunk.export(chunk_wav, format="wav"))
            
            try:
                with sr.AudioFile(chunk_wav) as source:
                    audio_data = r.record(source)
                    # Try English (Indian) then Hindi
                    try:
                        text = await asyncio.to_thread(lambda: r.recognize_google(audio_data, language="en-IN"))
                    except:
                        try:
                            text = await asyncio.to_thread(lambda: r.recognize_google(audio_data, language="hi-IN"))
                        except:
                            text = ""
                    
                    if text:
                        full_text.append(text.strip())
            finally:
                if os.path.exists(chunk_wav):
                    os.unlink(chunk_wav)

        # If no chunks or no text, fallback to a single pass if the file is short
        if not full_text:
            target_wav = os.path.join(tempfile.gettempdir(), f"sa_stt_{uuid.uuid4().hex}.wav")
            await asyncio.to_thread(lambda: audio.export(target_wav, format="wav"))
            try:
                with sr.AudioFile(target_wav) as source:
                    audio_data = r.record(source)
                    try:
                        text = await asyncio.to_thread(lambda: r.recognize_google(audio_data, language="en-IN"))
                    except:
                        try:
                            text = await asyncio.to_thread(lambda: r.recognize_google(audio_data, language="hi-IN"))
                        except:
                            text = ""
                    if text:
                        full_text.append(text.strip())
            finally:
                if os.path.exists(target_wav):
                    os.unlink(target_wav)

        result_script = "\n".join(full_text).strip()
        log.info(f"Transcription Finished. Lines: {len(full_text)}, Total Characters: {len(result_script)}")
        return result_script
    except Exception as e:
        log.error(f"Free transcription failed: {e}")
        return ""
    finally:
        if downloaded_path and os.path.exists(downloaded_path):
            os.unlink(downloaded_path)


# ============== BILLING ==============
async def _get_active_subscription(user_id: str) -> Optional[dict]:
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "status": "active"},
        {"_id": 0},
        sort=[("ends_at", -1)],
    )
    if billing_mod.is_active(sub):
        return sub
    return None


async def _runs_used_this_period(user_id: str, sub: Optional[dict]) -> int:
    """Count runs since current billing period start."""
    if not sub:
        return 0
    started = sub.get("started_at")
    if isinstance(started, str):
        started = datetime.fromisoformat(started)
    return await db.analyses.count_documents({"user_id": user_id, "created_at": {"$gte": started.isoformat()}})


@api.get("/billing/plans")
async def billing_plans(request: Request):
    """Publicly list plans. If user is logged in, show current sub status."""
    user_id = None
    try:
        user = await auth_user(request)
        user_id = user.get("user_id")
    except:
        pass
        
    sub = await _get_active_subscription(user_id) if user_id else None
    total_runs = await _get_total_runs(user_id) if user_id else 0
    return billing_mod.list_plans(total_runs, bool(sub))


@api.get("/billing/me")
async def billing_me(user=Depends(auth_user)):
    """Returns user subscription status and feature flags."""
    sub = await _get_active_subscription(user["user_id"])
    total_lifetime_runs = await _get_total_runs(user["user_id"])
    feats = billing_mod.features_for(sub, total_lifetime_runs)

    if sub:
        used = await _runs_used_this_period(user["user_id"], sub)
    else:
        used = total_lifetime_runs # For free trial, 'used' is total lifetime runs

    return {"subscription": sub, "features": feats, "runs_used": used}


@api.post("/billing/checkout")
async def billing_checkout(payload: dict, user=Depends(auth_user)):
    plan_id = (payload or {}).get("plan_id")
    duration = (payload or {}).get("duration")
    if plan_id not in billing_mod.PLANS:
        raise HTTPException(status_code=400, detail="invalid plan_id")
    if duration not in ("monthly", "halfyear", "yearly"):
        raise HTTPException(status_code=400, detail="invalid duration")
    try:
        return await billing_mod.create_order(plan_id, duration, user["user_id"])
    except Exception as e:
        log.exception("razorpay create_order failed")
        raise HTTPException(status_code=500, detail=f"Checkout failed: {e}")


@api.post("/billing/verify")
async def billing_verify(payload: dict, user=Depends(auth_user)):
    order_id = payload.get("razorpay_order_id")
    payment_id = payload.get("razorpay_payment_id")
    signature = payload.get("razorpay_signature")
    plan_id = payload.get("plan_id")
    duration = payload.get("duration")
    if not all([order_id, payment_id, signature, plan_id, duration]):
        raise HTTPException(status_code=400, detail="missing fields")
    if not billing_mod.verify_payment_signature(order_id, payment_id, signature):
        raise HTTPException(status_code=400, detail="signature verification failed")
    # Cancel any prior active subs
    await db.subscriptions.update_many(
        {"user_id": user["user_id"], "status": "active"},
        {"$set": {"status": "superseded"}},
    )
    doc = billing_mod.make_subscription_doc(user["user_id"], plan_id, duration, order_id, payment_id)
    await db.subscriptions.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "subscription": doc}


# ============== CHANNEL FETCH (manual preview for the form) ==============
@api.post("/channels/preview")
async def channel_preview(payload: dict, user=Depends(auth_user)):
    url = (payload or {}).get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    return await fetch_channel_context(url)


# ============== ANALYSES ==============
def _sync_update(analysis_id: str, update: dict):
    sync_db.analyses.update_one({"analysis_id": analysis_id}, {"$set": update})


def _pipeline_thread(analysis_id: str, payload: dict):
    async def on_prog(p, s, partial=None):
        u = {"progress": p, "status": s}
        if partial:
            u.update(partial)
        await asyncio.to_thread(_sync_update, analysis_id, u)

    async def main():
        try:
            results = await run_pipeline(payload, on_progress=on_prog)
            await asyncio.to_thread(_sync_update, analysis_id, {**results, "status": "done", "progress": 100})
        except Exception as e:
            log.exception("pipeline failed")
            await asyncio.to_thread(_sync_update, analysis_id, {"status": "failed", "error": str(e)})

    asyncio.run(main())


def _spawn_pipeline(analysis_id: str, payload: dict):
    threading.Thread(target=_pipeline_thread, args=(analysis_id, payload), daemon=True).start()


async def _get_total_runs(user_id: str) -> int:
    """Counts total pipeline executions from usage log (prevents deletion exploits)."""
    return await db.usage_log.count_documents({"user_id": user_id})


async def _log_usage(user_id: str, analysis_id: str):
    """Logs a pipeline execution event."""
    await db.usage_log.insert_one({
        "user_id": user_id,
        "analysis_id": analysis_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


def _require_profile(user: dict):
    if not _profile_complete(user):
        raise HTTPException(status_code=412, detail="Add at least one of Instagram or YouTube to your profile to run analyses.")


async def _enforce_plan(user: dict, mode: str, subject_type: str, is_rerun: bool = False):
    # Admins bypass billing
    if user.get("role") == "admin":
        return

    total_lifetime_runs = await _get_total_runs(user["user_id"])
    sub = await _get_active_subscription(user["user_id"])
    
    # Determine features based on current state (active sub or free trial)
    feats = billing_mod.features_for(sub, total_lifetime_runs)

    if not feats["active"]:
        raise HTTPException(status_code=402, detail="Active subscription required. Pick a plan to continue.")

    # Enforce feature limits based on the determined plan (paid or active free trial)
    if mode and mode not in feats["modes"]:
        raise HTTPException(status_code=403, detail=f"Mode {mode} not available on your plan. Upgrade to unlock.")
    if subject_type == "brand" and not feats["allow_brand"]:
        raise HTTPException(status_code=403, detail="Brand campaign mode requires Studio plan.")
    if is_rerun and not feats["allow_edit_rerun"]:
        raise HTTPException(status_code=403, detail="Edit & re-run requires Pro or Studio plan.")

    # Enforce run limits
    if feats["monthly_runs"] != -1:
        if sub: # Paid subscriber: check monthly usage
            used_this_period = await _runs_used_this_period(user["user_id"], sub)
            if used_this_period >= feats["monthly_runs"]:
                raise HTTPException(status_code=429, detail=f"Monthly run limit reached ({feats['monthly_runs']}/month). Upgrade for more.")
        else: # Free trial user: check lifetime usage
            if total_lifetime_runs >= feats["monthly_runs"]: # feats['monthly_runs'] here is the lifetime limit for free trial
                raise HTTPException(status_code=402, detail=f"Free trial limit reached ({feats['monthly_runs']} lifetime runs). Pick a plan to continue.")


@api.post("/analyses")
async def create_analysis(payload: AnalysisCreate, user=Depends(auth_user)):
    _require_profile(user)
    await _enforce_plan(user, payload.mode, payload.subject_type, is_rerun=False)

    text = payload.content_text
    if not text and payload.content_url:
        text = await _get_free_transcription(url=payload.content_url)
        if not text:
            raise HTTPException(status_code=400, detail="Failed to extract transcript from URL. Try providing text manually.")

    if not text:
        raise HTTPException(status_code=400, detail="Provide content text or content url")
    title = payload.title or (text[:60] + ("..." if len(text) > 60 else ""))

    # Pull channel context — prefer user's profile-cached channel_context_map for the selected platform,
    # else fall back to compose-form channel_link if user supplied one.
    channel_ctx: Dict[str, Any] = {}
    plat_key = (payload.platform or "youtube").lower()
    cmap = user.get("channel_context_map") or {}
    if cmap.get(plat_key):
        channel_ctx = cmap[plat_key]
    elif payload.channel_link:
        try:
            channel_ctx = await asyncio.wait_for(fetch_channel_context(payload.channel_link), timeout=25)
        except Exception as e:
            log.warning(f"channel fetch timeout: {e}")
            channel_ctx = {"error": "channel fetch timed out"}

    a = Analysis(
        user_id=user["user_id"],
        title=title,
        subject_type=payload.subject_type,
        platform=payload.platform,
        channel_link=payload.channel_link,
        audience_type=payload.audience_type,
        demographics=payload.demographics,
        niche=payload.niche,
        intent=payload.intent,
        mode=payload.mode,
        content_text=text,
        content_url=payload.content_url,
        brand_name=payload.brand_name,
        campaign_goal=payload.campaign_goal,
        channel_context=channel_ctx,
        status="running",
        progress=1,
    )
    doc = a.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.analyses.insert_one(doc)
    await _log_usage(user["user_id"], a.analysis_id)
    _spawn_pipeline(a.analysis_id, doc)
    return {"analysis_id": a.analysis_id, "status": "running"}


@api.post("/analyses/{analysis_id}/rerun")
async def rerun_analysis(analysis_id: str, payload: AnalysisCreate, user=Depends(auth_user)):
    """Edit + rerun: overrides metadata/content and replays the 7 agents on the SAME analysis_id."""
    _require_profile(user)
    await _enforce_plan(user, payload.mode, payload.subject_type, is_rerun=True)
    existing = await db.analyses.find_one({"analysis_id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")

    text = payload.content_text
    # RE-TRANSCRIBE if the URL changed OR if the user is switching from text to URL
    if payload.content_url and (payload.content_url != existing.get("content_url") or not text):
        log.info(f"Rerun: URL changed or missing text. Re-transcribing: {payload.content_url}")
        text = await _get_free_transcription(url=payload.content_url)
        if not text:
            raise HTTPException(status_code=400, detail="Failed to extract transcript from URL. Try providing text manually.")

    if not text:
        # If it was an upload previously and now it's just a rerun without new text/url, keep old text
        text = existing.get("content_text", "")
        
    if not text:
        raise HTTPException(status_code=400, detail="Provide content text or content url")
    
    title = payload.title or (text[:60] + ("..." if len(text) > 60 else ""))

    channel_ctx = {}
    plat_key = (payload.platform or "youtube").lower()
    cmap = user.get("channel_context_map") or {}
    if cmap.get(plat_key):
        channel_ctx = cmap[plat_key]
    elif payload.channel_link:
        try:
            channel_ctx = await asyncio.wait_for(fetch_channel_context(payload.channel_link), timeout=25)
        except Exception as e:
            channel_ctx = {"error": str(e)[:120]}

    update = {
        "title": title,
        "subject_type": payload.subject_type,
        "platform": payload.platform,
        "channel_link": payload.channel_link,
        "audience_type": payload.audience_type,
        "demographics": payload.demographics,
        "niche": payload.niche,
        "intent": payload.intent,
        "mode": payload.mode,
        "content_text": text,
        "content_url": payload.content_url,
        "brand_name": payload.brand_name,
        "campaign_goal": payload.campaign_goal,
        "channel_context": channel_ctx,
        "status": "running",
        "progress": 1,
        "error": None,
        "partial_failures": None,
        # clear old agent outputs so UI shows fresh run
        "agent1_segments": [], "agent2_legal": [], "agent3_virality": [],
        "agent4_personas": {}, "agent5_scripts": {}, "agent6_audience": {}, "agent7_growth": {},
    }
    await db.analyses.update_one({"analysis_id": analysis_id}, {"$set": update})
    await _log_usage(user["user_id"], analysis_id)
    fresh = await db.analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    _spawn_pipeline(analysis_id, fresh)
    return {"analysis_id": analysis_id, "status": "running"}


@api.post("/analyses/{analysis_id}/rerun_agent/{agent_id}")
async def rerun_single_agent_endpoint(analysis_id: str, agent_id: str, user=Depends(auth_user)):
    """Re-run ONLY a specific subagent (e.g. agent1..agent7) for an existing analysis."""
    existing = await db.analyses.find_one({"analysis_id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    key_map = {
        "agent1": "agent1_segments",
        "agent2": "agent2_legal",
        "agent3": "agent3_virality",
        "agent4": "agent4_personas",
        "agent5": "agent5_scripts",
        "agent6": "agent6_audience",
        "agent7": "agent7_growth",
    }
    target_key = key_map.get(agent_id.lower())
    if not target_key:
        raise HTTPException(status_code=400, detail="Invalid agent_id")

    empty_val = {} if agent_id.lower() in ["agent4", "agent5", "agent6", "agent7"] else []
    await db.analyses.update_one({"analysis_id": analysis_id}, {"$set": {target_key: empty_val, "status": "running"}})

    def _run_sub():
        async def _main():
            try:
                from agents import run_single_agent
                res = await run_single_agent(agent_id.lower(), existing, existing)
                _sync_update(analysis_id, {target_key: res, "status": "done"})
            except Exception as e:
                log.error(f"single agent rerun failed: {agent_id} - {e}")
                _sync_update(analysis_id, {"status": "done"})
        asyncio.run(_main())

    threading.Thread(target=_run_sub, daemon=True).start()
    return {"analysis_id": analysis_id, "agent_id": agent_id, "status": "running"}


@api.post("/analyses/upload")
async def upload_audio_video(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    subject_type: str = Form("creator"),
    platform: str = Form("youtube"),
    channel_link: Optional[str] = Form(None),
    audience_type: str = Form("general"),
    demographics: Optional[str] = Form(None),
    niche: str = Form("education"),
    intent: str = Form("educational"),
    mode: str = Form("SAFE"),
    brand_name: Optional[str] = Form(None),
    campaign_goal: Optional[str] = Form(None),
    user=Depends(auth_user),
):
    _require_profile(user)
    await _enforce_plan(user, mode, subject_type, is_rerun=False)
    suffix = Path(file.filename or "audio.mp3").suffix or ".mp3"
    if suffix.lower() not in [".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"]:
        raise HTTPException(status_code=400, detail="Unsupported file format")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        # Universal free transcription for uploaded media
        transcript = await _get_free_transcription(local_path=tmp_path)
    except Exception as e:
        log.exception("transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    if not transcript:
        raise HTTPException(status_code=400, detail="Transcription failed. Ensure FFmpeg is installed on the server to process media.")

    channel_ctx = {}
    if channel_link:
        try:
            channel_ctx = await asyncio.wait_for(fetch_channel_context(channel_link), timeout=25)
        except Exception as e:
            channel_ctx = {"error": str(e)[:120]}

    a = Analysis(
        user_id=user["user_id"],
        title=title or (file.filename or "Uploaded media"),
        subject_type=subject_type,
        platform=platform,
        channel_link=channel_link,
        audience_type=audience_type,
        demographics=demographics,
        niche=niche,
        intent=intent,
        mode=mode,
        content_text=transcript,
        brand_name=brand_name,
        campaign_goal=campaign_goal,
        channel_context=channel_ctx,
        status="running",
        progress=10,
    )
    doc = a.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.analyses.insert_one(doc)
    await _log_usage(user["user_id"], a.analysis_id)
    _spawn_pipeline(a.analysis_id, doc)
    return {"analysis_id": a.analysis_id, "status": "running", "transcript_preview": transcript[:200]}


@api.get("/analyses")
async def list_analyses(user=Depends(auth_user)):
    items = await db.analyses.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "agent1_segments": 0, "agent2_legal": 0, "agent3_virality": 0,
         "agent4_personas": 0, "agent5_scripts": 0, "agent6_audience": 0, "agent7_growth": 0,
         "channel_context": 0}
    ).sort("created_at", -1).to_list(200)
    return {"items": items}


@api.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str, user=Depends(auth_user)):
    doc = await db.analyses.find_one({"analysis_id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@api.delete("/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str, user=Depends(auth_user)):
    res = await db.analyses.delete_one({"analysis_id": analysis_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


@api.post("/analyses/{analysis_id}/rerun_agent/{agent_id}")
async def rerun_agent_endpoint(analysis_id: str, agent_id: str, background_tasks: BackgroundTasks, user=Depends(auth_user)):
    doc = await db.analyses.find_one({"analysis_id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    from agents import run_single_agent
    background_tasks.add_task(run_single_agent, analysis_id, agent_id)
    return {"status": "started", "analysis_id": analysis_id, "agent_id": agent_id}


@api.get("/trueforge/status")
async def get_trueforge_status():
    """TrueForge local agent harness & multi-agent pipeline status."""
    tf_config_path = ROOT_DIR.parent / "trueforge.config.json"
    tf_config = {}
    if tf_config_path.exists():
        try:
            with open(tf_config_path, "r", encoding="utf-8") as f:
                tf_config = json.load(f)
        except Exception as e:
            tf_config = {"error": str(e)}

    return {
        "ok": True,
        "harness": "TrueForge Local Agent Router v1.0.0",
        "provider": os.environ.get("LLM_PROVIDER", "auto"),
        "has_openai": bool(os.environ.get("OPENAI_API_KEY")),
        "has_gemini": bool(os.environ.get("GEMINI_API_KEY")),
        "subagents": [
            "agent1 (Content Breakdown)",
            "agent2 (Legal Risk & Kanoon)",
            "agent3 (Virality & Backlash)",
            "agent4 (Persona Feed)",
            "agent5 (Script Optimization)",
            "agent6 (Audience Intelligence)",
            "agent7 (Growth & Brands)"
        ],
        "config": tf_config
    }




@api.get("/")
async def root():
    return {"ok": True, "service": "still-alive"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    log.info(f"Startup: Connecting to database '{os.environ.get('DB_NAME')}'")
    
    # Verify FFmpeg availability
    if not shutil.which("ffmpeg"):
        log.error("CRITICAL: FFmpeg not found. Transcription services will be disabled.")

    try:
        await db.users.create_index("email", unique=True, background=True)
        await db.users.create_index("user_id", unique=True, background=True)
        await db.analyses.create_index("user_id")
        await db.analyses.create_index("analysis_id", unique=True)
    except Exception as e:
        log.error(f"Critical: Index creation failed. Ensure no duplicate or null user_id entries exist in MongoDB. Error: {e}")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email.lower()})
        if not existing:
            try:
                await register_user(db, admin_email, admin_password, "Admin")
                # mark as admin + add socials so admin passes profile gate
                await db.users.update_one(
                    {"email": admin_email.lower()},
                    {"$set": {"role": "admin", "socials": {"youtube": "https://youtube.com/@stillalive"}}}
                )
                log.info(f"seeded admin {admin_email}")
            except Exception as e:
                log.warning(f"admin seed: {e}")


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
    sync_client.close()
