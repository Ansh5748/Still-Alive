import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { API, useAuth } from "../App";
import AppHeader from "../components/AppHeader";
import { Upload, Link as LinkIcon, FileText, ArrowRight, Trash, User, Briefcase } from "@phosphor-icons/react";

const AUDIENCE = ["students", "traders", "gamers", "founders", "professionals", "homemakers", "general", "custom"];
const NICHES = ["finance", "education", "comedy", "motivation", "tech", "fitness", "gaming", "lifestyle", "fashion", "food", "automotive", "news", "custom"];
const INTENTS = ["educational", "podcast", "ads", "promotion", "story", "entertainment", "tutorial", "review", "custom"];
const PLATFORMS = [
  { k: "youtube", l: "YouTube" },
  { k: "instagram", l: "Instagram" },
  { k: "x", l: "X (Twitter)" },
  { k: "linkedin", l: "LinkedIn" },
  { k: "facebook", l: "Facebook" },
  { k: "threads", l: "Threads" },
];
const MODES = [
  { key: "SAFE", color: "bg-brand-safe", text: "text-brand-ink", desc: "Legally clean. Brand friendly." },
  { key: "CONTROVERSIAL", color: "bg-brand-contro", text: "text-brand-ink", desc: "Debate-driven. Curiosity hooks." },
  { key: "AGGRESSIVE", color: "bg-brand-aggro", text: "text-white", desc: "High virality. High risk." },
];

const EMPTY = {
  title: "", subject_type: "creator", platform: "youtube",
  audience_type: "general", demographics: "", niche: "education", intent: "educational",
  mode: "SAFE", content_text: "", content_url: "",
  brand_name: "", campaign_goal: "",
};

export default function Dashboard() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const editPrefill = loc.state?.edit;
  const [tab, setTab] = useState(editPrefill?.content_url ? "url" : "text");
  const [form, setForm] = useState(() => editPrefill ? { ...EMPTY, ...editPrefill } : EMPTY);
  // Custom field overrides — when user picks "custom", they enter free text
  const initCustom = (val, options) => (val && !options.includes(val) ? val : "");
  const [customAudience, setCustomAudience] = useState(initCustom(editPrefill?.audience_type, AUDIENCE));
  const [customNiche, setCustomNiche] = useState(initCustom(editPrefill?.niche, NICHES));
  const [customIntent, setCustomIntent] = useState(initCustom(editPrefill?.intent, INTENTS));
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [billing, setBilling] = useState(null);
  const profileOk = !!(user?.socials?.youtube || user?.socials?.instagram);
  const planActive = !!billing?.features?.active || user?.role === "admin";
  const channelMap = user?.channel_context_map || {};
  const groundedFor = (p) => !!channelMap[p];

  // Sync display values when user picks an option vs "custom"
  const dispAudience = AUDIENCE.includes(form.audience_type) ? form.audience_type : "custom";
  const dispNiche = NICHES.includes(form.niche) ? form.niche : "custom";
  const dispIntent = INTENTS.includes(form.intent) ? form.intent : "custom";

  useEffect(() => {
    if (dispAudience === "custom" && !customAudience && !AUDIENCE.includes(form.audience_type)) {
      setCustomAudience(form.audience_type);
    }
    // eslint-disable-next-line
  }, []);

  const loadHistory = async () => {
    try { const r = await axios.get(`${API}/analyses`); setHistory(r.data.items || []); } catch {}
  };
  const loadBilling = async () => {
    try { const r = await axios.get(`${API}/billing/me`); setBilling(r.data); } catch {}
  };
  useEffect(() => { 
    loadHistory(); 
    loadBilling(); 
    const t = setInterval(async () => {
      // Use a functional update check to avoid dependency loop
      setHistory(current => {
        const hasRunning = current.some(it => it.status === "running" || it.status === "pending");
        if (hasRunning) loadHistory();
        return current;
      });
    }, 15000); // 15s is safer for cloud deployments
    return () => clearInterval(t); 
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const finalAudience = () => dispAudience === "custom" ? (customAudience || "general") : form.audience_type;
  const finalNiche = () => dispNiche === "custom" ? (customNiche || "general") : form.niche;
  const finalIntent = () => dispIntent === "custom" ? (customIntent || "educational") : form.intent;

  const submit = async () => {
    if (!profileOk) { toast.error("Add Instagram or YouTube in your profile first"); nav("/profile"); return; }
    setSubmitting(true);
    try {
      const finalForm = {
        ...form,
        audience_type: finalAudience(),
        niche: finalNiche(),
        intent: finalIntent(),
      };
      let res;
      if (editPrefill?.analysis_id) {
        const payload = { ...finalForm };
        if (tab === "text") payload.content_url = "";
        if (tab === "url") payload.content_text = "";
        res = await axios.post(`${API}/analyses/${editPrefill.analysis_id}/rerun`, payload);
        toast.success("Re-running analysis");
        nav(`/analysis/${editPrefill.analysis_id}`, { replace: true });
        return;
      }
      if (tab === "upload") {
        if (!file) { toast.error("Pick an audio/video file"); setSubmitting(false); return; }
        const fd = new FormData();
        fd.append("file", file);
        Object.entries(finalForm).forEach(([k, v]) => { if (k !== "content_text" && k !== "content_url" && v) fd.append(k, v); });
        res = await axios.post(`${API}/analyses/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        const payload = { ...finalForm };
        if (tab === "text") payload.content_url = "";
        if (tab === "url") payload.content_text = "";
        res = await axios.post(`${API}/analyses`, payload);
      }
      toast.success("Analysis started");
      nav(`/analysis/${res.data.analysis_id}`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to start analysis");
      const status = e?.response?.status;
      if (status === 412) nav("/profile");
      if (status === 402 || status === 403 || status === 429) nav("/plans");
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = async (id) => {
    try { await axios.delete(`${API}/analyses/${id}`); loadHistory(); toast.success("Deleted"); } catch {}
  };

  const activeMode = MODES.find((m) => m.key === form.mode);
  const isBrand = form.subject_type === "brand";
  const isEdit = !!editPrefill?.analysis_id;

  return (
    <div>
      <AppHeader />
      <main className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
        {!profileOk && (
          <div className="mb-4 p-4 grid-card hard-shadow flex items-center justify-between" data-testid="profile-banner">
            <div className="font-mono-data text-xs">⚠ Add your YouTube or Instagram in <Link to="/profile" className="underline font-bold">Profile</Link> before running analyses.</div>
            <Link to="/profile" className="bg-brand-ink text-white px-3 py-2 font-mono-data text-xs">OPEN PROFILE</Link>
          </div>
        )}
        {profileOk && !planActive && (
          <div className="mb-4 p-4 bg-brand-contro border border-brand-ink flex items-center justify-between" data-testid="plan-banner">
            <div className="font-mono-data text-xs">⚠ No active subscription. Pick a plan to run analyses.</div>
            <Link to="/plans" className="bg-brand-ink text-white px-3 py-2 font-mono-data text-xs">VIEW PLANS</Link>
          </div>
        )}
        {planActive && billing?.features?.monthly_runs > 0 && (
          <div className="mb-4 p-3 grid-card-soft flex items-center justify-between" data-testid="usage-banner">
            <div className="font-mono-data text-xs text-brand-muted">
              PLAN: <b className="text-brand-ink">{billing.features.plan_id?.toUpperCase()}</b> · USED {billing.runs_used}/{billing.features.monthly_runs === -1 ? "∞" : billing.features.monthly_runs} this period
            </div>
            <Link to="/plans" className="overline text-brand-muted hover:text-brand-ink">UPGRADE →</Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-8 grid-card animate-fade-up" data-testid="compose-card">
            <div className="border-b border-brand-ink p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="overline text-brand-muted">{isEdit ? `/// EDIT · ${editPrefill.analysis_id}` : "/// NEW ANALYSIS"}</div>
                <h2 className="font-display font-black text-2xl tracking-tight mt-1">{isEdit ? "EDIT & RE-RUN" : "COMPOSE & ANALYZE"}</h2>
              </div>
              <div className={`px-3 py-2 ${activeMode.color} ${activeMode.text} font-mono-data text-xs font-medium`}>
                MODE / {form.mode}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-brand-ink mb-2">
              {[
                { k: "creator", l: "CREATOR", I: User },
                { k: "brand", l: "BRAND CAMPAIGN", I: Briefcase },
              ].map(({ k, l, I }) => (
                <button key={k} data-testid={`subject-${k}`} onClick={() => set("subject_type", k)}
                  className={`p-4 flex items-center justify-center gap-2 font-mono-data text-xs font-medium border-r border-brand-ink last:border-r-0 ${form.subject_type === k ? "bg-brand-ink text-white" : "bg-white hover:bg-brand-paper"}`}>
                  <I size={14} weight="bold" /> {l}
                </button>
              ))}
            </div>

            <div className="px-5 py-3 border-b border-brand-ink bg-brand-paper">
              <div className="overline text-brand-muted">
                {isBrand
                  ? "// BRAND mode — analyses adapt for campaign posts, not creator content"
                  : "// CREATOR mode — analyses tuned to your channel voice (channel intel managed in Profile)"}
              </div>
            </div>

            <div className="grid grid-cols-3 border-b border-brand-ink">
              {[
                { k: "text", l: isBrand ? "POST / SCRIPT" : "SCRIPT", I: FileText },
                { k: "url", l: "URL", I: LinkIcon },
                { k: "upload", l: "AUDIO / VIDEO", I: Upload },
              ].map(({ k, l, I }) => (
                <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
                  className={`p-4 flex items-center justify-center gap-2 font-mono-data text-xs font-medium border-r border-brand-ink last:border-r-0 ${tab === k ? "bg-brand-ink text-white" : "bg-white hover:bg-brand-paper"}`}>
                  <I size={14} weight="bold" /> {l}
                </button>
              ))}
            </div>

            <div className="p-5 grid gap-5">
              {tab === "text" && (
                <div>
                  <label className="overline text-brand-muted">{isBrand ? "POST / CAMPAIGN COPY" : "SCRIPT / CONTENT (any language)"}</label>
                  <textarea data-testid="content-text" value={form.content_text}
                    onChange={(e) => set("content_text", e.target.value)}
                    placeholder="Paste your script in any language — Hindi, English, Tamil, Hinglish all preserved..."
                    rows={8} className="w-full mt-2 border border-brand-ink p-3 font-mono-data text-sm" />
                </div>
              )}
              {tab === "url" && (
                <div>
                  <label className="overline text-brand-muted">YOUTUBE / INSTAGRAM / X URL</label>
                  <input data-testid="content-url" value={form.content_url}
                    onChange={(e) => set("content_url", e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full mt-2 border border-brand-ink p-3 font-mono-data text-sm" />
                </div>
              )}
              {tab === "upload" && (
                <div>
                  <label className="overline text-brand-muted">AUDIO / VIDEO (max 25MB) — auto-transcribed in original language</label>
                  <div className="mt-2 border border-dashed border-brand-ink p-6 flex flex-col items-center gap-3">
                    <input data-testid="content-file" type="file"
                      accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="font-mono-data text-xs" />
                    {file && <div className="font-mono-data text-xs">SELECTED: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)</div>}
                  </div>
                </div>
              )}

              {isBrand && (
                <div className="grid md:grid-cols-2 gap-4 p-4 border border-brand-ink bg-brand-paper">
                  <Field label="BRAND NAME">
                    <input data-testid="field-brand" value={form.brand_name} onChange={(e) => set("brand_name", e.target.value)}
                      placeholder="e.g. Boat Lifestyle" className="w-full border border-brand-ink p-2 font-mono-data text-sm" />
                  </Field>
                  <Field label="CAMPAIGN GOAL">
                    <input data-testid="field-goal" value={form.campaign_goal} onChange={(e) => set("campaign_goal", e.target.value)}
                      placeholder="e.g. Diwali sale awareness" className="w-full border border-brand-ink p-2 font-mono-data text-sm" />
                  </Field>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="TITLE (optional)">
                  <input data-testid="field-title" value={form.title} onChange={(e) => set("title", e.target.value)}
                    className="w-full border border-brand-ink p-2 font-mono-data text-sm" />
                </Field>
                <Field label={`PLATFORM ${groundedFor(form.platform) ? "· channel intel synced ✓" : ""}`}>
                  <select data-testid="field-platform" value={form.platform} onChange={(e) => set("platform", e.target.value)}
                    className="w-full border border-brand-ink p-2 font-mono-data text-sm bg-white">
                    {PLATFORMS.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}
                  </select>
                </Field>
                <Field label="INTENT">
                  <select data-testid="field-intent" value={dispIntent}
                    onChange={(e) => set("intent", e.target.value)}
                    className="w-full border border-brand-ink p-2 font-mono-data text-sm bg-white">
                    {INTENTS.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  {dispIntent === "custom" && (
                    <input data-testid="field-intent-custom" value={customIntent} onChange={(e) => setCustomIntent(e.target.value)}
                      placeholder="Custom intent..." className="w-full mt-2 border border-brand-ink p-2 font-mono-data text-sm" />
                  )}
                </Field>
                <Field label="DEMOGRAPHICS">
                  <input data-testid="field-demo" value={form.demographics} onChange={(e) => set("demographics", e.target.value)}
                    placeholder="18-24, India, Hindi" className="w-full border border-brand-ink p-2 font-mono-data text-sm" />
                </Field>
                <Field label="AUDIENCE TYPE">
                  <select data-testid="field-audience" value={dispAudience}
                    onChange={(e) => set("audience_type", e.target.value)}
                    className="w-full border border-brand-ink p-2 font-mono-data text-sm bg-white">
                    {AUDIENCE.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  {dispAudience === "custom" && (
                    <input data-testid="field-audience-custom" value={customAudience} onChange={(e) => setCustomAudience(e.target.value)}
                      placeholder="Custom audience..." className="w-full mt-2 border border-brand-ink p-2 font-mono-data text-sm" />
                  )}
                </Field>
                <Field label="NICHE">
                  <select data-testid="field-niche" value={dispNiche}
                    onChange={(e) => set("niche", e.target.value)}
                    className="w-full border border-brand-ink p-2 font-mono-data text-sm bg-white">
                    {NICHES.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  {dispNiche === "custom" && (
                    <input data-testid="field-niche-custom" value={customNiche} onChange={(e) => setCustomNiche(e.target.value)}
                      placeholder="Custom niche..." className="w-full mt-2 border border-brand-ink p-2 font-mono-data text-sm" />
                  )}
                </Field>
                <Field label="OPTIMIZATION MODE">
                  <div className="grid grid-cols-3 gap-0 border border-brand-ink">
                    {MODES.map((m) => (
                      <button key={m.key} data-testid={`mode-${m.key.toLowerCase()}`} onClick={() => set("mode", m.key)}
                        className={`p-2 font-mono-data text-xs font-medium border-r border-brand-ink last:border-r-0 ${form.mode === m.key ? `${m.color} ${m.text}` : "bg-white hover:bg-brand-paper"}`}>
                        {m.key}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="font-mono-data text-xs text-brand-muted max-w-md">{activeMode.desc} • Output preserves source language. Core meaning preserved across rewrites.</p>
                <button data-testid="run-analysis-btn" onClick={submit} disabled={submitting}
                  className="hard-shadow bg-brand-ink text-white px-6 py-3 font-mono-data text-xs font-medium flex items-center gap-2 disabled:opacity-40">
                  {submitting ? "STARTING..." : (isEdit ? "RE-RUN ANALYSIS" : "RUN 7-AGENT ANALYSIS")}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          </section>

          <aside className="lg:col-span-4 grid-card-soft animate-fade-up" data-testid="history-card">
            <div className="border-b border-brand-edge p-5">
              <div className="overline text-brand-muted">/// HISTORY</div>
              <h3 className="font-display font-black text-xl tracking-tight mt-1">PAST RUNS</h3>
            </div>
            <ul className="divide-y divide-brand-edge max-h-[700px] overflow-y-auto">
              {history.length === 0 && (
                <li className="p-5 font-mono-data text-xs text-brand-muted">No runs yet.</li>
              )}
              {history.map((it) => (
                <li key={it.analysis_id} className="p-4 hover:bg-brand-paper">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/analysis/${it.analysis_id}`} className="flex-1 min-w-0" data-testid={`history-${it.analysis_id}`}>
                      <div className="font-display font-bold text-sm truncate">{it.title}</div>
                      <div className="overline text-brand-muted mt-1">{it.subject_type || "creator"} · {it.platform} · {it.niche} · {it.mode}</div>
                      <div className="font-mono-data text-[10px] mt-1">
                        <StatusPill status={it.status} progress={it.progress} />
                      </div>
                    </Link>
                    <button onClick={() => removeItem(it.analysis_id)} className="p-1 hover:bg-brand-aggro hover:text-white" data-testid={`delete-${it.analysis_id}`}>
                      <Trash size={14} weight="bold" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="overline text-brand-muted mb-2">{label}</div>
      {children}
    </label>
  );
}
function StatusPill({ status, progress }) {
  if (status === "done") return <span className="bg-brand-safe text-brand-ink px-2 py-0.5">DONE</span>;
  if (status === "failed") return <span className="bg-brand-aggro text-white px-2 py-0.5">FAILED</span>;
  return <span className="bg-brand-ink text-white px-2 py-0.5">RUNNING {progress || 0}%</span>;
}
