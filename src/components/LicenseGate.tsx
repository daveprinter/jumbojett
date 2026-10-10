import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  CircleDot,
  KeyRound,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Zap,
} from "lucide-react";

import { AdminPanel } from "@/components/AdminPanel";
import { HelpAssistant } from "@/components/HelpAssistant";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openWhatsApp } from "@/lib/device";
import { registerOfflineCache } from "@/lib/offline";

const FEATURES = [
  { icon: CircleDot, title: "Digit circles", text: "Live 0–9 digit percentages" },
  { icon: BarChart3, title: "Market analysis", text: "Over/Under, Even/Odd, Rise/Fall" },
  { icon: Bot, title: "Auto trading", text: "Batch contracts & recovery" },
  { icon: Zap, title: "Manual trades", text: "One tap, exact moment" },
];

function JumboJet({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 80" className={className} aria-hidden fill="currentColor">
      <path d="M8 44c0-3 3-5 7-5h118l26-30h12l-14 30h22c10 0 20 3 20 7s-10 7-20 7h-22l14 30h-12l-26-30H15c-4 0-7-2-7-5v-4z" />
      <path d="M20 39l-8-20h8l14 20zM20 49l-8 20h8l14-20z" opacity="0.85" />
      <rect x="40" y="41" width="70" height="2" rx="1" opacity="0.35" />
    </svg>
  );
}

export function LicenseGate({
  error,
  busy,
  onActivate,
}: {
  error: string | null;
  busy: boolean;
  onActivate: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    registerOfflineCache();
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Offline trading video background (bundled with the app, cached on device) */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src="/videos/jumbo-bg.mp4"
        poster="/videos/jumbo-bg.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="absolute inset-0" style={{ background: "var(--gate-overlay)" }} />

      {/* Airplane passing by */}
      <div className="pointer-events-none absolute left-0 top-[12%] text-[var(--glass-foreground)] animate-plane">
        <JumboJet className="h-12 w-32 opacity-80 drop-shadow-lg" />
      </div>

      {/* Floating feature cards */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="glass-card animate-float absolute w-52 rounded-xl p-3"
            style={{
              left: i % 2 === 0 ? "6%" : undefined,
              right: i % 2 === 1 ? "6%" : undefined,
              top: `${18 + Math.floor(i / 2) * 38}%`,
              animationDelay: `${i * 0.9}s`,
            }}
          >
            <f.icon className="mb-1 h-5 w-5" />
            <p className="text-sm font-semibold">{f.title}</p>
            <p className="text-xs opacity-80">{f.text}</p>
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="p-6 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <img src="/icon-192.png" alt="Jumbo Jet Trader logo" className="h-16 w-16 rounded-2xl" />
            <h1 className="mt-4 text-xl font-bold">Jumbo Jet AI Trader</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An analysis tool and a trading app in one: live digit circles and market statistics,
              plus automatic and manual trading on Deriv synthetic indices.
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">$20 per month, per device</p>
          </div>

          {/* Feature cards on small screens */}
          <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="animate-float rounded-lg border border-border bg-accent/50 p-2"
                style={{ animationDelay: `${i * 0.7}s` }}
              >
                <f.icon className="h-4 w-4 text-primary" />
                <p className="mt-1 text-xs font-semibold">{f.title}</p>
                <p className="text-[11px] text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>

          <Button
            className="mt-5 w-full"
            size="lg"
            onClick={() => openWhatsApp("Hello, I want to purchase the tool (Jumbo Jet AI Trader).")}
          >
            <ShoppingCart className="mr-2 h-4 w-4" /> Buy the tool
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Opens WhatsApp with a ready-made message to the developer.
          </p>

          <div className="mt-6 space-y-2">
            <Label htmlFor="licence" className="text-xs uppercase tracking-wide text-muted-foreground">
              Already bought? Enter your license key
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="licence"
                placeholder="JUMBO-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && onActivate(code)}
              />
              <Button onClick={() => onActivate(code)} disabled={busy || !code.trim()}>
                <KeyRound className="mr-2 h-4 w-4" /> {busy ? "Checking…" : "Activate"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mt-4 space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="flex items-start gap-2 text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  openWhatsApp(
                    `Hello developer, I have a license key problem with Jumbo Jet AI Trader: ${error}${
                      code ? ` (key: ${code})` : ""
                    }`,
                  )
                }
              >
                <MessageCircle className="mr-2 h-4 w-4" /> Contact developer on WhatsApp
              </Button>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Each license key is bound to one device. Need to move devices? Message the developer for
            a device reset.
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full text-muted-foreground"
            onClick={() => setAdminOpen(true)}
          >
            <ShieldCheck className="mr-2 h-4 w-4" /> Admin panel
          </Button>
          <AdminPanel open={adminOpen} onOpenChange={setAdminOpen} />
          <HelpAssistant />
        </Card>
      </div>
    </div>
  );
}
