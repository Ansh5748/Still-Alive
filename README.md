# Still Alive — Creator + Brand Intelligence

An AI-powered multi-agent intelligence platform for creators and brands to analyze content virality, detect legal risks, and optimize growth. Powered by **TrueForge** open-source local agent harness.

---

## ⚡ TrueForge Quick Start

Run local agent subagents, MCP tools, and sandboxed sessions with a single command:

```bash
# Launch TrueForge Local Agent Harness
npx @truefoundry/trueforge

# Or via npm script
npm run trueforge
```

TrueForge uses [`trueforge.config.json`](file:///c:/Users/Divyansh%20Gupta/OneDrive/Desktop/still-alive/trueforge.config.json) configured with our 7-agent pipeline, subagents, and persistent sessions.

---

## 🤖 AI Model Providers & Auto-Fallback Engine

Still Alive runs on **TrueForge** open-source agent harness and supports **OpenAI Direct** (primary, using OpenAI credits) with automatic fallback to **Gemini Direct** (`gemini-2.5-flash` / `gemini-2.5-flash-lite`).

### Provider Configuration (`backend/.env`)

Configure your keys in `backend/.env`:

```env
# 1. Direct OpenAI API Key (Primary for OpenAI credits)
OPENAI_API_KEY=your_openai_api_key

# 2. Direct Gemini API Key (Fallback engine with Gemini 2.5 Flash / Flash Lite)
GEMINI_API_KEY=your_gemini_api_key

# Provider mode: "auto" | "openai" | "gemini"
LLM_PROVIDER="auto"
```

> 💡 **Auto-Fallback Priority**: In `"auto"` mode, Still Alive routes requests through **OpenAI Direct** → **Gemini Direct**. If OpenAI is unavailable or hits rate limits (`429`), the system seamlessly switches to Gemini Direct without missing a beat.

---

## 🚀 Local Setup

### 1. Backend Setup (FastAPI)
Navigate to the backend directory, activate the virtual environment, and start the server:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload
```
The backend will be available at `http://localhost:8000`.

### 2. Frontend Setup (React + CRACO)
Navigate to the frontend directory, install dependencies, and start the development server:

```powershell
cd frontend
npm install ajv@^8.0.0 ajv-keywords@^5.0.0 --legacy-peer-deps
npm install --legacy-peer-deps
npm start
```
The frontend will be available at `http://localhost:3000`.

---

## ☁️ Deployment

### 1. AWS Deployment (AWS Credits / App Runner / ECS)
To deploy Still Alive on AWS using hackathon AWS credits:

1. **Build & Push Docker Container**:
   ```bash
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com
   docker build -t still-alive-backend ./backend
   docker tag still-alive-backend:latest <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/still-alive-backend:latest
   docker push <aws_account_id>.dkr.ecr.us-east-1.amazonaws.com/still-alive-backend:latest
   ```

2. **AWS App Runner / ECS**:
   - Create a service pointing to ECR image `still-alive-backend:latest`.
   - Set Port: `8000`.
   - Add Environment Variables (`MONGO_URL`, `TRUEFOUNDRY_API_KEY`, `TRUEFOUNDRY_GATEWAY_URL`, `GEMINI_API_KEY`, `JWT_SECRET`).

### 2. Render Deployment (Docker Setup)
1. **Runtime**: Select "Docker".
2. **Build/Start**: Render uses `backend/Dockerfile`.

---

## 📁 Project Structure
- `/trueforge.config.json`: TrueForge local harness config (subagents, sandboxing, session storage).
- `/backend`: FastAPI application, multi-provider agent pipeline (`backend/agents.py`), and MongoDB integration.
- `/frontend`: React dashboard styled with Tailwind CSS and CRACO.

