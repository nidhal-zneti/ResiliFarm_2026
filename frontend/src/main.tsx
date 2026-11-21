import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "leaflet/dist/leaflet.css";
import "./style.css";
import App from "./App";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ResiliFarm page render failed", error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <main role="alert" style={{ maxWidth: 900, margin: "10vh auto", padding: 32 }}>
          <h1>Page could not render</h1>
          <p>{this.state.message}</p>
          <button onClick={() => window.location.reload()}>Reload page</button>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
