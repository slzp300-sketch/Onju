import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('dynamically imported module') ||
    /Loading chunk \d+ failed/.test(error.message)
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    if (this.state.isChunkError) {
      return (
        <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6 text-center gap-4">
          <div className="text-4xl">🔄</div>
          <p className="text-body1 font-bold text-label-strong">앱이 업데이트됐어요</p>
          <p className="text-body2 text-label-alt">새 버전을 불러오려면 새로고침이 필요해요.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-primary text-white font-semibold rounded-xl text-body2"
          >
            새로고침
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-body1 font-bold text-label-strong">오류가 발생했어요</p>
        <p className="text-body2 text-label-alt">잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-primary text-white font-semibold rounded-xl text-body2"
        >
          새로고침
        </button>
      </div>
    );
  }
}
