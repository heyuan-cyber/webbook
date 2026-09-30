import { create } from 'zustand';
import type { NativeCapabilities } from '@webbook/shared';
import { NO_NATIVE_CAPABILITIES } from '@webbook/shared';
import { probeNativeBridge } from '@/lib/nativeBridge';

/**
 * 宿主能力状态（native-android-companion 的 tasks 5.2）。
 *
 * 单独做成 store 而不是每页各探测一次：探测有一次原生往返（`Usage.daily`），
 * 三个页面各调一次会造成不必要的重复与状态不一致。
 *
 * 状态语义：
 *   - `unknown`：尚未探测（首次挂载前后）
 *   - 探测完成且 `caps.inHost === false`：运行在浏览器中——这不是错误，
 *     是正常降级，页面应显示"需在手机 App 中使用"而不是报错
 */
interface NativeHostState {
  caps: NativeCapabilities;
  /** 是否已完成一次探测 */
  probed: boolean;
  /** 探测进行中 */
  probing: boolean;
  probe: () => Promise<void>;
}

export const useNativeHostStore = create<NativeHostState>((set, get) => ({
  caps: NO_NATIVE_CAPABILITIES,
  probed: false,
  probing: false,

  probe: async () => {
    if (get().probing) return;
    set({ probing: true });
    try {
      const caps = await probeNativeBridge();
      set({ caps, probed: true, probing: false });
    } catch {
      // probeNativeBridge 自身保证不抛；这里只是最后一道兜底，
      // 保证探测失败不会把整个应用卡在 loading 状态。
      set({ caps: NO_NATIVE_CAPABILITIES, probed: true, probing: false });
    }
  },
}));
