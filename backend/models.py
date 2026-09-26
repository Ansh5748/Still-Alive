"""Pydantic models."""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid


class Socials(BaseModel):
    youtube: Optional[str] = None
    instagram: Optional[str] = None
    x: Optional[str] = None
    linkedin: Optional[str] = None
    facebook: Optional[str] = None
    threads: Optional[str] = None
    website: Optional[str] = None


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    role: str = "user"
    socials: Socials = Field(default_factory=Socials)
    channel_context_map: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    socials: Optional[Socials] = None


class AnalysisCreate(BaseModel):
    title: Optional[str] = None
    subject_type: str = "creator"  # creator | brand
    platform: str = "youtube"
    channel_link: Optional[str] = None
    audience_type: str = "general"
    demographics: Optional[str] = None
    niche: str = "education"
    intent: str = "educational"
    mode: str = "SAFE"  # SAFE | CONTROVERSIAL | AGGRESSIVE
    content_text: Optional[str] = None
    content_url: Optional[str] = None
    brand_name: Optional[str] = None  # only when subject_type=brand
    campaign_goal: Optional[str] = None  # only when subject_type=brand


class Analysis(BaseModel):
    analysis_id: str = Field(default_factory=lambda: f"an_{uuid.uuid4().hex[:12]}")
    user_id: str
    title: str
    subject_type: str = "creator"
    platform: str
    channel_link: Optional[str] = None
    audience_type: str
    demographics: Optional[str] = None
    niche: str
    intent: str
    mode: str
    content_text: str
    content_url: Optional[str] = None
    brand_name: Optional[str] = None
    campaign_goal: Optional[str] = None
    status: str = "pending"
    progress: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    channel_context: Optional[Dict[str, Any]] = None  # scraped channel data
    agent1_segments: Optional[List[Dict[str, Any]]] = None
    agent2_legal: Optional[List[Dict[str, Any]]] = None
    agent3_virality: Optional[List[Dict[str, Any]]] = None
    agent4_personas: Optional[Dict[str, Any]] = None
    agent5_scripts: Optional[Dict[str, Any]] = None
    agent6_audience: Optional[Dict[str, Any]] = None
    agent7_growth: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    partial_failures: Optional[List[str]] = None
