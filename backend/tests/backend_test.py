"""Backend tests for creator-intelligence multi-agent system."""
import os
import time
import pytest
import requests
import subprocess
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://creator-suite-58.preview.emergentagent.com').rstrip('/')


def _seed_session():
    out = subprocess.check_output([
        "mongosh", "--quiet", "--eval",
        "use('test_database'); var t='test_session_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); "
        "var u='test-user-'+Date.now()+'_'+Math.random().toString(36).slice(2,8); "
        "db.users.insertOne({user_id:u,email:u+'@example.com',name:'Tester',picture:null,created_at:new Date()}); "
        "db.user_sessions.insertOne({user_id:u,session_token:t,expires_at:new Date(Date.now()+7*864e5),created_at:new Date()}); "
        "print('TOKEN='+t); print('USER='+u);"
    ]).decode()
    token = [l for l in out.splitlines() if l.startswith("TOKEN=")][0].split("=", 1)[1].strip()
    user = [l for l in out.splitlines() if l.startswith("USER=")][0].split("=", 1)[1].strip()
    return token, user


@pytest.fixture(scope="module")
def auth():
    token, user_id = _seed_session()
    return {"token": token, "user_id": user_id, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def auth2():
    token, user_id = _seed_session()
    return {"token": token, "user_id": user_id, "headers": {"Authorization": f"Bearer {token}"}}


# Health
def test_root():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# Auth
def test_me_unauth():
    r = requests.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 401


def test_me_with_token(auth):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == auth["user_id"]
    assert "email" in data


# Analyses
def test_create_empty_400(auth):
    r = requests.post(f"{BASE_URL}/api/analyses", json={}, headers=auth["headers"])
    assert r.status_code == 400


def test_full_pipeline(auth, auth2):
    payload = {
        "title": "TEST_pipeline",
        "platform": "youtube",
        "audience_type": "students",
        "niche": "education",
        "intent": "educational",
        "mode": "SAFE",
        "content_text": "Today I'll explain compound interest in 60 seconds. If you invest 10000 at 10% for 10 years, you get about 25937. Subscribe for more finance tips!"
    }
    r = requests.post(f"{BASE_URL}/api/analyses", json=payload, headers=auth["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    aid = body["analysis_id"]
    assert body["status"] == "running"

    # Multi-tenant isolation (retry; backend may be busy with concurrent LLM calls)
    r2 = None
    for _ in range(8):
        try:
            r2 = requests.get(f"{BASE_URL}/api/analyses/{aid}", headers=auth2["headers"], timeout=60)
            if r2.status_code in (200, 404):
                break
        except requests.exceptions.RequestException:
            pass
        time.sleep(10)
    assert r2 is not None and r2.status_code == 404, f"isolation check failed: {getattr(r2,'status_code',None)}"

    # Poll up to 240s with retry on transient gateway timeouts
    done = None
    deadline = time.time() + 240
    while time.time() < deadline:
        try:
            r = requests.get(f"{BASE_URL}/api/analyses/{aid}", headers=auth["headers"], timeout=60)
        except requests.exceptions.RequestException:
            time.sleep(8)
            continue
        if r.status_code != 200:
            time.sleep(8)
            continue
        d = r.json()
        if d.get("status") in ("done", "failed"):
            done = d
            break
        time.sleep(5)
    assert done is not None, "pipeline timeout"
    assert done["status"] == "done", f"failed: {done.get('error')}"
    for k in ["agent1_segments", "agent2_legal", "agent3_virality",
              "agent4_personas", "agent5_scripts", "agent6_audience", "agent7_growth"]:
        assert k in done and done[k], f"missing/empty {k}"

    # List (after pipeline completes - server should be free)
    r = requests.get(f"{BASE_URL}/api/analyses", headers=auth["headers"], timeout=30)
    assert r.status_code == 200
    assert any(it["analysis_id"] == aid for it in r.json()["items"])

    # Delete
    r = requests.delete(f"{BASE_URL}/api/analyses/{aid}", headers=auth["headers"])
    assert r.status_code == 200
    assert r.json().get("deleted") == 1
