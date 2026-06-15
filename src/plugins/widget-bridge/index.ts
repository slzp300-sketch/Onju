import { registerPlugin } from '@capacitor/core';

/**
 * 홈 화면 위젯 ↔ 앱 다리.
 * 위젯은 별도 프로세스라 앱 localStorage를 못 읽으므로,
 * 작은 요약 JSON을 네이티브 공유 저장소(SharedPreferences)에 주고받는다.
 */
export interface WidgetBridgePlugin {
  /** 위젯 스냅샷 JSON을 네이티브에 기록하고 홈 위젯을 갱신한다. */
  sync(options: { json: string }): Promise<void>;
  /** 위젯에서 쌓인 보류 액션 큐(JSON 배열 문자열)를 읽고 비운다(원자적). */
  consumePending(): Promise<{ json: string }>;
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge', {
  web: () => import('./web').then((m) => new m.WidgetBridgeWeb()),
});
