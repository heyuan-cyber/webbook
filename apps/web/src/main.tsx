import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { isInstalledShell, purgeShellCaches } from './lib/shellContext';
import './styles/global.css';
import './styles/layout.css';
// 手机伴侣三页（使用统计 / 账单 / 提醒）；只用语义 token，故不依赖引入顺序
import './styles/companion.css';
// 皮肤必须最后引入：它是颜色的唯一来源，需覆盖 global.css 的同名 token
import './styles/theme.css';

/**
 * 本地 UI 验证挂载点（仅显式开启时生效）。
 *
 * 目的：在没有已部署 Worker、也没有真实账号的情况下，也能挂载规划面板并驱动其交互，
 * 验证渲染、样式与状态流转；子组件可单独挂载，便于二分定位渲染崩溃。
 * 默认关闭，不参与正常构建产物。
 *
 * 开启：以 VITE_EXPOSE_TEST_HARNESS=1 构建；页面里用 __wbTest.* 驱动。
 */

/** React 渲染期异常不会冒到调用栈，需要错误边界把它记下来 */
class HarnessErrorBoundary extends React.Component<
  { onError: (message: string) => void; children?: React.ReactNode },
  { failed: string | null }
> {
  state: { failed: string | null } = { failed: null };

  static getDerivedStateFromError(error: unknown): { failed: string } {
    return { failed: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const stack = error instanceof Error ? (error.stack ?? '') : '';
    this.props.onError(
      `${message}\n--- stack ---\n${stack}\n--- componentStack ---${info.componentStack}`,
    );
  }

  render(): React.ReactNode {
    if (this.state.failed) return <pre data-harness-error="">{this.state.failed}</pre>;
    return this.props.children;
  }
}

interface HarnessApi {
  planStore: typeof import('./store/usePlanStore');
  parts: Record<string, unknown>;
  errors: string[];
  mountPlan: (overrides?: Record<string, unknown>) => string;
  mountParts: (names: string[], props?: Record<string, unknown>) => string;
  /** 报告每个可挂载值的 typeof，用于排除"传了个非组件" */
  probeParts: () => Record<string, string>;
}

async function exposeTestHarness() {
  if (import.meta.env.VITE_EXPOSE_TEST_HARNESS !== '1') return;

  const [
    { createElement, StrictMode },
    { MemoryRouter },
    { AuthContextForTests },
    planSurfaceMod,
    planStore,
    taskTreeMod,
  ] = await Promise.all([
    import('react'),
    import('react-router-dom'),
    import('./auth/AuthContext'),
    import('./components/plan/PlanSurface'),
    import('./store/usePlanStore'),
    import('./components/plan/PlanTaskTree'),
  ]);
  const completedMod = await import('./components/plan/PlanCompletedList');
  const statsMod = await import('./components/plan/PlanStatsPanel');

  const parts: Record<string, unknown> = {
    PlanSurface: planSurfaceMod.PlanSurface,
    PlanTaskTree: taskTreeMod.PlanTaskTree,
    PlanScopePicker: taskTreeMod.PlanScopePicker,
    PlanCompletedList: completedMod.PlanCompletedList,
    PlanStatsPanel: statsMod.PlanStatsPanel,
  };

  const errors: string[] = [];
  const recordError = (message: string) => errors.push(message);

  function ensureHost(): HTMLElement {
    let host = document.getElementById('harness-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'harness-root';
      document.body.appendChild(host);
    }
    return host;
  }

  const api: HarnessApi = {
    planStore,
    parts,
    errors,
    probeParts() {
      const ctx = AuthContextForTests as unknown as {
        Provider?: unknown;
        Consumer?: unknown;
        _currentValue?: unknown;
      };
      const report: Record<string, string> = {
        AuthContextForTests: typeof AuthContextForTests,
        authCtxKeys: ctx && typeof ctx === 'object' ? Object.keys(ctx).join(',') : 'n/a',
        authCtxProvider: typeof ctx?.Provider,
        MemoryRouter: typeof MemoryRouter,
        createElement: typeof createElement,
      };
      for (const [name, value] of Object.entries(parts)) report[name] = typeof value;
      return report;
    },
    mountParts(names, props = {}) {
      const host = ensureHost();
      const children = names.map((name, index) => {
        const Component = parts[name];
        if (typeof Component !== 'function') {
          errors.push(`未知组件: ${name}`);
          return null;
        }
        return createElement(Component as never, { key: index, ...props });
      });
      ReactDOM.createRoot(host).render(
        createElement(
          StrictMode,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement(HarnessErrorBoundary, { onError: recordError }, ...children),
          ),
        ),
      );
      return 'mounted-parts';
    },
    mountPlan(overrides = {}) {
      const session = {
        userId: 'harness-user',
        email: 'harness@local',
        role: 'user',
        token: 'harness-token',
        ...overrides,
      };
      const authValue = {
        session,
        loading: false,
        isGuest: !session,
        isAdmin: session?.role === 'admin',
        signIn: async () => {},
        signUp: async () => {},
        signOut: async () => {},
      };
      const host = ensureHost();
      // 指纹：把实际注入的上下文值写到 DOM，便于验证脚本核对
      host.setAttribute(
        'data-auth',
        JSON.stringify({
          hasSession: Boolean(authValue.session),
          token: authValue.session?.token ?? null,
          isGuest: authValue.isGuest,
        }),
      );

      ReactDOM.createRoot(host).render(
        createElement(
          StrictMode,
          null,
          createElement(
            MemoryRouter,
            null,
            createElement(
              HarnessErrorBoundary,
              { onError: recordError },
              // AuthContextForTests 是 context 对象，必须用它的 .Provider——
              // 直接把 context 当组件传给 createElement 会让 React 调用非函数而抛错
              createElement(
                (AuthContextForTests as unknown as { Provider: React.ComponentType<never> }).Provider,
                { value: authValue } as never,
                createElement(planSurfaceMod.PlanSurface, null),
              ),
            ),
          ),
        ),
      );
      return 'mounted';
    },
  };

  (window as unknown as { __wbTest: HarnessApi }).__wbTest = api;
}

async function bootstrap() {
  if (isInstalledShell()) {
    await purgeShellCaches();
  } else if ('serviceWorker' in navigator) {
    registerSW({ immediate: true });
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  await exposeTestHarness();
}

void bootstrap();
