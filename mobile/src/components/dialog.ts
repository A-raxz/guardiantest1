import { Alert, Platform } from 'react-native';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * Cross-platform dialog.
 *
 * On iOS and Android this is the native alert. On web it is not: react-native-web
 * ships `Alert.alert` as an empty function, so every confirmation would silently
 * do nothing. There we fall back to the browser's own dialogs, which keeps the
 * app reviewable in a browser without changing how it behaves on a phone.
 */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;
  const actions = buttons ?? [];

  // A single button (or none) is a message, not a question.
  if (actions.length <= 1) {
    window.alert(text);
    actions[0]?.onPress?.();
    return;
  }

  // Otherwise it is a confirmation: the last non-cancel button is the action.
  const cancel = actions.find((button) => button.style === 'cancel');
  const confirm = [...actions].reverse().find((button) => button.style !== 'cancel');

  if (window.confirm(text)) confirm?.onPress?.();
  else cancel?.onPress?.();
}
