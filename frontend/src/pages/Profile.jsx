import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { InstagramLogo, YoutubeLogo, XLogo, LinkedinLogo, FacebookLogo, ThreadsLogo, GlobeHemisphereWest, Warning, ArrowsClockwise, CheckCircle } from "@phosphor-icons/react";
import { API, useAuth } from "../App";
import AppHeader from "../components/AppHeader";

const SOCIALS = [
  { key: "instagram", label: "INSTAGRAM", required: "or", icon: InstagramLogo, placeholder: "https://instagram.com/yourhandle" },
  { key: "youtube", label: "YOUTUBE", required: "or", icon: YoutubeLogo, placeholder: "https://youtube.com/@yourchannel" },
  { key: "x", label: "X (TWITTER)", icon: XLogo, placeholder: "https://x.com/yourhandle" },
  { key: "linkedin", label: "LINKEDIN", icon: LinkedinLogo, placeholder: "https://linkedin.com/in/yourname" },
  { key: "facebook", label: "FACEBOOK", icon: FacebookLogo, placeholder: "https://facebook.com/yourpage" },
  { key: "threads", label: "THREADS", icon: ThreadsLogo, placeholder: "https://threads.net/@yourhandle" },
  { key: "website", label: "WEBSITE", icon: GlobeHemisphereWest, placeholder: "https://yourdomain.com" },
];

export default function Profile() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [socials, setSocials] = useState(user?.socials || {});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [channelMap, setChannelMap] = useState(user?.channel_context_map || {});

  useEffect(() => {
    setName(user?.name || "");
    setSocials(user?.socials || {});
    setChannelMap(user?.channel_context_map || {});
  }, [user]);

  const setSocial = (k, v) => setSocials((s) => ({ ...s, [k]: v }));

  const hasYTorIG = !!(socials.youtube || socials.instagram);

  const save = async () => {
    if (!hasYTorIG) {
      toast.error("Add at least one of Instagram or YouTube");
      return;
    }
    setBusy(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(socials).filter(([, v]) => v && v.trim()));
      await axios.put(`${API}/profile`, { name, socials: cleaned });
      await refresh();
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const refreshChannel = async () => {
    setRefreshing(true);
    try {
      const r = await axios.post(`${API}/profile/refresh-channel`);
      setChannelMap(r.data.channel_context_map || {});
      await refresh();
      toast.success("Channel intelligence refreshed");
    } catch (e) {
      toast.error("Channel refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <AppHeader />
      <main className="px-6 md:px-10 py-8 max-w-[1100px] mx-auto">
        <section className="grid-card animate-fade-up" data-testid="profile-card">
          <div className="border-b border-brand-ink p-5 flex items-center justify-between">
            <div>
              <div className="overline text-brand-muted">/// PROFILE</div>
              <h2 className="font-display font-black text-2xl tracking-tight mt-1">YOUR SIGNAL</h2>
            </div>
            <Link to="/dashboard" className="border border-brand-ink px-3 py-2 font-mono-data text-xs hover:bg-brand-ink hover:text-white">← DASHBOARD</Link>
          </div>

          <div className="grid md:grid-cols-2 divide-x divide-brand-ink">
            <div className="p-6">
              <div className="overline text-brand-muted mb-2">EMAIL</div>
              <div className="font-mono-data text-sm">{user?.email}</div>
              <div className="overline text-brand-muted mb-2 mt-5">NAME</div>
              <input data-testid="profile-name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border border-brand-ink p-3 font-mono-data text-sm" />
              <div className="overline text-brand-muted mb-2 mt-5">ROLE</div>
              <div className="font-mono-data text-sm">{user?.role?.toUpperCase() || "USER"}</div>
              {!hasYTorIG && (
                <div className="mt-6 p-3 bg-brand-aggro text-white font-mono-data text-xs flex items-center gap-2" data-testid="profile-warning">
                  <Warning size={14} weight="bold" />
                  Add at least one of <b>Instagram</b> or <b>YouTube</b> to run analyses.
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="overline text-brand-muted mb-3">SOCIAL HANDLES</div>
              <div className="grid gap-3">
                {SOCIALS.map((s) => {
                  const Icon = s.icon;
                  const required = s.required === "or";
                  return (
                    <label key={s.key} className="block" data-testid={`social-${s.key}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} weight="bold" />
                        <span className="overline text-brand-muted">{s.label}{required ? " *" : ""}</span>
                      </div>
                      <input
                        value={socials[s.key] || ""}
                        onChange={(e) => setSocial(s.key, e.target.value)}
                        placeholder={s.placeholder}
                        className="w-full border border-brand-ink p-2 font-mono-data text-xs"
                      />
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 font-mono-data text-[10px] text-brand-muted">* at least one of Instagram / YouTube is required</div>
            </div>
          </div>

          <div className="border-t border-brand-ink p-4 flex flex-wrap gap-3 justify-between items-center">
            <button data-testid="refresh-channel-btn" onClick={refreshChannel} disabled={refreshing || !hasYTorIG}
              className="border border-brand-ink px-4 py-2 font-mono-data text-xs hover:bg-brand-contro disabled:opacity-40 flex items-center gap-2">
              <ArrowsClockwise size={14} weight="bold" className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "FETCHING..." : "REFRESH CHANNEL INTELLIGENCE"}
            </button>
            <button data-testid="profile-save" onClick={save} disabled={busy}
              className="hard-shadow bg-brand-ink text-white px-6 py-3 font-mono-data text-xs font-medium disabled:opacity-40">
              {busy ? "SAVING..." : "SAVE PROFILE"}
            </button>
          </div>
          {Object.keys(channelMap).length > 0 && (
            <div className="border-t border-brand-ink p-5 bg-brand-paper" data-testid="channel-intel">
              <div className="overline text-brand-muted mb-3">/// CHANNEL INTELLIGENCE</div>
              <div className="grid md:grid-cols-2 gap-3">
                {Object.entries(channelMap).map(([k, ch]) => (
                  <div key={k} className="border border-brand-ink p-3 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="overline text-brand-muted">{k.toUpperCase()}</span>
                      {ch?.error ? (
                        <span className="bg-brand-aggro text-white px-2 py-0.5 font-mono-data text-[10px]">SCRAPE FAILED</span>
                      ) : (
                        <span className="bg-brand-safe text-brand-ink px-2 py-0.5 font-mono-data text-[10px] flex items-center gap-1">
                          <CheckCircle size={10} weight="bold" /> SYNCED
                        </span>
                      )}
                    </div>
                    {ch?.channel && <div className="font-display font-bold text-sm">{ch.channel}</div>}
                    {ch?.subscriber_count != null && (
                      <div className="font-mono-data text-xs text-brand-muted">{Number(ch.subscriber_count).toLocaleString()} followers</div>
                    )}
                    {(ch?.recent_videos || []).length > 0 && (
                      <div className="mt-2 font-mono-data text-[10px] text-brand-muted">
                        {ch.recent_videos.length} recent posts grounded:
                        <ul className="mt-1 space-y-0.5">
                          {(ch.recent_videos || []).slice(0, 3).map((v, i) => (
                            <li key={i} className="truncate">› {v.title || v.caption}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ch?.error && <div className="font-mono-data text-[10px] text-brand-muted">{ch.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
