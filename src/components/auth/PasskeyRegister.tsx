import { useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { registerPasskey, passkeysSupported } from "@/lib/webauthn";

// Signed-in surface. Enrolls a new passkey for the current user.
const PasskeyRegister = ({ onDone }: { onDone?: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState(
    typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? "iPhone"
      : /Android/.test(navigator.userAgent ?? "") ? "Android device" : "This device",
  );
  const { toast } = useToast();

  if (!passkeysSupported()) {
    return (
      <p className="text-xs text-muted-foreground">
        Passkeys aren't supported on this browser or device.
      </p>
    );
  }

  const handle = async () => {
    setLoading(true);
    try {
      await registerPasskey(deviceName.trim() || undefined);
      toast({ title: "Passkey added", description: "You can sign in on this device with it." });
      onDone?.();
    } catch (e) {
      toast({
        title: "Couldn't add passkey",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Device name</label>
        <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)}
          className="h-10 rounded-xl bg-card border-border" placeholder="iPhone" />
      </div>
      <Button onClick={handle} disabled={loading}
        className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
        Add passkey to this device
      </Button>
    </div>
  );
};

export default PasskeyRegister;
