import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  BriefcaseIcon,
  EyeIcon,
  EyeOffIcon,
  SunIcon,
  MoonIcon,
} from "../common/Icons";

export function AuthForm({ mode = "login" }) {
  const isForgotPassword = mode === "forgot-password";
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const {
    user,
    authenticate,
    authLoading,
    authError,
    authSuccess,
    setAuthError,
    setAuthSuccess,
  } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [submittingForgot, setSubmittingForgot] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [clientErrors, setClientErrors] = useState({});

  if (user) {
    const isElevated = user.role === "admin" || user.role === "superadmin";
    return (
      <Navigate to={isElevated ? "/admin" : "/dashboard"} replace />
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (clientErrors[name]) {
      setClientErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const errors = {};
    const emailTrimmed = formData.email.trim();

    if (!emailTrimmed) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      errors.email = "Please enter a valid work email address.";
    }

    if (!isForgotPassword) {
      if (!formData.password) {
        errors.password = "Password is required.";
      } else if (formData.password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
      }
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");

    if (!validateForm()) return;

    const email = formData.email.trim().toLowerCase();

    if (isForgotPassword) {
      setSubmittingForgot(true);
      try {
        const response = await api.post("/auth/forgot-password", { email });
        setAuthSuccess(
          response.data?.message ||
            "If an account exists for this email, password assistance has been initiated. You may also contact your Super Admin directly.",
        );
      } catch (err) {
        setAuthError(
          err.response?.data?.message ||
            "Failed to submit password reset request. Please try again.",
        );
      } finally {
        setSubmittingForgot(false);
      }
      return;
    }

    const password = formData.password;
    const result = await authenticate("login", { email, password });

    if (!result) return;

    setFormData({ name: "", email: "", password: "" });
    setShowPassword(false);

    const isElevated =
      result.role === "admin" || result.role === "superadmin";
    navigate(isElevated ? "/admin" : "/dashboard", {
      replace: true,
    });
  };

  const isLoading = authLoading || submittingForgot;

  return (
    <div className="min-h-screen flex bg-canvas text-text-primary transition-colors">
      {/* NARROW SIDE PANEL (Desktop): Brand pine color holding logo and purpose */}
      <aside className="hidden lg:flex w-72 xl:w-80 bg-brand text-brand-text p-8 xl:p-10 flex-col shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-brand-text">
            <BriefcaseIcon className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">RankRise</span>
        </div>

        <div className="mt-20">
          <p className="text-base font-medium leading-relaxed opacity-95">
            A focused workspace for projects, tasks, and teams.
          </p>
        </div>
      </aside>

      {/* MAIN FORM COLUMN: Centered, max-w-[400px], calm whitespace */}
      <main className="flex-1 flex flex-col justify-between min-h-screen p-6 sm:p-10 lg:p-12 overflow-y-auto">
        {/* Top Header Bar with Theme Toggle */}
        <div className="flex items-center justify-between">
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-text">
              <BriefcaseIcon className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-text-primary">
              RankRise
            </span>
          </div>
          <div className="hidden lg:block" />

          {/* Fully visible, correctly padded theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors shadow-subtle cursor-pointer"
          >
            {theme === "dark" ? (
              <>
                <SunIcon className="h-4 w-4 text-accent" />
                <span>Light</span>
              </>
            ) : (
              <>
                <MoonIcon className="h-4 w-4 text-text-secondary" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>

        {/* Center Form Section (max-w-[400px]) */}
        <div className="mx-auto w-full max-w-[400px] my-auto py-8 text-left">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary font-heading">
              {isForgotPassword ? "Forgot password" : "Sign in"}
            </h1>
            <p className="text-sm text-text-secondary leading-relaxed">
              {isForgotPassword
                ? "Enter your registered email address to receive password assistance."
                : "Manage your projects, tasks, and team in one place."}
            </p>
          </div>

          {/* Form Feedback Alerts */}
          {authError && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-[#FBD6BA] bg-[#FFF4EC] p-3 text-sm font-medium text-accent dark:border-[#5C2A10] dark:bg-[#341708]"
            >
              {authError}
            </div>
          )}

          {authSuccess && (
            <div
              role="status"
              className="mt-4 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-sm font-medium text-brand dark:border-[#14532D] dark:bg-[#052E16]"
            >
              {authSuccess}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-text-secondary"
              >
                Work Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={isLoading}
                value={formData.email}
                onChange={handleChange}
                placeholder="name@rankrise.com"
                className={`h-10 w-full rounded-md border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-tertiary transition-colors shadow-subtle ${
                  clientErrors.email
                    ? "border-accent focus:border-accent focus:ring-1 focus:ring-accent"
                    : "border-border focus:border-brand focus:ring-1 focus:ring-brand"
                }`}
              />
              {clientErrors.email && (
                <p className="mt-1 text-[13px] text-accent font-medium">
                  {clientErrors.email}
                </p>
              )}
            </div>

            {!isForgotPassword && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="text-[13px] font-medium text-text-secondary"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[12px] font-medium text-brand hover:underline underline-offset-2"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    minLength={6}
                    maxLength={128}
                    disabled={isLoading}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••••••"
                    className={`h-10 w-full rounded-md border bg-surface pl-3 pr-10 text-sm text-text-primary outline-none placeholder:text-text-tertiary transition-colors shadow-subtle ${
                      clientErrors.password
                        ? "border-accent focus:border-accent focus:ring-1 focus:ring-accent"
                        : "border-border focus:border-brand focus:ring-1 focus:ring-brand"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 rounded p-0.5 text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {clientErrors.password && (
                  <p className="mt-1 text-[13px] text-accent font-medium">
                    {clientErrors.password}
                  </p>
                )}
              </div>
            )}

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand hover:bg-brand-hover text-brand-text px-4 text-sm font-medium shadow-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-text border-t-transparent" />
                  <span>{isForgotPassword ? "Submitting request..." : "Signing in..."}</span>
                </span>
              ) : (
                <span>{isForgotPassword ? "Request Password Reset" : "Sign in"}</span>
              )}
            </button>
          </form>

          {/* Prompt section */}
          {isForgotPassword ? (
            <div className="mt-6 text-sm text-text-secondary text-left">
              <span>Remember your password? </span>
              <Link
                to="/login"
                className="font-medium text-text-primary underline underline-offset-4 hover:text-brand transition-colors"
              >
                Back to Sign in
              </Link>
            </div>
          ) : (
            <div className="mt-6 text-[12px] text-text-tertiary text-left">
              <span>Need an account? Please contact your Super Administrator.</span>
            </div>
          )}
        </div>

        {/* Clean, Grounded Footer aligned with the form column */}
        <div className="mx-auto w-full max-w-[400px] pt-6 border-t border-border/80 text-left">
          <p className="text-[13px] text-text-tertiary">
            © {new Date().getFullYear()} RankRise. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}

export default AuthForm;
