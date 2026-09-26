import { useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SignOut, UserCircle } from "@phosphor-icons/react";
import { API, useAuth } from "../App";

export default function AppHeader() {
  const { user, logout } = useAuth();
  const loc = useLocation();

  const section = loc.pathname.startsWith("/profile") ? "PROFILE"
    : loc.pathname.includes("/analysis/") ? "ANALYSIS"
    : "SIGNAL ROOM";

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-brand-ink px-6 md:px-10 py-3 flex items-center justify-between" data-testid="app-header">
      <Link to="/dashboard" className="flex items-center gap-3">
        <div className="w-8 h-8 bg-brand-ink text-white flex items-center justify-center font-display font-black">SA</div>
        <div className="font-display font-black tracking-tighter text-lg">STILL ALIVE</div>
        <div className="overline text-brand-muted hidden md:block ml-3">/ {section}</div>
      </Link>
      <div className="flex items-center gap-3">
        <Link to="/plans" data-testid="plans-link" className="border border-brand-ink px-3 py-2 hover:bg-brand-contro transition-colors flex items-center gap-2 font-mono-data text-xs">
          <span className="hidden md:block">PLANS</span>
          <span className="md:hidden">₹</span>
        </Link>
        <Link to="/profile" data-testid="profile-link" className="flex items-center gap-2 border border-brand-ink px-3 py-2 hover:bg-brand-ink hover:text-white transition-colors">
          {user?.picture ? (
            <img src={user.picture} alt={user.name} className="w-5 h-5 object-cover" />
          ) : (
            <UserCircle size={16} weight="bold" />
          )}
          <span className="font-mono-data text-xs hidden md:block">{user?.name || "PROFILE"}</span>
        </Link>
        <button data-testid="logout-btn" onClick={logout}
          className="border border-brand-ink px-3 py-2 hover:bg-brand-aggro hover:text-white hover:border-brand-aggro transition-colors flex items-center gap-2 font-mono-data text-xs">
          <SignOut size={14} weight="bold" />
          <span className="hidden md:block">LOGOUT</span>
        </button>
      </div>
    </header>
  );
}
