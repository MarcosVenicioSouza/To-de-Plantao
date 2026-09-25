// Notifications setup for Tô de Plantão.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

let initialized = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationsReady(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!initialized) {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("plantao", {
        name: "Lembretes de plantão",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#32827A",
      });
    }
    initialized = true;
  }
  const cur = await Notifications.getPermissionsAsync();
  let status = cur.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    status = req.status;
  }
  return status === "granted";
}

export async function scheduleShiftReminder(
  when: Date,
  title: string,
  body: string
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (when.getTime() <= Date.now()) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: Platform.OS === "android" ? "plantao" : undefined,
    } as Notifications.DateTriggerInput,
  });
}

export async function cancelAllReminders() {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
