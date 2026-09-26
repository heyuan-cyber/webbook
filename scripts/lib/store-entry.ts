/**
 * 测试入口：把 web 侧 store 汇总成一个模块，供 Node 断言脚本 import。
 *
 * 这些 store 依赖 Vite 注入的 `import.meta.env` 与 `@/` 别名，
 * Node 都不能直接跑——由 scripts/assert-plan-store.mjs 用 esbuild 打包后再加载。
 */
export { usePlanStore, setPlanToken, visibleTasksForScope, scopeLabel } from '@/store/usePlanStore';
export { useNotesStore } from '@/store/useNotesStore';
export { planFoldState } from '@/lib/storage';
export { ApiError, PlanConflictError } from '@/lib/api';
