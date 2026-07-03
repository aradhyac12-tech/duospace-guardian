import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

export const hapticLight = async () => {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Light });
  }
};

export const hapticMedium = async () => {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Medium });
  }
};

export const hapticHeavy = async () => {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  }
};

export const hapticNotification = async (type: "success" | "warning" | "error" = "success") => {
  if (Capacitor.isNativePlatform()) {
    const map: Record<string, NotificationType> = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: map[type] });
  }
};

// Continuous vibration pattern for incoming calls
let callVibrationInterval: ReturnType<typeof setInterval> | null = null;

export const startCallVibration = () => {
  if (!Capacitor.isNativePlatform()) return;
  // Immediately vibrate
  Haptics.impact({ style: ImpactStyle.Heavy });
  // Then repeat every 1.5s: heavy-pause-heavy pattern
  callVibrationInterval = setInterval(async () => {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }), 200);
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 400);
  }, 1500);
};

export const stopCallVibration = () => {
  if (callVibrationInterval) {
    clearInterval(callVibrationInterval);
    callVibrationInterval = null;
  }
};

export const hapticMessageSent = async () => {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Light });
  }
};

export const hapticMessageReceived = async () => {
  if (Capacitor.isNativePlatform()) {
    await Haptics.notification({ type: NotificationType.Success });
  }
};
