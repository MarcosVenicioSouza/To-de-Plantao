// react-native-web's Alert.alert does nothing. In the PWA we map it to the
// browser's alert/confirm so confirmations and messages keep working.
import { Alert, AlertButton, Platform } from "react-native";

if (Platform.OS === "web" && typeof window !== "undefined") {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    const list = buttons ?? [];
    const cancel = list.find((b) => b.style === "cancel");
    const actions = list.filter((b) => b !== cancel);
    if (list.length < 2 || actions.length === 0) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const ok = window.confirm(text);
    if (ok) actions[actions.length - 1].onPress?.();
    else cancel?.onPress?.();
  };
}
