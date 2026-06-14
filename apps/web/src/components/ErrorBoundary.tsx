import { Component, type ErrorInfo, type ReactNode } from 'react';
import { toast } from '@/store/useToastStore';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('WebBook render error', error, info);
    toast('error', '页面出错，请刷新后重试');
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-fallback">
          <h2>出了点问题</h2>
          <p className="muted">{this.state.error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
