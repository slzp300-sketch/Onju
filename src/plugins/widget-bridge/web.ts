import { WebPlugin } from '@capacitor/core';
import type { WidgetBridgePlugin } from './index';

/** 웹에는 홈 위젯이 없다 — 전부 no-op. */
export class WidgetBridgeWeb extends WebPlugin implements WidgetBridgePlugin {
  async sync(): Promise<void> {
    /* no-op */
  }
  async consumePending(): Promise<{ json: string }> {
    return { json: '[]' };
  }
}
