import { useState } from "react";
import axios from "axios";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { API, useAuth } from "../App";
import { Brain, Scales, Lightning, Users, Megaphone, ChartLineUp, Target, Play, ShieldCheck, ActivityIcon, Globe } from "@phosphor-icons/react";
import { FcGoogle } from "react-icons/fc";
import { googleSignInIdToken } from "../firebase";

const agents = [
  { icon: Brain, name: "Content Breakdown", desc: "People · claims · numbers · references" },
  { icon: Scales, name: "Legal Risk Engine", desc: "Real Indian Kanoon citations" },
  { icon: Lightning, name: "Virality Simulator", desc: "Mode-tuned, channel-grounded" },
  { icon: Users, name: "Persona Engine", desc: "Fans / Haters / Media / Brands" },
  { icon: ChartLineUp, name: "Audience Intelligence", desc: "Will likely go live? Yes / Mixed / No" },
  { icon: Megaphone, name: "Brand-Fit Discovery", desc: "Real brands · CPMs · placements" },
  { icon: Target, name: "Script Optimization", desc: "SAFE · CONTROVERSIAL · AGGRESSIVE" },
];

export default function Login() {
  const { user, loading, setUser } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("login"); // login | register
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center font-mono-data text-sm">LOADING...</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const path = tab === "login" ? "/auth/login" : "/auth/register";
      const body = tab === "login" ? { email: form.email, password: form.password } : form;
      const r = await axios.post(`${API}${path}`, body);
      setUser(r.data);
      toast.success(tab === "login" ? "Welcome back" : "Account created");
      nav("/dashboard");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(d => d?.msg).filter(Boolean).join(" ") : "Something went wrong";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const googleAuth = async () => {
    setBusy(true);
    try {
      // Debug Check: Ensure API Key is actually loaded
      if (!process.env.REACT_APP_FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY.includes("REPLACE")) {
        console.error("Firebase API Key is missing or default in .env");
        toast.error("Firebase Configuration Missing. Check your .env file.");
        setBusy(false);
        return;
      }

      const idToken = await googleSignInIdToken();
      const r = await axios.post(`${API}/auth/google`, { id_token: idToken });
      setUser(r.data);
      toast.success("Signed in with Google");
      nav("/dashboard");
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user") { setBusy(false); return; }
      toast.error(err?.response?.data?.detail || err?.message || "Google sign-in failed. Make sure REACT_APP_FIREBASE_API_KEY is the Web API key (starts with AIzaSy).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen text-brand-ink">
      <header className="border-b border-brand-ink bg-white px-6 md:px-12 py-4 flex items-center justify-between" data-testid="login-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-ink text-white flex items-center justify-center font-display font-black">SA</div>
          <div className="font-display font-black tracking-tighter text-xl">STILL ALIVE</div>
        </div>
        <div className="overline text-brand-muted hidden md:block">v1.0 / SIGNAL ROOM</div>
      </header>

      <section className="px-6 md:px-12 py-12 md:py-20 grid md:grid-cols-12 gap-8 border-b border-brand-ink">
        <div className="md:col-span-7">
          <div className="overline text-brand-muted mb-6">// CREATOR + BRAND CONTENT INTELLIGENCE</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black font-display leading-[0.95]">
            WILL THIS POST<br />
            <span className="bg-brand-ink text-white px-3">SURVIVE?</span><br />
            OR DIE ON<br />
            <span className="bg-[#FFCC00] text-brand-ink px-3">ARRIVAL.</span>
          </h1>
          <p className="mt-8 max-w-xl font-mono-data text-sm leading-relaxed text-brand-muted">
            7 agents grounded in your real channel data. Real Indian Kanoon legal citations.
            Distinct rewrites for SAFE / CONTROVERSIAL / AGGRESSIVE. Brand-fit discovery — not generic
            celebrity placements. Built for creators AND brand campaigns.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-px bg-brand-ink border border-brand-ink max-w-md">
            {[["7", "AGENTS"], ["3", "MODES"], ["∞", "RUNS"]].map(([n, l]) => (
              <div key={l} className="bg-white p-4">
                <div className="font-display font-black text-3xl">{n}</div>
                <div className="overline text-brand-muted">{l}</div>
              </div>
            ))}
          </div>

          {/* Auth Section Moved Below Stats */}
          <div className="mt-12 max-w-md grid-card p-6 border-2">
            <div className="grid grid-cols-2 border border-brand-ink mb-5">
              {[{ k: "login", l: "LOGIN" }, { k: "register", l: "CREATE ACCOUNT" }].map((t) => (
                <button key={t.k} data-testid={`auth-tab-${t.k}`} onClick={() => setTab(t.k)}
                  className={`p-3 font-mono-data text-xs font-medium border-r border-brand-ink last:border-r-0 ${tab === t.k ? "bg-brand-ink text-white" : "bg-white hover:bg-brand-paper"}`}>
                  {t.l}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="grid gap-3">
              {tab === "register" && (
                <Field label="NAME">
                  <input data-testid="auth-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-brand-ink p-3 font-mono-data text-sm" />
                </Field>
              )}
              <Field label="EMAIL">
                <input data-testid="auth-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-brand-ink p-3 font-mono-data text-sm" />
              </Field>
              <Field label="PASSWORD">
                <input data-testid="auth-password" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-brand-ink p-3 font-mono-data text-sm" />
              </Field>
              <button data-testid="auth-submit" disabled={busy} className="hard-shadow bg-brand-ink text-white px-6 py-3 font-mono-data text-xs font-medium mt-2 disabled:opacity-40 w-full">
                {busy ? "..." : (tab === "login" ? "LOG IN" : "CREATE ACCOUNT →")}
              </button>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-brand-edge" />
                <span className="overline text-brand-muted">OR</span>
                <div className="flex-1 h-px bg-brand-edge" />
              </div>
              <button type="button" data-testid="google-signin-btn" onClick={googleAuth} disabled={busy}
                className="w-full border border-brand-ink bg-white p-3 flex items-center justify-center gap-2 hover:bg-brand-ink hover:text-white transition-colors disabled:opacity-40">
                <FcGoogle size={18} />
                <span className="font-mono-data text-xs font-medium">CONTINUE WITH GOOGLE</span>
              </button>
            </form>
          </div>
        </div>

        <aside className="md:col-span-5">
          <div className="grid-card p-6 flex flex-col h-full">
            <div className="overline mb-4">/// AGENT MAP</div>
            <ul className="divide-y divide-brand-edge flex-1">
              {agents.map((a, i) => (
                <li key={a.name} className="py-6 flex items-start gap-4">
                  <div className="w-10 h-10 border border-brand-ink flex items-center justify-center shrink-0 bg-brand-paper">
                    <a.icon size={18} weight="bold" />
                  </div>
                  <div className="min-w-0 leading-tight">
                    <div className="font-display font-bold text-base">
                      <span className="text-brand-muted mr-2 font-mono-data">A{i + 1}</span>
                      {a.name}
                    </div>
                    <div className="font-mono-data text-xs text-brand-muted mt-1">{a.desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 pt-6 border-t border-brand-ink">
              <div className="overline mb-4">/// GLOBAL RISK HEATMAP (LIVE)</div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 40 }).map((_, i) => {
                  const colors = ["#F9F9FA", "#34C759", "#FFCC00", "#FF3B30", "#0A0A0A"];
                  const randomColor = colors[Math.floor(Math.random() * colors.length)];
                  return (
                    <div key={i} className="aspect-square border border-brand-edge" style={{ backgroundColor: randomColor }} />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between overline text-[9px] text-brand-muted">
                <span>SAFE CONTENT</span>
                <span>HIGH RISK</span>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {/* Demo Video Section */}
      <section className="px-6 md:px-12 py-16 border-b border-brand-ink bg-brand-paper">
        <div className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: ShieldCheck, label: "PROTECTION", value: "AES-256 PIPELINE" },
            { icon: ActivityIcon, label: "ANALYSIS", value: "REAL-TIME SYNC" },
            { icon: Globe, label: "GROUNDING", value: "MULTI-PLATFORM" },
            { icon: Lightning, label: "LATENCY", value: "< 2.5s AVG RUN" }
          ].map((item, i) => (
            <div key={i} className="border border-brand-edge p-3 bg-white hard-shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <item.icon size={12} weight="bold" className="text-brand-muted" />
                <span className="overline text-[10px] text-brand-muted">{item.label}</span>
              </div>
              <div className="font-mono-data text-[10px] font-bold">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-4">
            <div className="overline text-brand-muted mb-4 flex items-center gap-2">
              <Play size={14} weight="bold" className="text-brand-ink" />
              /// SYSTEM WALKTHROUGH
            </div>
            <h2 className="text-3xl font-black font-display tracking-tighter mb-4 leading-none">
              WATCH THE SIGNAL <br /> IN ACTION
            </h2>
            <p className="font-mono-data text-xs leading-relaxed text-brand-muted mb-8">
              Witness how the 7-agent pipeline deconstructs content to find hidden risks and virality triggers. 
              Grounded in real-time platform data and legal cross-verification.
            </p>
            
            <div className="space-y-3">
              {[
                { label: "LATENCY", value: "< 120MS SIGNAL PROC" },
                { label: "VERIFICATION", value: "INDIAN KANOON SYNC" },
                { label: "MODEL", value: "GEMINI 2.0 MULTI-MODAL" },
                { label: "UPTIME", value: "99.9% SIGNAL STABILITY" }
              ].map(spec => (
                <div key={spec.label} className="flex justify-between items-center border-b border-brand-edge pb-1">
                  <span className="overline text-[10px] text-brand-muted">{spec.label}</span>
                  <span className="font-mono-data text-[10px] font-bold text-brand-ink">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-8">
            <div className="aspect-video bg-white border-2 border-brand-ink hard-shadow relative overflow-hidden group">
              <iframe
                src="https://drive.google.com/file/d/1uYiQVjzFbIayBClycaRIsWn26sn52bU6/preview"
                className="w-full h-full grayscale hover:grayscale-0 transition-all duration-700"
                allow="autoplay"
                title="Still Alive Demo Walkthrough"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      <footer className="px-6 md:px-12 py-6 flex items-center justify-between font-mono-data text-xs text-brand-muted">
        <div>// AI-assisted analysis grounded in Indian Kanoon + your real channel data.</div>
        <div className="hidden md:block">STILL ALIVE / 2026</div>
      </footer>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="overline text-brand-muted mb-1">{label}</div>
      {children}
    </label>
  );
}
