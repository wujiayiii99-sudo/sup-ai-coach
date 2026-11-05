import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** 全局错误边界：捕获未处理的渲染错误，避免白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("页面渲染出错：", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="setup-page">
          <div className="setup-form">
            <h1 className="setup-title">网络开小差了</h1>
            <p className="setup-hint">页面加载出错，请点击下方按钮刷新重试。</p>
            <button
              className="setup-submit"
              type="button"
              onClick={this.handleReload}
            >
              刷新重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
