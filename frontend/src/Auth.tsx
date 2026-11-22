import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Leaf,
  Lock,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { api } from "./api";
import { Panel } from "./components";
import type { AuthResponse, User } from "./types";

const FEATURES = ["twin", "agriculture", "water", "energy"] as const;

export function AuthScreen({
  onAuthenticated,
  heading,
}: {
  onAuthenticated: (result: AuthResponse) => void;
  heading?: string;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResponse>(
        mode === "signin" ? "/auth/login" : "/auth/signup",
        mode === "signin"
          ? { email, password }
          : { email, password, full_name: fullName },
      );
      onAuthenticated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-hero">
        <div className="auth-hero-top">
          <span className="auth-hero-logo">
            <Leaf size={22} />
          </span>
          <span>
            ResiliFarm<span className="brand-ai">AI</span>
          </span>
        </div>
        <div className="auth-hero-body">
          <h1>{t("welcome")}</h1>
          <p>{t("overviewSub")}</p>
          <ul className="auth-features">
            {FEATURES.map((key) => (
              <li key={key}>
                <CheckCircle2 size={18} />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
        <span className="auth-hero-tagline">{t("tagline")}</span>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">
          {heading && (
            <div className="auth-lock">
              <Lock size={15} />
              {heading}
            </div>
          )}
          <h2>{t(mode === "signin" ? "signIn" : "signUp")}</h2>
          <p className="auth-sub">{t("authIntro")}</p>
          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                {t("fullName")}
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              {t("email")}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label>
              {t("password")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : 1}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
              />
            </label>
            {error && (
              <p role="alert" className="notice warning">
                {t(error, { defaultValue: t("error") })}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {mode === "signin" ? <LogIn size={17} /> : <UserPlus size={17} />}
              {t(mode === "signin" ? "signIn" : "signUp")}
            </button>
          </form>
          <div className="auth-switch">
            <span>{t(mode === "signin" ? "noAccount" : "haveAccount")}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
            >
              {t(mode === "signin" ? "signUp" : "signIn")}
            </button>
          </div>
          {mode === "signup" && (
            <button type="button" className="text-button" onClick={() => setMode("signin")}>
              Sign in instead
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function ProfileView({
  user,
  onUpdate,
  onSignOut,
}: {
  user: User;
  onUpdate: (user: User) => void;
  onSignOut: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{
    error?: string;
    success?: string;
  }>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    error?: string;
    success?: string;
  }>({});

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileStatus({});
    try {
      const updated = await api<User>("/auth/profile", {
        email,
        full_name: fullName,
      });
      onUpdate(updated);
      setProfileStatus({ success: t("profileUpdated") });
    } catch (e) {
      setProfileStatus({
        error: t((e as Error).message, { defaultValue: t("error") }),
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordStatus({});
    try {
      await api("/auth/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordStatus({ success: t("passwordUpdated") });
    } catch (e) {
      setPasswordStatus({
        error: t((e as Error).message, { defaultValue: t("error") }),
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div className="profile-grid">
      <Panel title={t("accountInfo")}>
        <dl className="readings">
          <div>
            <dt>{t("role")}</dt>
            <dd>
              <span className="badge">{t(user.role)}</span>
            </dd>
          </div>
          <div>
            <dt>{t("memberSince")}</dt>
            <dd>
              {new Date(user.created_at).toLocaleDateString(i18n.language)}
            </dd>
          </div>
        </dl>
        <form className="auth-form" onSubmit={saveProfile}>
          <label>
            {t("fullName")}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            {t("email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {profileStatus.error && (
            <p role="alert" className="notice warning">
              {profileStatus.error}
            </p>
          )}
          {profileStatus.success && (
            <p className="success">{profileStatus.success}</p>
          )}
          <button className="primary" type="submit" disabled={profileBusy}>
            {t("updateProfile")}
          </button>
        </form>
      </Panel>
      <Panel title={t("changePassword")}>
        <form className="auth-form" onSubmit={changePassword}>
          <label>
            {t("currentPassword")}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            {t("newPassword")}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {passwordStatus.error && (
            <p role="alert" className="notice warning">
              {passwordStatus.error}
            </p>
          )}
          {passwordStatus.success && (
            <p className="success">{passwordStatus.success}</p>
          )}
          <button className="primary" type="submit" disabled={passwordBusy}>
            {t("changePassword")}
          </button>
        </form>
        <button type="button" className="sign-out" onClick={onSignOut}>
          <LogOut size={16} />
          {t("signOut")}
        </button>
      </Panel>
    </div>
  );
}
