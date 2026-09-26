import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * 空态。
 *
 * `icon` 从「emoji 字符串」改为图标名：原来传 `🗂️ / 📄 / 📝`，
 * emoji 会随 font-size 被动缩放、无法跟随主题色，且三端字形不一致。
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="es">
      {icon ? (
        <div className="es-icon" aria-hidden="true">
          <Icon name={icon} size={24} />
        </div>
      ) : null}
      <h3 className="es-title">{title}</h3>
      {body ? <p className="es-body">{body}</p> : null}
      {action ? <div className="es-action">{action}</div> : null}
    </div>
  );
}
