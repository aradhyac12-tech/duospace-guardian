import { useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { loginWithPasskey, passkeysSupported } from "@/lib/webauthn";

// Auth screen surface. Discoverable-credential (usernameless) login: the
// browser prompts the user to pick a passkey.
const PasskeyLogin = ({ email }: { email?: string }) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  if (!passkeysSupported()) return null;

  const handle = async () => {
    setLoading(true);
    try {
      await loginWithPasskey(email?.trim() || undefined);
      toast({ title: "Signed in", description: "Welcome back." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // NotAllowedError = user cancelled; keep it quiet.
      if (!/NotAllowedError|cancel/i.test(msg)) {
        toast({ title: "Passkey sign-in failed", description: msg, variant: "destructive" });
      }
    }
    setLoading(false);
  };

  return (
    <Button variant="outline" onClick={handle} disabled={loading}
      className="w-full h-11 rounded-xl gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
      Sign in with passkey
    </Button>
  );
};

export default PasskeyLogin;
