import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API } from "../App";
import AppHeader from "../components/AppHeader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Warning, ShieldCheck, Lightning, Users, Megaphone, ChartLineUp, FileText,
  ArrowsClockwise, Copy, PencilSimple, ArrowSquareOut, Briefcase, User
} from "@phosphor-icons/react";
import { toast } from "sonner";

const AVATARS = [
  "https://images.unsplash.com/photo-1758600435259-be2dc35a7ae2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwzfHxwb3J0cmFpdCUyMGhlYWRzaG90JTIwZXhwcmVzc2lvbnxlbnwwfHx8fDE3NzcxMDY1MDF8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1765046300927-6c1827612c42?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxwb3J0cmFpdCUyMGhlYWRzaG90JTIwZXhwcmVzc2lvbnxlbnwwfHx8fDE3NzcxMDY1MDF8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1770210982264-c0605c507eb4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwyfHxwb3J0cmFpdCUyMGhlYWRzaG90JTIwZXhwcmVzc2lvbnxlbnwwfHx8fDE3NzcxMDY1MDF8MA&ixlib=rb-4.1.0&q=85",
  "https://images.pexels.com/photos/32721690/pexels-photo-32721690.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

const RISK_COLOR = { Low: "#34C759", Medium: "#FFCC00", High: "#FF3B30", low: "#34C759", medium: "#FFCC00", high: "#FF3B30" };
const OUTCOME_COLOR = { "WILL LIKELY GO LIVE WELL": "#34C759", "MIXED": "#FFCC00", "UNDERPERFORM": "#FF3B30" };

export default function AnalysisView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [pollErr, setPollErr] = useState(false);
  const [scriptTab, setScriptTab] = useState("balanced");
  const [reRunningAgent, setReRunningAgent] = useState(null);

  const loadAnalysis = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/analyses/${id}`, { timeout: 15000 });
      setA(r.data);
      setPollErr(false);
    } catch (e) {
      setPollErr(true);
    }
  }, [id]);

  useEffect(() => {
    loadAnalysis();
    const t = setInterval(() => {
      setA(prev => {
        if (prev && (prev.status === "running" || prev.status === "pending")) {
          setTimeout(loadAnalysis, 0);
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(t);
  }, [id, loadAnalysis]);

  const handleRerunAgent = async (agentId) => {
    if (reRunningAgent) return;
    setReRunningAgent(agentId);

    const agentKeyMap = {
      agent1: "agent1_segments",
      agent2: "agent2_legal",
      agent3: "agent3_virality",
      agent4: "agent4_personas",
      agent5: "agent5_scripts",
      agent6: "agent6_audience",
      agent7: "agent7_growth",
    };
    const targetKey = agentKeyMap[agentId];

    // Immediately clear target agent's data in local state `a` so ONLY this card shows loading state!
    setA(prev => {
      if (!prev) return prev;
      const emptyVal = ["agent4_personas", "agent5_scripts", "agent6_audience", "agent7_growth"].includes(targetKey) ? {} : [];
      return {
        ...prev,
        [targetKey]: emptyVal
      };
    });

    try {
      toast.info(`Re-running ${agentId.toUpperCase()}...`);
      await axios.post(`${API}/analyses/${id}/rerun_agent/${agentId}`);

      // Active polling while agent is re-running
      const startTime = Date.now();
      const pollTimer = setInterval(async () => {
        try {
          const r = await axios.get(`${API}/analyses/${id}`, { timeout: 10000 });
          const freshData = r.data[targetKey];

          const hasData = freshData && (
            (Array.isArray(freshData) && freshData.length > 0) ||
            (typeof freshData === "object" && Object.keys(freshData).length > 0) ||
            (targetKey === "agent2_legal" && Array.isArray(freshData))
          );

          if (hasData || (Date.now() - startTime > 45000)) {
            clearInterval(pollTimer);
            setA(r.data);
            setReRunningAgent(null);
            if (hasData) {
              toast.success(`${agentId.toUpperCase()} updated!`);
            } else {
              toast.warning(`${agentId.toUpperCase()} completed without output.`);
            }
          } else {
            setA(r.data);
          }
        } catch (err) {
          console.error("Polling error during re-run:", err);
        }
      }, 2000);
    } catch (e) {
      toast.error(`Failed to trigger re-run for ${agentId}: ${e.response?.data?.detail || e.message}`);
      setReRunningAgent(null);
      loadAnalysis();
    }
  };

  // Sync primary script tab when results arrive
  useEffect(() => {
    const p = a?.agent5_scripts?.primary_recommended;
    if (p && ["balanced", "high_viral", "risk_controlled"].includes(p)) {
      setScriptTab(p);
    }
  }, [a?.agent5_scripts?.primary_recommended]);

  const startEdit = () => {
    if (!a) return;
    const prefill = {
      analysis_id: a.analysis_id,
      title: a.title, subject_type: a.subject_type || "creator", platform: a.platform,
      channel_link: a.channel_link || "", audience_type: a.audience_type, demographics: a.demographics || "",
      niche: a.niche, intent: a.intent, mode: a.mode,
      content_text: a.content_text, content_url: a.content_url || "",
      brand_name: a.brand_name || "", campaign_goal: a.campaign_goal || "",
    };
    nav("/dashboard", { state: { edit: prefill } });
  };

  if (!a && !pollErr) return (
    <div><AppHeader /><div className="p-10 font-mono-data text-sm">LOADING ANALYSIS...</div></div>
  );
  if (!a && pollErr) return (
    <div><AppHeader /><div className="p-10"><div className="grid-card hard-shadow inline-block p-6">
      <div className="overline text-brand-muted mb-2">/// BACKEND BUSY</div>
      <div className="font-mono-data text-sm">Pipeline is running — auto-retrying every 3s...</div>
    </div></div></div>
  );

  const isRunning = a.status === "running" || a.status === "pending";
  const segs = a.agent1_segments || [];
  const legal = a.agent2_legal || [];
  const virality = a.agent3_virality || [];
  const personas = a.agent4_personas || {};
  const scripts = a.agent5_scripts || {};
  const audience = a.agent6_audience || {};
  const growth = a.agent7_growth || {};
  const channelCtx = a.channel_context || {};

  const matchScore = Number(audience.match_score || 0);
  const high = legal.filter((l) => /high/i.test(l.risk || "")).length;
  const med = legal.filter((l) => /medium/i.test(l.risk || "")).length;
  const overallRisk = !legal.length ? "—" : high ? "HIGH" : med ? "MEDIUM" : "LOW";

  const viralityChart = virality.map((v) => ({
    seg: v.segment_id,
    virality: Number(v.virality_score || 0),
    backlash: Number(v.backlash_probability || 0),
  }));

  // Set primary script tab from API

  return (
    <div>
      <AppHeader />
      <main className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
        <section className="grid-card animate-fade-up mb-6" data-testid="analysis-header">
          <div className="p-5 flex flex-wrap gap-4 items-start justify-between border-b border-brand-ink">
            <div className="min-w-0">
              <div className="overline text-brand-muted flex items-center gap-2">
                {a.subject_type === "brand" ? <Briefcase size={12} weight="bold" /> : <User size={12} weight="bold" />}
                /// {a.subject_type === "brand" ? "BRAND CAMPAIGN" : "CREATOR"} · {a.analysis_id}
              </div>
              <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter mt-1 truncate">{a.title}</h1>
              <div className="font-mono-data text-xs text-brand-muted mt-2">
                {a.platform.toUpperCase()} · {a.niche.toUpperCase()} · {a.audience_type.toUpperCase()} · INTENT:{a.intent.toUpperCase()}
                {a.brand_name ? ` · BRAND:${a.brand_name.toUpperCase()}` : ""}
              </div>
              {channelCtx.channel && (
                <div className="font-mono-data text-xs mt-2 flex items-center gap-2 flex-wrap">
                  <span className="bg-brand-paper border border-brand-ink px-2 py-0.5">CHANNEL: {channelCtx.channel}</span>
                  {channelCtx.subscriber_count != null && (
                    <span className="overline text-brand-muted">{Number(channelCtx.subscriber_count).toLocaleString()} followers</span>
                  )}
                  {(channelCtx.recent_videos?.length || 0) > 0 && (
                    <span className="overline text-brand-muted">· {channelCtx.recent_videos.length} recent posts grounded</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ModeBadge mode={a.mode} />
              <button data-testid="edit-analysis-btn" onClick={startEdit}
                className="border border-brand-ink px-3 py-2 font-mono-data text-xs hover:bg-brand-ink hover:text-white flex items-center gap-2">
                <PencilSimple size={12} weight="bold" /> EDIT & RE-RUN
              </button>
              <Link to="/dashboard" className="border border-brand-ink px-3 py-2 font-mono-data text-xs hover:bg-brand-ink hover:text-white">← BACK</Link>
            </div>
          </div>

          {isRunning && (
            <div className="p-4 bg-brand-paper border-b border-brand-ink flex items-center gap-3" data-testid="running-banner">
              <ArrowsClockwise size={16} weight="bold" className="animate-spin" />
              <div className="font-mono-data text-xs">RUNNING 7-AGENT PIPELINE · {a.progress || 0}%{pollErr ? " · backend busy, retrying..." : ""}</div>
              <div className="flex-1 h-2 bg-white border border-brand-ink">
                <div className="h-full bg-brand-ink" style={{ width: `${a.progress || 0}%` }} />
              </div>
            </div>
          )}
          {a.status === "failed" && (
            <div className="p-4 bg-brand-aggro text-white font-mono-data text-xs">FAILED: {a.error || "unknown error"}</div>
          )}
          {a.partial_failures?.length > 0 && (
            <div className="p-3 bg-brand-contro text-brand-ink font-mono-data text-xs">
              ⚠ Partial: {a.partial_failures.length} agent(s) had issues. Showing what we got.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-brand-ink border-b border-brand-ink">
            <Kpi label="OVERALL RISK" value={overallRisk} accent={overallRisk === "HIGH" ? "#FF3B30" : overallRisk === "MEDIUM" ? "#FFCC00" : "#34C759"} />
            <Kpi label="AUDIENCE MATCH" value={`${matchScore}%`} accent="#007AFF" />
            <Kpi label="WILL GO LIVE?" value={(audience.predicted_outcome || "—").replace("WILL LIKELY ", "")} accent={OUTCOME_COLOR[audience.predicted_outcome] || "#0A0A0A"} small />
            <Kpi label="VIRAL POTENTIAL" value={virality.length ? `${Math.round(virality.reduce((s, x) => s + Number(x.virality_score || 0), 0) / virality.length)}%` : "—"} accent="#FFCC00" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Legal Heatmap */}
          <Card className="lg:col-span-7" testid="legal-card">
            <CardHeader
              icon={<ShieldCheck size={16} weight="bold" />}
              eyebrow="AGENT 02"
              title="LEGAL + PLATFORM RISK"
              subtitle={`Indian Kanoon · ${a.platform.toUpperCase()} policies`}
              onRerun={() => handleRerunAgent("agent2")}
              isRunning={reRunningAgent === "agent2"}
            />
            <div className="p-5 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent2" ? (
                <AgentLoadingState
                  agent="AGENT 02"
                  title="SCANNING LEGAL & PLATFORM POLICIES"
                  subtitle="Cross-referencing Indian Kanoon sections & platform guidelines..."
                  running={true}
                />
              ) : legal.length === 0 ? (
                <div className="p-4 border border-brand-edge bg-brand-paper/50 flex items-center justify-between flex-wrap gap-2">
                  <div className="font-mono-data text-xs text-brand-muted">
                    ✓ No legal or platform-policy risks flagged in any scene.
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-1 mb-5">
                    {legal.map((l, i) => (
                      <div key={i} title={`${l.segment_id} ${l.risk}`} className="aspect-square border border-brand-ink" style={{ background: RISK_COLOR[l.risk] || "#E4E4E7" }} />
                    ))}
                  </div>
                  <ul className="divide-y divide-brand-edge">
                    {legal.map((l, i) => (
                      <li key={i} className="py-3" data-testid={`legal-item-${i}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono-data text-xs bg-brand-ink text-white px-2 py-0.5">{l.segment_id}</span>
                          <span className="font-mono-data text-xs px-2 py-0.5" style={{ background: RISK_COLOR[l.risk], color: /high/i.test(l.risk) ? "#fff" : "#0A0A0A" }}>{(l.risk || "").toUpperCase()}</span>
                          <span className="overline text-brand-muted">{l.violation_type}</span>
                          <span className={`ml-auto font-mono-data text-[10px] px-2 py-0.5 ${l.cross_check === "Verified" ? "bg-brand-safe text-brand-ink" : "bg-brand-edge"}`}>
                            {l.cross_check || "—"}
                          </span>
                        </div>
                        {l.risky_line && (
                          <div className="font-mono-data text-xs bg-brand-paper border-l-2 border-brand-aggro pl-2 py-1 my-1">"{l.risky_line}"</div>
                        )}
                        <div className="font-display font-bold text-sm">{l.law_name} · {l.section}</div>
                        {l.platform_rule && <div className="overline text-brand-muted mt-1">PLATFORM RULE: {l.platform_rule}</div>}
                        <div className="font-mono-data text-xs text-brand-muted mt-1">{l.explanation}</div>
                        <div className="font-mono-data text-[10px] text-brand-muted mt-1">
                          REPORT {l.prob_report || 0}% · STRIKE {l.prob_strike || 0}% · NOTICE {l.prob_legal_notice || 0}% · CONF {l.confidence}
                        </div>
                        {(l.citations || []).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {(l.citations || []).slice(0, 3).map((c, j) => (
                              <a key={j} href={c.url} target="_blank" rel="noreferrer"
                                className="block font-mono-data text-[10px] hover:bg-brand-ink hover:text-white p-1 -ml-1 transition-colors">
                                <ArrowSquareOut size={10} weight="bold" className="inline mr-1" />
                                <span dangerouslySetInnerHTML={{ __html: (c.title || "").replace(/<\/?b>/g, "") }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  
                  <div className="mt-8 pt-6 border-t border-brand-ink">
                    <div className="overline text-brand-muted mb-4">/// REGULATORY GUARDRAILS</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { l: "ASC DATA PRIVACY", d: "Automated PII detection for Indian DPDP Act compliance.", v: 90, c: "bg-brand-safe" },
                        { l: "IP PROTECTION", d: "Scanning for potential Copyright / Fair Use boundary violations.", v: 75, c: "bg-brand-safe" },
                        { l: "COMMUNITY STANDARDS", d: "Platform-specific cross-check for shadow-ban triggers.", v: 100, c: "bg-brand-safe" },
                        { l: "CLAIM VERIFICATION", d: "Verifying factual claims against verified databases.", v: 40, c: "bg-brand-contro" }
                      ].map((item) => (
                        <div key={item.l} className="border border-brand-edge p-3 bg-brand-paper">
                          <div className="font-display font-bold text-xs mb-1">{item.l}</div>
                          <div className="font-mono-data text-[10px] text-brand-muted line-clamp-2">{item.d}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1 flex-1 bg-white border border-brand-edge">
                              <div className="h-full transition-all duration-500" style={{ width: `${item.v}%`, backgroundColor: item.c === 'bg-brand-safe' ? '#34C759' : '#FFCC00' }} />
                            </div>
                            <span className="font-mono-data text-[10px]">{item.v}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="font-mono-data text-[10px] text-brand-muted mt-4">// Real Indian Kanoon citations + {a.platform.toUpperCase()} community policies.</div>
                </>
              )}
            </div>
          </Card>

          {/* Audience match */}
          <Card className="lg:col-span-5" testid="audience-card">
            <CardHeader
              icon={<ChartLineUp size={16} weight="bold" />}
              eyebrow="AGENT 06"
              title="AUDIENCE INTELLIGENCE"
              subtitle="will it go live?"
              onRerun={() => handleRerunAgent("agent6")}
              isRunning={reRunningAgent === "agent6"}
            />
            <div className="p-5 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent6" || (!audience.match_score && !audience.predicted_outcome) ? (
                <AgentLoadingState
                  agent="AGENT 06"
                  title="CALCULATING AUDIENCE MATCH"
                  subtitle="Benchmarking against channel top performers & niche trends..."
                  running={isRunning || reRunningAgent === "agent6"}
                />
              ) : (
                <>
                  <div className="flex items-center gap-5 mb-4">
                    <div className="w-24 h-24 border border-brand-ink flex items-center justify-center bg-[#007AFF]">
                      <div className="font-display font-black text-3xl text-white">{matchScore}%</div>
                    </div>
                    <div className="flex-1">
                      <div className="overline text-brand-muted">MATCH SCORE</div>
                      {audience.predicted_outcome && (
                        <div className="font-display font-bold text-sm mt-1 inline-block px-2 py-0.5"
                          style={{ background: OUTCOME_COLOR[audience.predicted_outcome] || "#E4E4E7", color: audience.predicted_outcome === "UNDERPERFORM" ? "#fff" : "#0A0A0A" }}>
                          {audience.predicted_outcome}
                        </div>
                      )}
                      {audience.outcome_reasoning && (
                        <div className="font-mono-data text-xs mt-2 text-brand-muted">{audience.outcome_reasoning}</div>
                      )}
                    </div>
                  </div>
                  <List title="WHAT THEY LOVE" items={audience.loves} accent="#34C759" />
                  <List title="WHAT THEY IGNORE" items={audience.ignores} accent="#52525B" />
                  <List title="CONTENT GAPS" items={audience.content_gaps} accent="#FFCC00" />
                  <List title="TRENDING ALIGNMENT" items={audience.trending_alignment} accent="#007AFF" />
                </>
              )}
            </div>
          </Card>

          {/* Virality chart */}
          <Card className="lg:col-span-7" testid="virality-card">
            <CardHeader
              icon={<Lightning size={16} weight="bold" />}
              eyebrow="AGENT 03"
              title="VIRALITY × BACKLASH"
              subtitle={`tuned for ${a.mode}`}
              onRerun={() => handleRerunAgent("agent3")}
              isRunning={reRunningAgent === "agent3"}
            />
            <div className="p-5 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent3" || viralityChart.length === 0 ? (
                <AgentLoadingState
                  agent="AGENT 03"
                  title="SIMULATING VIRALITY & BACKLASH"
                  subtitle="Predicting scene-by-scene retention impact & backlash probability..."
                  running={isRunning || reRunningAgent === "agent3"}
                />
              ) : (
                <>
                  <div style={{ minHeight: 256, height: 256 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                      <BarChart data={viralityChart}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#E4E4E7" />
                        <XAxis dataKey="seg" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#0A0A0A" />
                        <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#0A0A0A" />
                        <Tooltip contentStyle={{ background: "#0A0A0A", color: "#fff", border: "1px solid #0A0A0A", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                        <Bar dataKey="virality" fill="#007AFF" />
                        <Bar dataKey="backlash" fill="#FF3B30" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-4 divide-y divide-brand-edge">
                    {virality.map((v, i) => (
                      <li key={i} className="py-2 flex items-start gap-3" data-testid={`virality-item-${i}`}>
                        <span className="font-mono-data text-xs bg-brand-ink text-white px-2 py-0.5">{v.segment_id}</span>
                        <div className="flex-1">
                          <div className="font-mono-data text-xs">{v.why}</div>
                          <div className="overline text-brand-muted mt-1">VIRAL {v.virality_score}% · BACKLASH {v.backlash_probability}% · {v.engagement_type} · RETENTION {v.retention_impact}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>

          {/* Persona feed */}
          <Card className="lg:col-span-5" testid="persona-card">
            <CardHeader
              icon={<Users size={16} weight="bold" />}
              eyebrow="AGENT 04"
              title="PERSONA FEED"
              subtitle="how each tribe reacts"
              onRerun={() => handleRerunAgent("agent4")}
              isRunning={reRunningAgent === "agent4"}
            />
            <div className="p-5 space-y-4 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent4" || Object.keys(personas).length === 0 ? (
                <AgentLoadingState
                  agent="AGENT 04"
                  title="GENERATING PERSONA FEEDS"
                  subtitle="Simulating reactions from fans, haters, neutral viewers & media..."
                  running={isRunning || reRunningAgent === "agent4"}
                />
              ) : (
                <>
                  <Persona avatar={AVATARS[0]} label="FANS" tone={personas.fans?.sentiment} extras={[`SHARE: ${personas.fans?.share_likelihood ?? "—"}%`]} comments={personas.fans?.sample_comments} />
                  <Persona avatar={AVATARS[1]} label="HATERS" accent="#FF3B30" tone={personas.haters?.sentiment} extras={[`BACKLASH: ${personas.haters?.backlash_likelihood ?? "—"}%`]} comments={personas.haters?.sample_comments} />
                  <Persona avatar={AVATARS[2]} label="NEUTRAL" tone={personas.neutral?.sentiment} extras={[`CONVERSION: ${personas.neutral?.conversion_likelihood ?? "—"}%`]} comments={personas.neutral?.sample_comments} />
                  <Persona avatar={AVATARS[3]} label="INFLUENCERS" tone={personas.influencers?.reaction} comments={personas.influencers?.sample_comments} />
                  <div className="border border-brand-ink p-3">
                    <div className="overline text-brand-muted">MEDIA NARRATIVE</div>
                    <div className="font-mono-data text-xs mt-1">{personas.media?.narrative || "—"}</div>
                    {(personas.media?.headline_ideas || []).map((h, i) => (
                      <div key={i} className="font-display font-bold text-sm mt-1">› {h}</div>
                    ))}
                  </div>
                  <div className="border border-brand-ink p-3 bg-[#FFCC00]">
                    <div className="overline">BRAND PERSPECTIVE</div>
                    <div className="font-mono-data text-xs mt-1">{personas.brands?.perspective || "—"}</div>
                    <div className="font-display font-bold text-sm mt-1">SPONSOR FIT: {personas.brands?.sponsorship_fit ?? "—"}%</div>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Optimized scripts — SINGLE MODE, scene-by-scene rewrites */}
          <Card className="lg:col-span-7" testid="scripts-card">
            <CardHeader
              icon={<FileText size={16} weight="bold" />}
              eyebrow="AGENT 05"
              title={`OPTIMIZED FOR ${a.mode}`}
              subtitle="scene-by-scene rewrites"
              onRerun={() => handleRerunAgent("agent5")}
              isRunning={reRunningAgent === "agent5"}
            />
            <div className="p-5 space-y-5 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent5" || Object.keys(scripts).length === 0 ? (
                <AgentLoadingState
                  agent="AGENT 05"
                  title={`OPTIMIZING SCRIPT FOR ${a.mode} MODE`}
                  subtitle="Generating scene-by-scene Before/After rewrites..."
                  running={isRunning || reRunningAgent === "agent5"}
                />
              ) : (
                <>
                  {(scripts.scene_rewrites || []).length > 0 && (
                    <div>
                      <div className="overline text-brand-muted mb-2">SCENE REWRITES</div>
                      <div className="space-y-3">
                        {scripts.scene_rewrites.map((sr, i) => (
                          <div key={i} className="border border-brand-ink" data-testid={`scene-rewrite-${i}`}>
                            <div className="px-3 py-2 bg-brand-ink text-white flex items-center justify-between">
                              <span className="font-mono-data text-xs">{sr.segment_id || `S${i + 1}`}</span>
                              <span className="overline text-brand-muted text-[10px] truncate ml-2">{sr.reason}</span>
                            </div>
                            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-brand-edge">
                              <div className="p-3">
                                <div className="overline text-brand-aggro mb-1">BEFORE</div>
                                <pre className="font-mono-data text-xs whitespace-pre-wrap leading-relaxed">{sr.before}</pre>
                              </div>
                              <div className="p-3 bg-brand-paper">
                                <div className="overline mb-1" style={{ color: a.mode === "AGGRESSIVE" ? "#FF3B30" : a.mode === "CONTROVERSIAL" ? "#0A0A0A" : "#34C759" }}>AFTER ({a.mode})</div>
                                <pre className="font-mono-data text-xs whitespace-pre-wrap leading-relaxed">{sr.after}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {scripts.full_script && (
                    <div>
                      <div className="overline text-brand-muted mb-2">FULL REWRITTEN SCRIPT</div>
                      <ScriptBlock text={scripts.full_script} />
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="overline text-brand-muted mb-2">HOOK IMPROVEMENTS</div>
                      <ul className="space-y-1">{(scripts.hook_improvements || []).map((h, i) => <li key={i} className="font-mono-data text-xs">› {h}</li>)}</ul>
                    </div>
                    <div>
                      <div className="overline text-brand-muted mb-2">RETENTION TIPS</div>
                      <ul className="space-y-1">{(scripts.retention_suggestions || []).map((h, i) => <li key={i} className="font-mono-data text-xs">› {h}</li>)}</ul>
                    </div>
                  </div>
                  {(scripts.what_changed || []).length > 0 && (
                    <div className="p-3 border border-brand-ink bg-brand-paper">
                      <div className="overline text-brand-muted mb-1">WHAT CHANGED · WHAT'S PRESERVED</div>
                      <ul className="space-y-1">{(scripts.what_changed || []).map((h, i) => <li key={i} className="font-mono-data text-xs">› {h}</li>)}</ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Growth + Brand discovery */}
          <Card className="lg:col-span-5" testid="growth-card">
            <CardHeader
              icon={<Megaphone size={16} weight="bold" />}
              eyebrow="AGENT 07"
              title="GROWTH + BRAND-FIT"
              subtitle="real brands · CPM · placements"
              onRerun={() => handleRerunAgent("agent7")}
              isRunning={reRunningAgent === "agent7"}
            />
            <div className="p-5 space-y-4 max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent7" || Object.keys(growth).length === 0 ? (
                <AgentLoadingState
                  agent="AGENT 07"
                  title="DISCOVERING GROWTH & BRAND FIT"
                  subtitle="Generating titles, hooks, clip timestamps & D2C brand placements..."
                  running={isRunning || reRunningAgent === "agent7"}
                />
              ) : (
                <>
                  <List title="TITLES" items={growth.titles} accent="#0A0A0A" />
                  <List title="HOOKS" items={growth.hooks} accent="#FFCC00" />
                  <div>
                    <div className="overline text-brand-muted mb-2">THUMBNAIL CONCEPTS</div>
                    <div className="grid grid-cols-1 gap-2">
                      {(growth.thumbnails || []).map((t, i) => (
                        <div key={i} className="border border-brand-ink p-3">
                          <div className="font-display font-bold text-sm">{t.text}</div>
                          <div className="font-mono-data text-xs text-brand-muted mt-1">{t.concept}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <List title="SHORT CLIP TIMESTAMPS" items={(growth.short_clips || []).map((c) => `${c.timestamp} — ${c.why}`)} accent="#007AFF" />
                  <div>
                    <div className="overline text-brand-muted mb-2" style={{ borderLeft: "3px solid #FF3B30", paddingLeft: 8 }}>HIDDEN BRAND-FIT (DISCOVERED)</div>
                    <div className="grid grid-cols-1 gap-2">
                      {(growth.brand_ideas || []).map((b, i) => (
                        <div key={i} className="border border-brand-ink p-3 bg-white" data-testid={`brand-idea-${i}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="font-display font-bold text-sm">{typeof b === "string" ? b : b.brand_name}</div>
                            {b?.category && <span className="overline text-brand-muted">{b.category}</span>}
                            {b?.est_cpm_inr ? <span className="bg-brand-ink text-white font-mono-data text-[10px] px-2 py-0.5">CPM ₹{b.est_cpm_inr}</span> : null}
                          </div>
                          {b?.placement_idea && <div className="font-mono-data text-xs mt-2">{b.placement_idea}</div>}
                          {b?.match_reason && <div className="font-mono-data text-[10px] text-brand-muted mt-1">↳ {b.match_reason}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                  {growth.posting_strategy && (
                    <div className="border border-brand-ink p-3">
                      <div className="overline text-brand-muted">POSTING STRATEGY</div>
                      <div className="font-mono-data text-xs mt-1">{growth.posting_strategy.best_day} · {growth.posting_strategy.best_time}</div>
                      <div className="font-mono-data text-xs text-brand-muted">{growth.posting_strategy.platform_specific}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Content Breakdown — scene level: tone · intent · entities · flags · claims · people · numbers · refs */}
          <Card className="lg:col-span-12" testid="segments-card">
            <CardHeader
              icon={<FileText size={16} weight="bold" />}
              eyebrow="AGENT 01"
              title="CONTENT BREAKDOWN"
              subtitle="scene · tone · intent · entities · flags"
              onRerun={() => handleRerunAgent("agent1")}
              isRunning={reRunningAgent === "agent1"}
            />
            <div className="overflow-x-auto max-h-[720px] overflow-y-auto">
              {isRunning || reRunningAgent === "agent1" || segs.length === 0 ? (
                <div className="p-5">
                  <AgentLoadingState
                    agent="AGENT 01"
                    title="EXTRACTING SCENES & LINES"
                    subtitle="Categorizing verbatim lines, tone, intent, and entities..."
                    running={isRunning || reRunningAgent === "agent1"}
                  />
                </div>
              ) : (
                <table className="w-full font-mono-data text-xs">
                  <thead className="bg-brand-paper border-b border-brand-ink sticky top-0">
                    <tr>
                      {["ID", "TEXT", "TOPIC", "TONE", "INTENT", "ENTITIES", "FLAGS", "PEOPLE", "CLAIMS", "NUMBERS", "EMOTION", "RELEVENT"].map((h) => (
                        <th key={h} className="text-left p-3 overline text-brand-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {segs.map((s, i) => (
                      <tr key={i} className="border-b border-brand-edge align-top">
                        <td className="p-3 font-medium">{s.id}</td>
                        <td className="p-3 max-w-sm whitespace-pre-wrap">{s.text}</td>
                        <td className="p-3">{s.topic || "—"}</td>
                        <td className="p-3"><span className="bg-brand-paper border border-brand-ink px-2 py-0.5">{s.tone || "—"}</span></td>
                        <td className="p-3"><span className="bg-brand-paper border border-brand-ink px-2 py-0.5">{s.intent || "—"}</span></td>
                        <td className="p-3"><Tags items={s.entities} /></td>
                        <td className="p-3">
                          {(s.flags || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {(s.flags || []).map((f, j) => <span key={j} className="bg-brand-aggro text-white px-1.5 py-0.5 text-[10px]">{f}</span>)}
                            </div>
                          ) : <span className="text-brand-muted">—</span>}
                        </td>
                        <td className="p-3"><Tags items={s.people_named} /></td>
                        <td className="p-3 max-w-xs">
                          {(s.claims || []).map((c, j) => <div key={j} className="mb-1">› {c}</div>)}
                          {(!s.claims || s.claims.length === 0) && "—"}
                        </td>
                        <td className="p-3"><Tags items={s.numbers_stats} /></td>
                        <td className="p-3"><Bar2 v={s.emotion_score} c="#FFCC00" /></td>
                        <td className="p-3"><Bar2 v={s.audience_relevance} c="#007AFF" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function useEffectPrimary() { /* deprecated */ }

function Card({ children, className = "", testid }) {
  return <section data-testid={testid} className={`grid-card animate-fade-up ${className}`}>{children}</section>;
}
function CardHeader({ icon, eyebrow, title, subtitle, onRerun, isRunning }) {
  return (
    <div className="p-5 border-b border-brand-ink flex items-center gap-3 flex-wrap">
      <div className="w-9 h-9 border border-brand-ink flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="overline text-brand-muted">{eyebrow}</div>
        <div className="font-display font-black text-lg tracking-tight">{title}</div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {subtitle && <div className="overline text-brand-muted hidden md:block">{subtitle}</div>}
        {onRerun && (
          <button
            onClick={onRerun}
            disabled={isRunning}
            title="Re-run only this subagent"
            className="px-2.5 py-1 bg-white hover:bg-brand-ink hover:text-white border border-brand-ink font-mono-data text-[10px] flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-[1px_1px_0px_0px_#0A0A0A]"
          >
            <ArrowsClockwise size={12} weight="bold" className={isRunning ? "animate-spin" : ""} />
            {isRunning ? "RE-RUNNING..." : "RE-RUN AGENT"}
          </button>
        )}
      </div>
    </div>
  );
}
function Kpi({ label, value, accent, small }) {
  return (
    <div className="p-5">
      <div className="overline text-brand-muted">{label}</div>
      <div className={`font-display font-black mt-1 ${small ? "text-xl" : "text-3xl"}`} style={{ color: accent }}>{value}</div>
    </div>
  );
}
function ModeBadge({ mode }) {
  const c = mode === "AGGRESSIVE" ? "bg-brand-aggro text-white" : mode === "CONTROVERSIAL" ? "bg-brand-contro text-brand-ink" : "bg-brand-safe text-brand-ink";
  return <span className={`px-3 py-2 font-mono-data text-xs font-medium ${c}`}>MODE / {mode}</span>;
}
function Persona({ avatar, label, tone, comments = [], extras = [], accent }) {
  return (
    <div className="flex gap-3 border-b border-brand-edge pb-3">
      <img src={avatar} alt={label} className="w-12 h-12 border border-brand-ink object-cover" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm" style={{ color: accent }}>{label}</span>
          {extras.map((e, i) => <span key={i} className="overline text-brand-muted">· {e}</span>)}
        </div>
        <div className="font-mono-data text-xs text-brand-muted mt-1">{tone}</div>
        {(comments || []).slice(0, 2).map((c, i) => (
          <div key={i} className="font-mono-data text-xs mt-1 bg-brand-paper border-l-2 border-brand-ink pl-2 py-1">"{c}"</div>
        ))}
      </div>
    </div>
  );
}
function List({ title, items = [], accent }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="overline text-brand-muted mb-2" style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 8 }}>{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => <li key={i} className="font-mono-data text-xs">› {typeof it === "string" ? it : JSON.stringify(it)}</li>)}
      </ul>
    </div>
  );
}
function Tags({ items = [] }) {
  if (!items || items.length === 0) return <span className="text-brand-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 6).map((t, i) => (
        <span key={i} className="bg-brand-paper border border-brand-ink px-1.5 py-0.5 text-[10px]">{t}</span>
      ))}
    </div>
  );
}
function Bar2({ v, c }) {
  const w = Math.min(100, Math.max(0, Number(v) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 border border-brand-ink"><div className="h-full" style={{ width: `${w}%`, background: c }} /></div>
      <span>{w}</span>
    </div>
  );
}
function ScriptBlock({ text }) {
  if (!text) return <div className="font-mono-data text-xs text-brand-muted">No script generated for this mode.</div>;
  const copy = () => { navigator.clipboard.writeText(text); toast.success("Copied"); };
  return (
    <div className="border border-brand-ink relative">
      <button onClick={copy} className="absolute top-2 right-2 p-2 bg-white border border-brand-ink hover:bg-brand-ink hover:text-white" data-testid="copy-script">
        <Copy size={14} weight="bold" />
      </button>
      <pre className="p-4 font-mono-data text-xs whitespace-pre-wrap leading-relaxed">{text}</pre>
    </div>
  );
}
function AgentLoadingState({ agent = "AGENT", title = "ANALYZING CONTENT", subtitle = "Processing scene-by-scene intelligence...", running = true }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center justify-center text-center border border-dashed border-brand-ink/40 bg-brand-paper/60 my-2" data-testid="agent-loading-state">
      <div className="w-10 h-10 border border-brand-ink flex items-center justify-center bg-white mb-3 shadow-[2px_2px_0px_0px_#0A0A0A]">
        <ArrowsClockwise size={20} weight="bold" className={`text-brand-ink ${running ? "animate-spin" : ""}`} />
      </div>
      <div className="overline text-brand-muted">{agent} · {running ? "PROCESSING..." : "AWAITING RESPONSE"}</div>
      <div className="font-display font-black text-sm tracking-tight mt-1 text-brand-ink uppercase">{title}</div>
      <div className="font-mono-data text-xs text-brand-muted mt-1 max-w-sm">{subtitle}</div>
    </div>
  );
}

function Empty({ running, agent, title, subtitle }) {
  return <AgentLoadingState running={running} agent={agent} title={title} subtitle={subtitle} />;
}
