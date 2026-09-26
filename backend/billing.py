"""Razorpay subscription billing.

3 tiers x 3 durations (monthly / 6-month / yearly). Yearly discounted.
Feature gating: runs/month + mode allow-list + brand mode + edit/rerun.
"""
import os
import hmac
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import razorpay

log = logging.getLogger(__name__)

RZP_KEY = os.environ.get("RAZORPAY_KEY_ID", "")
RZP_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

_client = None


def client():
    global _client
    if _client is None and RZP_KEY and RZP_SECRET:
        _client = razorpay.Client(auth=(RZP_KEY, RZP_SECRET))
    return _client


PLANS: Dict[str, Dict[str, Any]] = {
    "free_trial": {
        "name": "FREE TRIAL",
        "tagline": "Limited access to explore the agents",
        "monthly_runs": 3, # This is a one-time lifetime limit for trial users
        "hidden": False,
        "modes": ["SAFE", "CONTROVERSIAL"],
        "allow_brand": True,
        "allow_edit_rerun": False,
        "prices_inr": {"monthly": 0, "halfyear": 0, "yearly": 0},
    },
    "basic": {
        "name": "BASIC",
        "tagline": "For new creators testing the waters",
        "monthly_runs": 10,
        "modes": ["SAFE"],
        "allow_brand": False,
        "allow_edit_rerun": False,
        "prices_inr": {"monthly": 799, "halfyear": 3999, "yearly": 6999},
    },
    "pro": {
        "name": "PRO",
        "tagline": "For serious creators who ship weekly",
        "monthly_runs": 50,
        "modes": ["SAFE", "CONTROVERSIAL", "AGGRESSIVE"],
        "allow_brand": False,
        "allow_edit_rerun": True,
        "prices_inr": {"monthly": 2499, "halfyear": 11999, "yearly": 19999},
    },
    "studio": {
        "name": "STUDIO",
        "tagline": "Creators + Brand campaigns + bulk",
        "monthly_runs": -1,  # unlimited
        "modes": ["SAFE", "CONTROVERSIAL", "AGGRESSIVE"],
        "allow_brand": True,
        "allow_edit_rerun": True,
        "prices_inr": {"monthly": 4999, "halfyear": 23999, "yearly": 39999},
    },
    "no_plan": {
        "name": "NO ACTIVE PLAN",
        "hidden": True,
        "tagline": "Trial exhausted or inactive",
        "monthly_runs": 0,
        "modes": [],
        "allow_brand": False,
        "allow_edit_rerun": False,
        "prices_inr": {"monthly": 0, "halfyear": 0, "yearly": 0},
    },
}

DURATION_DAYS = {"monthly": 30, "halfyear": 182, "yearly": 365}


def list_plans(total_runs: int = 0, has_sub: bool = False) -> Dict[str, Any]:
    """Returns all plans to prevent lookup crashes, with dynamic hidden flags for UI."""
    out = {}
    trial_limit = PLANS["free_trial"]["monthly_runs"]
    
    for k, v in PLANS.items():
        plan_data = v.copy()
        # Ensure hidden key exists
        if "hidden" not in plan_data:
            plan_data["hidden"] = False
            
        # Logic: Hide free trial if exhausted OR if user already has a paid subscription
        if k == "free_trial":
            if total_runs >= trial_limit or has_sub:
                plan_data["hidden"] = True
        
        out[k] = plan_data
        
    return {"plans": out, "key_id": RZP_KEY}


def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    return PLANS.get(plan_id)


def amount_paise(plan_id: str, duration: str) -> int:
    p = PLANS.get(plan_id)
    if not p or duration not in p["prices_inr"]:
        raise ValueError("invalid plan/duration")
    return int(p["prices_inr"][duration]) * 100  # paise


async def create_order(plan_id: str, duration: str, user_id: str) -> Dict[str, Any]:
    c = client()
    if not c:
        raise RuntimeError("Razorpay not configured")
    amt = amount_paise(plan_id, duration)
    order = c.order.create({
        "amount": amt,
        "currency": "INR",
        "receipt": f"sa_{user_id[:10]}_{int(datetime.now(timezone.utc).timestamp())}",
        "notes": {"plan_id": plan_id, "duration": duration, "user_id": user_id},
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": RZP_KEY,
        "plan_id": plan_id,
        "duration": duration,
    }


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    msg = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(RZP_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def make_subscription_doc(user_id: str, plan_id: str, duration: str,
                          order_id: str, payment_id: str) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "user_id": user_id,
        "plan_id": plan_id,
        "duration": duration,
        "status": "active",
        "started_at": now.isoformat(),
        "ends_at": (now + timedelta(days=DURATION_DAYS[duration])).isoformat(),
        "razorpay_order_id": order_id,
        "razorpay_payment_id": payment_id,
        "amount_inr": PLANS[plan_id]["prices_inr"][duration],
    }


def is_active(sub: Optional[Dict[str, Any]]) -> bool:
    if not sub or sub.get("status") != "active":
        return False
    ends = sub.get("ends_at")
    if not ends:
        return False
    if isinstance(ends, str):
        ends = datetime.fromisoformat(ends)
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    return ends > datetime.now(timezone.utc)


def features_for(sub: Optional[Dict[str, Any]], total_lifetime_runs: int = 0) -> Dict[str, Any]:
    """Determine features based on subscription or free trial status."""
    trial_plan = PLANS["free_trial"]
    
    if not is_active(sub):
        # If within free trial limits, provide trial features
        if total_lifetime_runs < trial_plan["monthly_runs"]:
            return {
                "plan_id": "free_trial", "active": True, "ends_at": None,
                "monthly_runs": trial_plan["monthly_runs"], "modes": trial_plan["modes"],
                "allow_brand": trial_plan["allow_brand"], "allow_edit_rerun": trial_plan["allow_edit_rerun"],
            }
        # Trial exhausted and no subscription
        return {
            "plan_id": "no_plan", "active": False, # Use "no_plan" to distinguish exhausted trial from active trial
            "monthly_runs": 0, "modes": [], "allow_brand": False, "allow_edit_rerun": False,
        }

    p = PLANS.get(sub["plan_id"], trial_plan)
    return {
        "plan_id": sub["plan_id"], "active": True, "ends_at": sub.get("ends_at"),
        "monthly_runs": p["monthly_runs"], "modes": p["modes"],
        "allow_brand": p["allow_brand"], "allow_edit_rerun": p["allow_edit_rerun"],
    }
