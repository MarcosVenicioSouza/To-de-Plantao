// Silently refreshes shift reminders when the app opens (if the user turned them on),
// so changes made to the schedule are reflected in the alerts.
import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWorkplaces } from "@/src/contexts/workplaces";
import { buildReminders } from "@/src/utils/reminders";
import { syncWebPush, webPushStatus } from "@/src/utils/web-push";
import { cancelAllReminders, scheduleShiftReminder } from "@/src/utils/notifications";

export function useAutoReminders() {
  const { workplaces } = useWorkplaces();
  useEffect(() => {
    if (!workplaces.length) return;
    (async () => {
      try {
        if ((await AsyncStorage.getItem("escala_notif_enabled")) !== "1") return;
        const reminders = await buildReminders(workplaces);
        if (Platform.OS === "web") {
          if (webPushStatus() === "granted") await syncWebPush(reminders);
        } else {
          await cancelAllReminders();
          for (const r of reminders) await scheduleShiftReminder(r.at, r.title, r.body);
        }
      } catch {
        // silent background refresh
      }
    })();
  }, [workplaces]);
}
