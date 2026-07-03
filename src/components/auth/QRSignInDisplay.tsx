import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// Device A (already signed in) shows this: renders a rotating QR that encodes a
// short-lived pairing token issued by the issue-qr-token edge function.
// Device B scans and posts the token to redeem-qr-token to sign in.
// The QR payload is JSON:
//   { v: 1, kind: "duospace-qr-signin", token: "<pairing-token>", exp: "<iso>" }

interface QRSignInDisplayProps {
  onClose?: () => void;
}

const QRSignInDisplay = ({ onClose }: QRSignInDisplayProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const mintAndRender = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "issue-qr-token",
        { body: {} },
      );
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.token) throw new Error("No token returned");

      const payload = JSON.stringify({
        v: 1,
        kind: "duospace-qr-signin",
        token: data.token as string,
        exp: data.expires_at as string,
      });

      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, payload, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 240,
          color: { dark: "#0F0F0F", light: "#FFFFFF" },
        });
      }
      setExpiresAt(new Date(data.expires_at as string).getTime());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load QR");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    mintAndRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh 3s before expiry.
  useEffect(() => {
    if (!expiresAt) return;
    const msLeft = expiresAt - Date.now() - 3000;
    if (msLeft <= 0) {
      mintAndRender();
      return;
    }
    const t = setTimeout(() => mintAndRender(), msLeft);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  // 1Hz tick for countdown display.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = expiresAt
    ? Math.max(0, Math.round((expiresAt - now) / 1000))
    : null;

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-border">
        {loading && !expiresAt ? (
          <div className="w-[240px] h-[240px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={240}
            height={240}
            aria-label="Sign-in QR code"
          />
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive text-center max-w-[280px]">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground text-center max-w-[280px]">
          Scan with the DuoSpace sign-in scanner on your other device.
          {secondsLeft !== null && (
            <> Refreshes in <span className="font-medium">{secondsLeft}s</span>.</>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={mintAndRender}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
};

export default QRSignInDisplay;
