import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="es">
      {icon ? <div className="es-icon">{icon}</div> : null}
      <h3 className="es-title">{title}</h3>
      {body ? <p className="es-body">{body}</p> : null}
      {action ? <div className="es-action">{action}</div> : null}
    </div>
  );
}
