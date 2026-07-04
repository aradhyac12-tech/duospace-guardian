import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { logInfo, logError, newTraceId } from "@/lib/telemetry";

// Device B (unauthenticated) uses this to scan Device A's QR. Reuses the web
// getUserMedia camera pipeline (same primitive CameraWithFilters relies on) via
// the html5-qrcode library — works in-browser and inside the Capacitor WebView
// so we don't need a native barcode plugin.

interface QRSignInScannerProps {
  onClose: () => void;
  onSuccess?: () => void;
  /**
   * Called when the scanned QR was a signup_invite (not a device_pairing).
   * The Auth page uses this to switch to the Sign Up tab and stash the
   * inviter_id so the newly-created account can be linked to the inviter
   * downstream (partner link, etc). No session is issued in this branch.
   */
  onSignupInvite?: (inviterId: string) => void;
}

interface QRPayload {
  v: number;
  kind: string;
  token: string;
  exp: string;
}

const SCANNER_ID = "duo-qr-scanner-region";

const QRSignInScanner = ({ onClose, onSuccess }: QRSignInScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "redeeming" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const redeemingRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const instance = new Html5Qrcode(SCANNER_ID, { verbose: false });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (redeemingRef.current) return;
            handleDecoded(decodedText);
          },
          () => {
            // per-frame decode failures are noisy; ignore
          },
        );
        if (!cancelled) setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(
          e instanceof Error
            ? e.message
            : "Couldn't start camera. Grant camera access and try again.",
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => {
          s.clear();
          scannerRef.current = null;
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecoded = async (text: string) => {
    let parsed: QRPayload | null = null;
    try {
      parsed = JSON.parse(text) as QRPayload;
    } catch {
      // Not our QR; keep scanning.
      return;
    }
    if (!parsed || parsed.kind !== "duospace-qr-signin" || !parsed.token) {
      return;
    }

    redeemingRef.current = true;
    setStatus("redeeming");
    const traceId = newTraceId("qr_redeem");
    logInfo("auth.qr", "redeem start", { request_id: traceId }, traceId);

    try {
      // Stop the camera before network + navigation.
      await scannerRef.current?.stop().catch(() => {});

      const { data, error: fnErr } = await supabase.functions.invoke(
        "redeem-qr-token",
        { body: { token: parsed.token } },
      );
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.access_token || !data?.refresh_token) {
        throw new Error("Invalid response");
      }

      const { error: sessErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessErr) throw new Error(sessErr.message);

      logInfo("auth.qr", "redeem ok", { request_id: traceId, status: "ok" }, traceId);
      toast({ title: "Signed in", description: "Welcome back." });
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      logError("auth.qr", "redeem failed", { request_id: traceId, status: "error", error: msg }, traceId);
      setStatus("error");
      setError(msg);
      redeemingRef.current = false;
      toast({
        title: "QR sign-in failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-black">
        <div id={SCANNER_ID} className="w-full h-full" />
        {(status === "starting" || status === "redeeming") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
              <span className="text-xs text-white/80">
                {status === "starting" ? "Starting camera..." : "Signing you in..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {status === "scanning" && (
        <p className="text-xs text-muted-foreground text-center max-w-[280px]">
          Point at the QR on your other device.
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive text-center max-w-[280px]">{error}</p>
      )}

      <Button size="sm" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
};

export default QRSignInScanner;
