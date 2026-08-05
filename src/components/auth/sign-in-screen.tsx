"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authClient } from "@/auth-client";
import { useT } from "@/lib/i18n";

export type AuthView = "sign-in" | "sign-up";
type SignInMethod = "password" | "email-code";
type SignupField = "name" | "username" | "email" | "password";
type SignupFieldErrors = Partial<Record<SignupField, string>>;
const pendingVerificationEmailKey = "ielts.pending-verification-email";
const signupFieldOrder: SignupField[] = [
  "name",
  "username",
  "email",
  "password",
];
const signupFieldIds: Record<SignupField, string> = {
  name: "signup-name",
  username: "signup-username",
  email: "signup-email",
  password: "signup-password",
};
const accountServiceUnavailableMessage =
  "The account service is temporarily unavailable. Your details are still in the form; try again in a moment.";

type SignInScreenProps = {
  initialView?: AuthView;
  returnTo?: string;
};

export function SignInScreen({
  initialView = "sign-in",
  returnTo = "/bank",
}: SignInScreenProps) {
  const { t } = useT();
  const [view, setView] = useState<AuthView>(initialView);
  const [method, setMethod] = useState<SignInMethod>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signupFieldErrors, setSignupFieldErrors] =
    useState<SignupFieldErrors>({});

  useEffect(() => {
    const pendingEmail = window.sessionStorage.getItem(
      pendingVerificationEmailKey,
    );

    if (!pendingEmail) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setView("sign-up");
      setVerificationEmail(pendingEmail);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function selectView(nextView: AuthView) {
    setView(nextView);
    forgetVerificationEmail();
    setVerificationCode("");
    setSignupFieldErrors({});
    clearFeedback();
  }

  function selectMethod(nextMethod: SignInMethod) {
    setMethod(nextMethod);
    setCodeSent(false);
    setCode("");
    clearFeedback();
  }

  function handleViewTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) {
    const nextView =
      event.key === "ArrowLeft" || event.key === "Home"
        ? "sign-in"
        : event.key === "ArrowRight" || event.key === "End"
          ? "sign-up"
          : null;

    if (!nextView) {
      return;
    }

    event.preventDefault();
    selectView(nextView);
    document.getElementById(`auth-${nextView}-tab`)?.focus();
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    const normalizedIdentifier = identifier.trim();
    try {
      const response = normalizedIdentifier.includes("@")
        ? await authClient.signIn.email({
            email: normalizedIdentifier,
            password,
            rememberMe,
            callbackURL: returnTo,
          })
        : await authClient.signIn.username({
            username: normalizedIdentifier,
            password,
            rememberMe,
            callbackURL: returnTo,
          });

      if (response.error) {
        if (
          response.error.code === "EMAIL_NOT_VERIFIED" &&
          normalizedIdentifier.includes("@")
        ) {
          rememberVerificationEmail(normalizedIdentifier);
          setNotice(
            "Your password is correct. Enter the code sent to your email to finish verification.",
          );
          return;
        }

        setError(
          authErrorMessage(
            response.error,
            "The email, username, or password did not match.",
          ),
        );
        return;
      }

      window.location.assign(returnTo);
    } catch {
      setError(accountServiceUnavailableMessage);
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailCode(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    const normalizedEmail = email.trim();
    const response = await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: "sign-in",
    });

    setBusy(false);

    if (response.error) {
      setError(
        authErrorMessage(
          response.error,
          "We could not send a code. Check the address and try again.",
        ),
      );
      return;
    }

    setEmail(normalizedEmail);
    setCodeSent(true);
    setNotice(
      "If this email belongs to an account, a six-digit code is on its way.",
    );
  }

  async function signInWithEmailCode(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    const response = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: code.trim(),
    });

    setBusy(false);

    if (response.error) {
      setError(
        authErrorMessage(
          response.error,
          "The code is invalid or expired. Request a new code.",
        ),
      );
      return;
    }

    window.location.assign(returnTo);
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();

    const normalizedName = name.trim();
    const normalizedEmail = signupEmail.trim();
    const normalizedUsername = username.trim();
    const fieldErrors = validateSignupFields({
      name: normalizedName,
      username: normalizedUsername,
      email: normalizedEmail,
      password: signupPassword,
    });

    if (Object.keys(fieldErrors).length > 0) {
      setSignupFieldErrors(fieldErrors);
      setError(signupErrorSummary(fieldErrors));
      focusFirstSignupError(fieldErrors);
      return;
    }

    setSignupFieldErrors({});
    setBusy(true);
    rememberVerificationEmail(normalizedEmail);

    try {
      const response = await authClient.signUp.email({
        name: normalizedName,
        email: normalizedEmail,
        password: signupPassword,
        username: normalizedUsername,
        displayUsername: normalizedUsername,
        callbackURL: returnTo,
      });

      if (response.error) {
        forgetVerificationEmail();
        const signupError = signupErrorDetails(response.error);
        setSignupFieldErrors(signupError.fields);
        setError(signupError.summary);
        focusFirstSignupError(signupError.fields);
        return;
      }

      setNotice(
        "Enter the six-digit code sent to your email to activate the account.",
      );
    } catch {
      forgetVerificationEmail();
      setError(
        "The account service could not complete this request. Your details are still in the form; try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyAccount(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!verificationEmail) {
      return;
    }

    setBusy(true);
    const response = await authClient.emailOtp.verifyEmail({
      email: verificationEmail,
      otp: verificationCode.trim(),
    });
    setBusy(false);

    if (response.error) {
      setError(
        authErrorMessage(
          response.error,
          "The code is invalid or expired. Request a new code.",
        ),
      );
      return;
    }

    forgetVerificationEmail();
    window.location.assign(returnTo);
  }

  async function resendVerificationCode() {
    clearFeedback();

    if (!verificationEmail) {
      return;
    }

    setBusy(true);
    const response = await authClient.emailOtp.sendVerificationOtp({
      email: verificationEmail,
      type: "email-verification",
    });
    setBusy(false);

    if (response.error) {
      setError(
        authErrorMessage(
          response.error,
          "We could not send a new code. Wait a moment and try again.",
        ),
      );
      return;
    }

    setVerificationCode("");
    setNotice("A new six-digit verification code is on its way.");
  }

  function clearFeedback() {
    setError(null);
    setNotice(null);
  }

  function updateSignupField(
    field: SignupField,
    value: string,
    updateValue: (value: string) => void,
  ) {
    updateValue(value);

    if (!signupFieldErrors[field]) {
      return;
    }

    const nextErrors = { ...signupFieldErrors };
    delete nextErrors[field];
    setSignupFieldErrors(nextErrors);
    setError(
      Object.keys(nextErrors).length > 0
        ? signupErrorSummary(nextErrors)
        : null,
    );
  }

  function rememberVerificationEmail(pendingEmail: string) {
    window.sessionStorage.setItem(
      pendingVerificationEmailKey,
      pendingEmail,
    );
    setView("sign-up");
    setVerificationEmail(pendingEmail);
  }

  function forgetVerificationEmail() {
    window.sessionStorage.removeItem(pendingVerificationEmailKey);
    setVerificationEmail(null);
  }

  return (
    <div className="auth-drawer-panel">
      <div className="auth-drawer-heading">
        <div>
          <span className="mode-label">
            <i aria-hidden="true" /> IELTS Speaking Trainer
          </span>
          <p>{t("brand.full")}</p>
        </div>
        <Link
          aria-label={t("common.close")}
          className="auth-drawer-close"
          href="/"
        >
          <span aria-hidden="true">×</span>
        </Link>
      </div>

      <section className="signin-shell">
        <div className="signin-panel">
          <header className="signin-intro">
            <h2 id="account-access-title">
              {view === "sign-in" ? t("auth.signIn.title") : t("auth.signUp.title")}
            </h2>
            <p>
              {view === "sign-in"
                ? t("auth.signIn.title")
                : t("auth.create.subtitle")}
            </p>
          </header>
          <section className="signin-auth" aria-label="Account access">
            <div
              aria-label="Account action"
              className="auth-view-tabs"
              data-active-view={view}
              role="tablist"
            >
              <button
                aria-controls="auth-view-panel"
                aria-selected={view === "sign-in"}
                id="auth-sign-in-tab"
                onClick={() => selectView("sign-in")}
                onKeyDown={handleViewTabKeyDown}
                role="tab"
                tabIndex={view === "sign-in" ? 0 : -1}
                type="button"
              >
                {t("auth.tab.signIn")}
              </button>
              <button
                aria-controls="auth-view-panel"
                aria-selected={view === "sign-up"}
                id="auth-sign-up-tab"
                onClick={() => selectView("sign-up")}
                onKeyDown={handleViewTabKeyDown}
                role="tab"
                tabIndex={view === "sign-up" ? 0 : -1}
                type="button"
              >
                {t("auth.tab.signUp")}
              </button>
            </div>

            <div
              aria-labelledby={
                view === "sign-in" ? "auth-sign-in-tab" : "auth-sign-up-tab"
              }
              id="auth-view-panel"
              role="tabpanel"
            >
              {verificationEmail ? (
                <VerificationForm
                  busy={busy}
                  code={verificationCode}
                  email={verificationEmail}
                  onCodeChange={setVerificationCode}
                  onResend={() => void resendVerificationCode()}
                  onSubmit={verifyAccount}
                  onUseAnotherEmail={() => {
                    forgetVerificationEmail();
                    setVerificationCode("");
                    clearFeedback();
                  }}
                />
              ) : view === "sign-in" ? (
                <>
                  <div
                    aria-label="Sign-in method"
                    className="auth-method-switch"
                    data-active-method={method}
                    role="group"
                  >
                    <button
                      aria-pressed={method === "password"}
                      onClick={() => selectMethod("password")}
                      type="button"
                    >
                      {t("auth.method.password")}
                    </button>
                    <button
                      aria-pressed={method === "email-code"}
                      onClick={() => selectMethod("email-code")}
                      type="button"
                    >
                      {t("auth.method.emailCode")}
                    </button>
                  </div>

                  {method === "password" ? (
                    <form className="auth-form" onSubmit={signInWithPassword}>
                      <AuthField label={t("auth.field.identifier")} htmlFor="signin-identifier">
                        <input
                          autoComplete="username"
                          id="signin-identifier"
                          onChange={(event) => setIdentifier(event.target.value)}
                          required
                          value={identifier}
                        />
                      </AuthField>
                      <AuthField label={t("auth.field.password")} htmlFor="signin-password">
                        <input
                          autoComplete="current-password"
                          id="signin-password"
                          maxLength={128}
                          minLength={8}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          type="password"
                          value={password}
                        />
                      </AuthField>
                      <label className="auth-remember">
                        <input
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.target.checked)}
                          type="checkbox"
                        />
                        <span>{t("auth.remember")}</span>
                      </label>
                      <button
                        className="primary-button full-width"
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? t("auth.submit.signInBusy") : t("auth.submit.signIn")}
                      </button>
                    </form>
                  ) : codeSent ? (
                    <form className="auth-form" onSubmit={signInWithEmailCode}>
                      <p className="auth-context">
                        {t("auth.codeSentTo")} <strong>{email}</strong>
                      </p>
                      <AuthField label={t("auth.field.code")} htmlFor="signin-code">
                        <input
                          autoComplete="one-time-code"
                          id="signin-code"
                          inputMode="numeric"
                          maxLength={6}
                          onChange={(event) =>
                            setCode(event.target.value.replace(/\D/gu, ""))
                          }
                          pattern="[0-9]{6}"
                          required
                          value={code}
                        />
                      </AuthField>
                      <button
                        className="primary-button full-width"
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? t("auth.submit.verifying") : t("auth.submit.verify")}
                      </button>
                      <button
                        className="auth-inline-action"
                        onClick={() => {
                          setCodeSent(false);
                          setCode("");
                          clearFeedback();
                        }}
                        type="button"
                      >
                        {t("auth.useAnotherEmail")}
                      </button>
                    </form>
                  ) : (
                    <form className="auth-form" onSubmit={requestEmailCode}>
                      <AuthField label={t("auth.field.email")} htmlFor="code-email">
                        <input
                          autoComplete="email"
                          id="code-email"
                          onChange={(event) => setEmail(event.target.value)}
                          required
                          type="email"
                          value={email}
                        />
                      </AuthField>
                      <button
                        className="primary-button full-width"
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? t("auth.submit.sendingCode") : t("auth.submit.sendCode")}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <form className="auth-form" noValidate onSubmit={createAccount}>
                  <div className="auth-form-row">
                    <AuthField
                      error={signupFieldErrors.name}
                      label={t("auth.field.name")}
                      htmlFor="signup-name"
                    >
                      <input
                        aria-describedby={
                          signupFieldErrors.name ? "signup-name-error" : undefined
                        }
                        aria-invalid={signupFieldErrors.name ? "true" : undefined}
                        autoComplete="name"
                        id="signup-name"
                        maxLength={80}
                        minLength={2}
                        onChange={(event) =>
                          updateSignupField("name", event.target.value, setName)
                        }
                        required
                        value={name}
                      />
                    </AuthField>
                    <AuthField
                      error={signupFieldErrors.username}
                      label={t("auth.field.username")}
                      htmlFor="signup-username"
                    >
                      <input
                        aria-describedby={
                          signupFieldErrors.username
                            ? "signup-username-error"
                            : undefined
                        }
                        aria-invalid={signupFieldErrors.username ? "true" : undefined}
                        autoComplete="username"
                        id="signup-username"
                        maxLength={30}
                        minLength={3}
                        onChange={(event) =>
                          updateSignupField("username", event.target.value, setUsername)
                        }
                        pattern="[A-Za-z0-9_.]+"
                        required
                        value={username}
                      />
                    </AuthField>
                  </div>
                  <AuthField
                    error={signupFieldErrors.email}
                    label={t("auth.field.email")}
                    htmlFor="signup-email"
                  >
                    <input
                      aria-describedby={
                        signupFieldErrors.email ? "signup-email-error" : undefined
                      }
                      aria-invalid={signupFieldErrors.email ? "true" : undefined}
                      autoComplete="email"
                      id="signup-email"
                      onChange={(event) =>
                        updateSignupField("email", event.target.value, setSignupEmail)
                      }
                      required
                      type="email"
                      value={signupEmail}
                    />
                  </AuthField>
                  <AuthField
                    error={signupFieldErrors.password}
                    label={t("auth.field.password")}
                    htmlFor="signup-password"
                  >
                    <input
                      aria-describedby={
                        signupFieldErrors.password
                          ? "signup-password-error"
                          : "signup-password-help"
                      }
                      aria-invalid={signupFieldErrors.password ? "true" : undefined}
                      autoComplete="new-password"
                      id="signup-password"
                      maxLength={128}
                      minLength={8}
                      onChange={(event) =>
                        updateSignupField("password", event.target.value, setSignupPassword)
                      }
                      required
                      type="password"
                      value={signupPassword}
                    />
                    {signupFieldErrors.password ? null : (
                      <small id="signup-password-help">
                        {t("auth.passwordHelp")}
                      </small>
                    )}
                  </AuthField>
                  <button
                    className="primary-button full-width"
                    disabled={busy}
                    type="submit"
                  >
                    {busy ? t("auth.submit.createBusy") : t("auth.submit.create")}
                  </button>
                </form>
              )}

              <div
                aria-live="polite"
                className="auth-feedback"
                data-visible={Boolean(error || notice)}
              >
                {error ? (
                  <p className="signin-error" role="alert">
                    {error}
                  </p>
                ) : notice ? (
                  <p className="signin-notice">{notice}</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function VerificationForm({
  busy,
  code,
  email,
  onCodeChange,
  onResend,
  onSubmit,
  onUseAnotherEmail,
}: {
  busy: boolean;
  code: string;
  email: string;
  onCodeChange: (code: string) => void;
  onResend: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onUseAnotherEmail: () => void;
}) {
  const { t } = useT();
  return (
    <form className="auth-form auth-verification" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">{t("auth.verifyEmail.title")}</p>
        <p className="auth-context">
          {t("auth.codeSentTo")} <strong>{email}</strong>.
        </p>
      </div>
      <AuthField label={t("auth.field.code")} htmlFor="verification-code">
        <input
          autoComplete="one-time-code"
          id="verification-code"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) =>
            onCodeChange(event.target.value.replace(/\D/gu, ""))
          }
          pattern="[0-9]{6}"
          required
          value={code}
        />
      </AuthField>
      <button
        className="primary-button full-width"
        disabled={busy}
        type="submit"
      >
        {busy ? t("auth.submit.verifying") : t("auth.submit.verifyAndContinue")}
      </button>
      <div className="auth-secondary-actions">
        <button
          className="auth-inline-action"
          disabled={busy}
          onClick={onResend}
          type="button"
        >
          {t("auth.resendCode")}
        </button>
        <button
          className="auth-inline-action"
          disabled={busy}
          onClick={onUseAnotherEmail}
          type="button"
        >
          {t("auth.useAnotherEmail")}
        </button>
      </div>
    </form>
  );
}

function AuthField({
  children,
  error,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className={`auth-field${error ? " auth-field-invalid" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <small className="auth-field-error" id={`${htmlFor}-error`}>
          {error}
        </small>
      ) : null}
    </div>
  );
}

function validateSignupFields({
  name,
  username,
  email,
  password,
}: {
  name: string;
  username: string;
  email: string;
  password: string;
}): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  if (name.length < 2 || name.length > 80) {
    errors.name = "Enter your name using 2–80 characters.";
  }

  if (
    username.length < 3 ||
    username.length > 30 ||
    !/^[A-Za-z0-9_.]+$/u.test(username)
  ) {
    errors.username = "Use 3–30 letters, numbers, dots, or underscores.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (password.length < 8 || password.length > 128) {
    errors.password = "Use 8–128 characters.";
  }

  return errors;
}

function signupErrorDetails(error: {
  code?: string;
  status?: number;
}): {
  fields: SignupFieldErrors;
  summary: string;
} {
  const fields: SignupFieldErrors = {};

  switch (error.code) {
    case "USERNAME_IS_ALREADY_TAKEN":
      fields.username = "This username is already in use. Choose another.";
      break;
    case "INVALID_USERNAME":
      fields.username =
        "Use 3–30 letters, numbers, dots, or underscores.";
      break;
    case "INVALID_EMAIL":
      fields.email = "Enter a valid email address.";
      break;
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      fields.email =
        "An account already uses this email. Sign in or use another email.";
      break;
    case "PASSWORD_TOO_SHORT":
      fields.password = "Use at least 8 characters.";
      break;
    case "PASSWORD_TOO_LONG":
      fields.password = "Use no more than 128 characters.";
      break;
  }

  if (Object.keys(fields).length > 0) {
    return {
      fields,
      summary: signupErrorSummary(fields),
    };
  }

  return {
    fields,
    summary:
      error.status === 429
        ? "Too many attempts. Wait a few minutes before trying again."
        : "The account service could not complete this request. Your details are still in the form; try again in a moment.",
  };
}

function signupErrorSummary(errors: SignupFieldErrors) {
  const labels = signupFieldOrder
    .filter((field) => Boolean(errors[field]))
    .map((field) => signupFieldLabelsDefault[field]);
  const fieldList =
    labels.length > 2
      ? `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
      : labels[0];

  return `Fix the highlighted ${
    labels.length === 1 ? "field" : "fields"
  }: ${fieldList}.`;
}

const signupFieldLabelsDefault: Record<SignupField, string> = {
  name: "Your name",
  username: "Username",
  email: "Email",
  password: "Password",
};

function focusFirstSignupError(errors: SignupFieldErrors) {
  const firstInvalidField = signupFieldOrder.find((field) => errors[field]);

  if (!firstInvalidField) {
    return;
  }

  queueMicrotask(() => {
    document.getElementById(signupFieldIds[firstInvalidField])?.focus();
  });
}

function authErrorMessage(
  error: { code?: string; status?: number },
  fallback: string,
) {
  if (
    error.status === undefined ||
    error.status >= 500 ||
    error.code === "AUTH_SERVICE_UNAVAILABLE"
  ) {
    return accountServiceUnavailableMessage;
  }

  if (error.status === 429) {
    return "Too many attempts. Wait a few minutes before trying again.";
  }

  if (error.code === "OTP_EXPIRED") {
    return "This code has expired. Request a new code.";
  }

  if (error.code === "TOO_MANY_ATTEMPTS") {
    return "Too many incorrect codes. Request a new code.";
  }

  if (error.code === "INVALID_OTP") {
    return "The code is invalid. Check all six digits and try again.";
  }

  if (
    error.code === "USERNAME_IS_ALREADY_TAKEN" ||
    error.code === "INVALID_USERNAME"
  ) {
    return "Choose a different username using letters, numbers, dots, or underscores.";
  }

  return fallback;
}
