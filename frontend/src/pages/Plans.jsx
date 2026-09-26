import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle, Lock, Lightning, Crown } from "@phosphor-icons/react";
import { API, useAuth } from "../App";
import AppHeader from "../components/AppHeader";

const DURATIONS = [
  { k: "monthly", l: "MONTHLY", suffix: "/mo" },
  { k: "halfyear", l: "6 MONTHS", suffix: "/6mo" },
  { k: "yearly", l: "YEARLY", suffix: "/yr" },
];

const PLAN_ICONS = { basic: Lock, pro: Lightning, studio: Crown };
const PLAN_ACCENT = { basic: "#0A0A0A", pro: "#FFCC00", studio: "#007AFF" };

function loadRzpScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function Plans() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [duration, setDuration] = useState("monthly");
  const [busyPlan, setBusyPlan] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([axios.get(`${API}/billing/plans`), axios.get(`${API}/billing/me`)]);
        setData(a.data);
        setMe(b.data);
      } catch (e) {
        toast.error("Failed to load plans");
      }
    })();
  }, []);

  const subscribe = async (planId) => {
    setBusyPlan(planId);
    try {
      const ok = await loadRzpScript();
      if (!ok) { toast.error("Razorpay script blocked"); setBusyPlan(null); return; }
      const order = await axios.post(`${API}/billing/checkout`, { plan_id: planId, duration });
      const { order_id, amount, currency, key_id } = order.data;
      const rzp = new window.Razorpay({
        key: key_id,
        amount, currency,
        order_id,
        name: "Still Alive",
        description: `${data.plans[planId].name} · ${duration.toUpperCase()}`,
        theme: { color: "#0A0A0A" },
        prefill: { email: user?.email, name: user?.name },
        handler: async (resp) => {
          try {
            await axios.post(`${API}/billing/verify`, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              plan_id: planId,
              duration,
            });
            toast.success("Subscription active");
            const r = await axios.get(`${API}/billing/me`);
            setMe(r.data);
            await refresh();
            nav("/dashboard");
          } catch (e) {
            toast.error(e?.response?.data?.detail || "Verification failed");
          }
        },
        modal: { ondismiss: () => setBusyPlan(null) },
      });
      rzp.open();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setBusyPlan(null);
    }
  };

  if (!data) return <div><AppHeader /><div className="p-10 font-mono-data text-sm">LOADING PLANS...</div></div>;
  const activePlan = me?.features?.plan_id;

  return (
    <div>
      <AppHeader />
      <main className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
        <section className="mb-6 grid-card animate-fade-up p-6">
          <div className="overline text-brand-muted">/// PLANS</div>
          <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter mt-1">PICK YOUR LANE</h1>
          <p className="mt-2 font-mono-data text-xs text-brand-muted max-w-2xl">
            All plans grounded in your real channel data. Yearly saves the most.
            {activePlan && <span className="ml-2 bg-brand-safe text-brand-ink px-2 py-0.5">CURRENT: {data.plans[activePlan].name}</span>}
          </p>

          <div className="mt-5 grid grid-cols-3 border border-brand-ink max-w-md">
            {DURATIONS.map((d) => (
              <button key={d.k} data-testid={`duration-${d.k}`} onClick={() => setDuration(d.k)}
                className={`p-3 font-mono-data text-xs font-medium border-r border-brand-ink last:border-r-0 ${duration === d.k ? "bg-brand-ink text-white" : "bg-white hover:bg-brand-paper"}`}>
                {d.l}{d.k === "yearly" && <span className="ml-1 bg-brand-safe text-brand-ink px-1">SAVE</span>}
              </button>
            ))}
          </div>
        </section>

        <div className="grid md:grid-cols-3 gap-6">
          {Object.entries(data.plans)
            .filter(([, p]) => !p.hidden) // Filter out plans marked as hidden
            .map(([id, p]) => {
            const Icon = PLAN_ICONS[id] || Lightning;
            const isActive = activePlan === id;
            const inr = p.prices_inr[duration];
            const monthlyEquiv = duration === "yearly" ? Math.round(inr / 12) : duration === "halfyear" ? Math.round(inr / 6) : inr;
            return (
              <section key={id} data-testid={`plan-${id}`} className={`grid-card animate-fade-up ${id === "pro" ? "hard-shadow" : ""}`}>
                <div className="p-5 border-b border-brand-ink flex items-center gap-3">
                  <div className="w-10 h-10 border border-brand-ink flex items-center justify-center" style={{ background: PLAN_ACCENT[id], color: id === "pro" ? "#0A0A0A" : "#fff" }}>
                    <Icon size={18} weight="bold" />
                  </div>
                  <div>
                    <div className="font-display font-black text-2xl tracking-tighter">{p.name}</div>
                    <div className="overline text-brand-muted">{p.tagline}</div>
                  </div>
                  {id === "pro" && <span className="ml-auto bg-brand-contro px-2 py-0.5 font-mono-data text-[10px]">POPULAR</span>}
                </div>
                <div className="p-5">
                  <div className="font-display font-black text-4xl tracking-tighter">₹{inr.toLocaleString()}<span className="text-base text-brand-muted font-mono-data">{DURATIONS.find(x => x.k === duration).suffix}</span></div>
                  <div className="font-mono-data text-xs text-brand-muted mt-1">~ ₹{monthlyEquiv.toLocaleString()} / month</div>
                  <ul className="mt-5 space-y-2 font-mono-data text-xs">
                    <Feat ok>{p.monthly_runs === -1 ? "Unlimited" : `${p.monthly_runs}`} analyses / period</Feat>
                    <Feat ok>{p.modes.join(" · ")} mode{p.modes.length > 1 ? "s" : ""}</Feat>
                    <Feat ok={p.allow_brand}>Brand campaign mode</Feat>
                    <Feat ok={p.allow_edit_rerun}>Edit & re-run</Feat>
                    <Feat ok>Indian Kanoon legal cross-verify</Feat>
                    <Feat ok>Channel scrape (YT/IG/X)</Feat>
                    <Feat ok>Brand-fit discovery</Feat>
                  </ul>
                  <button data-testid={`subscribe-${id}`} disabled={busyPlan || isActive} onClick={() => subscribe(id)}
                    className={`mt-6 w-full p-3 font-mono-data text-xs font-medium border border-brand-ink ${isActive ? "bg-brand-safe text-brand-ink" : "bg-brand-ink text-white hover:bg-white hover:text-brand-ink"} disabled:opacity-50`}>
                    {isActive ? "CURRENT PLAN" : (busyPlan === id ? "OPENING..." : `GET ${p.name}`)}
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-8 font-mono-data text-[10px] text-brand-muted text-center">
          // Test mode · Razorpay test cards: 4111 1111 1111 1111 · any future expiry · any CVV
        </div>
      </main>
    </div>
  );
}

function Feat({ ok, children }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle size={14} weight="bold" className="text-brand-safe mt-0.5 shrink-0" />
          : <Lock size={14} weight="bold" className="text-brand-muted mt-0.5 shrink-0" />}
      <span className={ok ? "" : "text-brand-muted line-through"}>{children}</span>
    </li>
  );
}
