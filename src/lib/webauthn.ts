// Thin client wrappers around @simplewebauthn/browser + our edge functions.
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";

export async function registerPasskey(deviceName?: string): Promise<{
  verified: boolean; credential_id?: string;
}> {
  const { data: options, error } = await supabase.functions.invoke(
    "webauthn-register-options",
    { body: {} },
  );
  if (error) throw new Error(error.message);

  const attResp = await startRegistration({ optionsJSON: options });

  const { data: verify, error: vErr } = await supabase.functions.invoke(
    "webauthn-register-verify",
    { body: { response: attResp, device_name: deviceName } },
  );
  if (vErr) throw new Error(vErr.message);
  if (verify?.error) throw new Error(verify.error);
  return verify;
}

export async function loginWithPasskey(email?: string): Promise<void> {
  const { data: options, error } = await supabase.functions.invoke(
    "webauthn-login-options",
    { body: email ? { email } : {} },
  );
  if (error) throw new Error(error.message);
  if (options?.error) throw new Error(options.error);

  const assertion = await startAuthentication({ optionsJSON: options });

  const { data, error: vErr } = await supabase.functions.invoke(
    "webauthn-login-verify",
    { body: { response: assertion } },
  );
  if (vErr) throw new Error(vErr.message);
  if (data?.error) throw new Error(data.error);
  if (!data?.access_token || !data?.refresh_token) throw new Error("No session returned");

  const { error: sessErr } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (sessErr) throw new Error(sessErr.message);
}

export function passkeysSupported(): boolean {
  return typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined";
}
