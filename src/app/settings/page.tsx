"use client";

import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CreditCard,
  Download,
  EyeOff,
  FileText,
  Globe,
  Loader2,
  Lock,
  Moon,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { readActivityAnalytics } from "@/lib/activityAnalytics";
import { supabase } from "../../../lib/superbaseClient";
import {
  applyDarkMode,
  broadcastAccountSettings,
  getAccountSettingsStorageKey,
  persistDarkModeSetting,
  readDarkModeSetting,
} from "@/lib/accountSettings";
import { clearClientSession, getVerifiedAuthUser } from "@/lib/clientAuth";

type NotificationSettings = {
  accountActivity: boolean;
  securityAlerts: boolean;
  productUpdates: boolean;
};

type ProfileSettings = {
  name: string;
  gender: string;
  age: string;
  email: string;
};

type PrivacySettings = {
  profileVisibility: boolean;
  searchIndexing: boolean;
  dataSharing: boolean;
};

type AccountSettings = {
  darkMode: boolean;
  language: string;
  notificationsEnabled: boolean;
  notifications: NotificationSettings;
  profile: ProfileSettings;
  privacy: PrivacySettings;
};

type FlashMessage = {
  tone: "success" | "error" | "info";
  text: string;
} | null;

const DEFAULT_SETTINGS: AccountSettings = {
  darkMode: false,
  language: "en",
  notificationsEnabled: true,
  notifications: {
    accountActivity: true,
    securityAlerts: true,
    productUpdates: true,
  },
  profile: {
    name: "",
    gender: "",
    age: "",
    email: "",
  },
  privacy: {
    profileVisibility: true,
    searchIndexing: false,
    dataSharing: false,
  },
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "fr", label: "French" },
];

const GENDERS = [
  "Male 🗿",
  "Female 👗",
  "Non-binary (Chakka👺)",
  "Prefer not to say 🏳️‍🌈",
];

function mergeSettings(raw: unknown): AccountSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const data = raw as Partial<AccountSettings>;
  return {
    darkMode: data.darkMode ?? DEFAULT_SETTINGS.darkMode,
    language: data.language ?? DEFAULT_SETTINGS.language,
    notificationsEnabled:
      data.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled,
    notifications: {
      accountActivity:
        data.notifications?.accountActivity ??
        DEFAULT_SETTINGS.notifications.accountActivity,
      securityAlerts:
        data.notifications?.securityAlerts ??
        DEFAULT_SETTINGS.notifications.securityAlerts,
      productUpdates:
        data.notifications?.productUpdates ??
        DEFAULT_SETTINGS.notifications.productUpdates,
    },
    profile: {
      name: data.profile?.name ?? DEFAULT_SETTINGS.profile.name,
      gender: data.profile?.gender ?? DEFAULT_SETTINGS.profile.gender,
      age: data.profile?.age ?? DEFAULT_SETTINGS.profile.age,
      email: data.profile?.email ?? DEFAULT_SETTINGS.profile.email,
    },
    privacy: {
      profileVisibility:
        data.privacy?.profileVisibility ??
        DEFAULT_SETTINGS.privacy.profileVisibility,
      searchIndexing:
        data.privacy?.searchIndexing ?? DEFAULT_SETTINGS.privacy.searchIndexing,
      dataSharing:
        data.privacy?.dataSharing ?? DEFAULT_SETTINGS.privacy.dataSharing,
    },
  };
}

export default function AccountSettingsPage() {
  const [settings, setSettings] = useState<AccountSettings>(() => ({
    ...DEFAULT_SETTINGS,
    darkMode: readDarkModeSetting(),
  }));
  const [password, setPassword] = useState({ next: "", confirm: "" });
  const [flash, setFlash] = useState<FlashMessage>(null);
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const profileInitials = useMemo(() => {
    if (!settings.profile.name.trim()) return "U";
    return settings.profile.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [settings.profile.name]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const emailFromLocal =
        localStorage.getItem("auth_email") ||
        localStorage.getItem("userEmail") ||
        "";

      const raw = localStorage.getItem(getAccountSettingsStorageKey());
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (mounted) {
            setSettings(() => {
              const merged = mergeSettings(parsed);
              return {
                ...merged,
                darkMode: readDarkModeSetting(),
                profile: {
                  ...merged.profile,
                  email: merged.profile.email || emailFromLocal,
                },
              };
            });
          }
        } catch {
          if (mounted) {
            setFlash({
              tone: "error",
              text: "Failed to read previous settings.",
            });
          }
        }
      } else if (mounted && emailFromLocal) {
        setSettings((prev) => ({
          ...prev,
          profile: { ...prev.profile, email: emailFromLocal },
        }));
      }

      const { user } = await getVerifiedAuthUser();
      if (mounted && user) {
        setSettings((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            name:
              (user.user_metadata?.full_name as string) || prev.profile.name,
            gender:
              (user.user_metadata?.gender as string) || prev.profile.gender,
            age: user.user_metadata?.age
              ? String(user.user_metadata.age)
              : prev.profile.age,
            email: user.email || prev.profile.email,
          },
        }));
      }

      if (mounted) setIsLoaded(true);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? "";
      setSettings((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          email,
        },
      }));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyDarkMode(settings.darkMode);
    persistDarkModeSetting(settings.darkMode);
    broadcastAccountSettings({ darkMode: settings.darkMode });
  }, [settings.darkMode]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const desktopPopupVariants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 20, scale: 0.95 },
  };

  const mobilePopupVariants = {
    initial: { opacity: 0, y: "100%" },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: "100%" },
  };

  const updateProfile = <K extends keyof ProfileSettings>(
    key: K,
    value: ProfileSettings[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      profile: { ...prev.profile, [key]: value },
    }));
  };

  const updateNotification = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  };

  const updatePrivacy = <K extends keyof PrivacySettings>(
    key: K,
    value: PrivacySettings[K],
  ) => {
    setSettings((prev) => ({
      ...prev,
      privacy: { ...prev.privacy, [key]: value },
    }));
  };

  const validateBeforeSave = (): string | null => {
    if (!settings.profile.name.trim()) return "Name is required.";
    if (settings.profile.age) {
      const numericAge = Number(settings.profile.age);
      if (Number.isNaN(numericAge) || numericAge < 13 || numericAge > 120) {
        return "Age must be between 13 and 120.";
      }
    }

    if (password.next || password.confirm) {
      if (password.next.length < 6) {
        return "New password must be at least 6 characters.";
      }
      if (password.next !== password.confirm) {
        return "Password and confirm password do not match.";
      }
    }
    return null;
  };

  const handleSaveAll = async () => {
    const validationError = validateBeforeSave();
    if (validationError) {
      setFlash({ tone: "error", text: validationError });
      return;
    }

    setIsSaving(true);
    try {
      const metadata: Record<string, unknown> = {
        full_name: settings.profile.name.trim(),
        gender: settings.profile.gender,
        age: settings.profile.age ? Number(settings.profile.age) : null,
        language: settings.language,
        notifications: settings.notifications,
        privacy: settings.privacy,
      };

      const payload: { data: Record<string, unknown>; password?: string } = {
        data: metadata,
      };
      if (password.next) payload.password = password.next;

      const { error } = await supabase.auth.updateUser(payload);
      if (error) {
        setFlash({
          tone: "error",
          text: `Saved locally, but account sync failed: ${error.message}`,
        });
      } else {
        setFlash({
          tone: "success",
          text: "Settings saved successfully! 🎉 Language preferences are coming soon for select members. Stay tuned! 🌍✨",
        });
      }

      localStorage.setItem(
        getAccountSettingsStorageKey(),
        JSON.stringify(settings),
      );
      broadcastAccountSettings({ darkMode: settings.darkMode });
      setPassword({ next: "", confirm: "" });
    } catch {
      setFlash({ tone: "error", text: "Something went wrong while saving." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== "DELETE") {
      setFlash({
        tone: "error",
        text: "Please type DELETE exactly to confirm account deletion.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        setFlash({
          tone: "error",
          text: "You must be logged in to delete your account.",
        });
        return;
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFlash({
          tone: "error",
          text: payload.error || "Failed to delete account.",
        });
        return;
      }

      clearClientSession(session.user.email);
      broadcastAccountSettings({ darkMode: false });
      await supabase.auth.signOut();

      window.location.href = "/auth/register";
    } catch {
      setFlash({
        tone: "error",
        text: "Something went wrong while deleting your account.",
      });
    } finally {
      setIsSaving(false);
      setIsDeletePopupOpen(false);
      setDeleteConfirmationText("");
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 px-4 py-8 sm:px-6 md:py-10 lg:px-8 transition-colors duration-500">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 p-5 shadow-sm backdrop-blur-xl sm:p-6"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--primary)]/5 blur-3xl dark:bg-[var(--primary)]/10" />
          <span className="relative mb-3 inline-flex rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            User Profile
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-violet-900 bg-clip-text text-transparent dark:from-white dark:via-indigo-200 dark:to-violet-200">
            Account Settings
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 sm:text-base">
            Manage profile, security, preferences, and communication settings.🧠
          </p>
        </motion.section>

        <PlanSettingsCard />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SettingsCard
            icon={<Moon className="h-5 w-5 text-[var(--primary)]" />}
            title="App Theme"
            description="Theme preference for the full application."
          >
            <ToggleRow
              label="Enable dark mode"
              checked={settings.darkMode}
              onChange={(checked) =>
                setSettings((prev) => ({ ...prev, darkMode: checked }))
              }
            />
          </SettingsCard>

          <SettingsCard
            icon={<Globe className="h-5 w-5 text-[var(--primary)]" />}
            title="Language"
            description="Choose your preferred interface language."
          >
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, language: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm text-slate-700 outline-none backdrop-blur-sm transition-all duration-200 hover:bg-white/80 focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 dark:border-slate-600/80 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/80 dark:focus:bg-slate-900"
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </SettingsCard>

          <SettingsCard
            icon={<UserRound className="h-5 w-5 text-[var(--primary)]" />}
            title="Personal Details"
            description="Keep your account information up to date."
            className="lg:col-span-2"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="flex w-full shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/50 p-4 transition-colors hover:bg-slate-50 dark:border-slate-600/80 dark:bg-slate-800/30 hover:dark:bg-slate-800/50 lg:w-48 xl:w-56">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 shadow-inner dark:from-slate-700 dark:to-slate-800 text-xl font-bold text-slate-700 dark:text-slate-200">
                  {profileInitials}
                </div>
                <p className="mt-3 text-center text-xs text-slate-500">
                  Avatar updates follow your account profile metadata.
                </p>
              </div>

              <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <InputField
                  label="Name"
                  value={settings.profile.name}
                  onChange={(value) => updateProfile("name", value)}
                  placeholder="Your full name"
                />
                <div>
                  <label className="text-sm font-medium text-slate-600">
                    Gender
                  </label>
                  <select
                    value={settings.profile.gender}
                    onChange={(e) => updateProfile("gender", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300/80 bg-white/50 px-3 py-2 text-sm text-slate-700 outline-none backdrop-blur-sm transition-all duration-200 hover:bg-white/80 focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 dark:border-slate-600/80 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/80 dark:focus:bg-slate-900"
                  >
                    <option value="">Select gender</option>
                    {GENDERS.map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </select>
                </div>
                <InputField
                  label="Age"
                  type="number"
                  value={settings.profile.age}
                  onChange={(value) => updateProfile("age", value)}
                  placeholder="Age"
                />
                <InputField
                  label="Email"
                  value={settings.profile.email}
                  disabled
                  onChange={() => undefined}
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<Shield className="h-5 w-5 text-[var(--primary)]" />}
            title="Notifications"
            description="Control when and what we notify you about."
          >
            <ToggleRow
              label="Enable notifications"
              checked={settings.notificationsEnabled}
              onChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  notificationsEnabled: checked,
                }))
              }
            />

            <AnimatePresence initial={false}>
              {settings.notificationsEnabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  <ToggleRow
                    label="Account activity"
                    checked={settings.notifications.accountActivity}
                    onChange={(checked) =>
                      updateNotification("accountActivity", checked)
                    }
                  />
                  <ToggleRow
                    label="Security alerts"
                    checked={settings.notifications.securityAlerts}
                    onChange={(checked) =>
                      updateNotification("securityAlerts", checked)
                    }
                  />
                  <ToggleRow
                    label="Product updates"
                    checked={settings.notifications.productUpdates}
                    onChange={(checked) =>
                      updateNotification("productUpdates", checked)
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </SettingsCard>

          <SettingsCard
            icon={<Lock className="h-5 w-5 text-[var(--primary)]" />}
            title="Security"
            description="Change your password and keep your account secure."
          >
            <InputField
              label="New password"
              type="password"
              value={password.next}
              onChange={(value) =>
                setPassword((prev) => ({ ...prev, next: value }))
              }
              placeholder="At least 6 characters"
            />
            <InputField
              label="Confirm password"
              type="password"
              value={password.confirm}
              onChange={(value) =>
                setPassword((prev) => ({ ...prev, confirm: value }))
              }
              placeholder="Re-enter your password"
            />
          </SettingsCard>

          <SettingsCard
            icon={<EyeOff className="h-5 w-5 text-[var(--primary)]" />}
            title="Privacy Controls"
            description="Manage your profile visibility and data sharing."
          >
            <ToggleRow
              label="Public profile visibility"
              checked={settings.privacy.profileVisibility}
              onChange={(checked) => updatePrivacy("profileVisibility", checked)}
            />
            <ToggleRow
              label="Allow search indexing"
              checked={settings.privacy.searchIndexing}
              onChange={(checked) => updatePrivacy("searchIndexing", checked)}
            />
            <ToggleRow
              label="Data sharing with partners"
              checked={settings.privacy.dataSharing}
              onChange={(checked) => updatePrivacy("dataSharing", checked)}
            />
          </SettingsCard>

          <BillingSettingsCard setFlash={setFlash} />
        </div>

        {/* ── Premium Action Footer ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative mt-8 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/70 shadow-lg shadow-slate-200/40 dark:shadow-slate-950/40 backdrop-blur-sm"
        >
          {/* Gradient shimmer band at top */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--primary)]/50 to-transparent" />
          <div className="absolute -top-10 left-1/2 h-20 w-72 -translate-x-1/2 rounded-full bg-[var(--primary)]/8 blur-2xl dark:bg-[var(--primary)]/12" />

          <div className="relative flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
            {/* Left — info block */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Manage your account
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Save your preferences or delete your account. Need help? Visit{" "}
                  <Link
                    href="/support"
                    className="font-semibold text-[var(--primary)] underline hover:brightness-110"
                  >
                    Support
                  </Link>
                  .
                </span>
              </div>
            </div>

            {/* Right — action buttons */}
            <div className="flex shrink-0 flex-row items-center justify-end gap-2">
              {/* Delete button */}
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmationText("");
                  setIsDeletePopupOpen(true);
                }}
                disabled={!isLoaded || isSaving}
                className="group inline-flex items-center gap-2 rounded-md border border-red-200/70 dark:border-red-800/60 bg-transparent px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 transition-all duration-200 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2
                  size={14}
                  className="transition-transform group-hover:scale-110"
                />
                Delete account
              </button>

              {/* Save button */}
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={!isLoaded || isSaving}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-md bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-[var(--primary)]/25 transition-all duration-200 hover:brightness-110 hover:shadow-lg hover:shadow-[var(--primary)]/35 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {isSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save
                    size={14}
                    className="transition-transform group-hover:scale-110"
                  />
                )}
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </motion.section>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setFlash(null)}
          >
            <motion.div
              variants={isMobile ? mobilePopupVariants : desktopPopupVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
              className={`relative w-full overflow-hidden rounded-t-2xl border bg-white/95 shadow-xl dark:bg-slate-900/95 sm:max-w-md sm:rounded-[28px] ${flash.tone === "success"
                  ? "border-emerald-200/70 dark:border-emerald-500/20"
                  : flash.tone === "info"
                    ? "border-sky-200/70 dark:border-sky-500/20"
                    : "border-red-200/70 dark:border-red-500/20"
                }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`absolute inset-x-0 top-0 h-24 ${flash.tone === "success"
                    ? "bg-gradient-to-r from-emerald-400/20 via-sky-300/20 to-cyan-300/20 dark:from-emerald-400/10 dark:via-sky-400/10 dark:to-cyan-400/10"
                    : flash.tone === "info"
                      ? "bg-gradient-to-r from-sky-400/20 via-cyan-300/20 to-indigo-300/20 dark:from-sky-400/10 dark:via-cyan-400/10 dark:to-indigo-400/10"
                      : "bg-gradient-to-r from-red-400/20 via-rose-300/20 to-orange-300/20 dark:from-red-400/10 dark:via-rose-400/10 dark:to-orange-400/10"
                  }`}
              />
              <div
                className={`absolute -right-10 top-8 h-32 w-32 rounded-full blur-3xl ${flash.tone === "success"
                    ? "bg-emerald-300/20 dark:bg-emerald-400/10"
                    : flash.tone === "info"
                      ? "bg-sky-300/20 dark:bg-sky-400/10"
                      : "bg-red-300/20 dark:bg-red-400/10"
                  }`}
              />
              <div className="relative px-4 pb-5 pt-4 sm:p-7">
                <div className="flex items-start justify-end">
                  <button
                    type="button"
                    onClick={() => setFlash(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-400 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-slate-600 dark:hover:text-slate-200"
                    aria-label="Close message"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-1 flex flex-col items-center text-center sm:mt-0 sm:flex-row sm:items-center sm:gap-4 sm:text-left">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${flash.tone === "success"
                        ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/20"
                        : flash.tone === "info"
                          ? "bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sky-500/20"
                          : "bg-gradient-to-br from-red-500 to-orange-500 shadow-red-500/20"
                      }`}
                  >
                    {flash.tone === "success" ? (
                      <CheckCircle2 className="h-7 w-7" />
                    ) : flash.tone === "info" ? (
                      <BellRing className="h-7 w-7" />
                    ) : (
                      <AlertTriangle className="h-7 w-7" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-xs font-semibold uppercase tracking-[0.22em] ${flash.tone === "success"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : flash.tone === "info"
                            ? "text-sky-600 dark:text-sky-300"
                            : "text-red-600 dark:text-red-300"
                        }`}
                    >
                      {flash.tone === "success"
                        ? "Settings Updated"
                        : flash.tone === "info"
                          ? "Settings Notice"
                          : "Settings Alert"}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                      {flash.tone === "success"
                        ? "Changes saved"
                        : flash.tone === "info"
                          ? "Please review"
                          : "Something needs attention"}
                    </h3>
                  </div>
                </div>

                <div
                  className={`mt-5 rounded-2xl p-4 text-center sm:text-left ${flash.tone === "success"
                      ? "border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:border-emerald-500/10 dark:from-emerald-500/10 dark:via-slate-900 dark:to-sky-500/10"
                      : flash.tone === "info"
                        ? "border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:border-sky-500/10 dark:from-sky-500/10 dark:via-slate-900 dark:to-cyan-500/10"
                        : "border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 dark:border-red-500/10 dark:from-red-500/10 dark:via-slate-900 dark:to-orange-500/10"
                    }`}
                >
                  <p className="text-sm font-medium leading-6 text-slate-700 dark:text-slate-200">
                    {flash.text}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDeletePopupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              if (!isSaving) {
                setIsDeletePopupOpen(false);
                setDeleteConfirmationText("");
              }
            }}
          >
            <motion.div
              variants={isMobile ? mobilePopupVariants : desktopPopupVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
              className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-xl bg-white dark:bg-slate-800 p-5 sm:p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Confirm account deletion
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    This action is permanent and removes your account and saved
                    data from our servers 😥.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isSaving) return;
                    setIsDeletePopupOpen(false);
                    setDeleteConfirmationText("");
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Close delete confirmation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Type <span className="font-bold">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                disabled={isSaving}
                className="w-full rounded-xl border border-slate-300/80 dark:border-slate-600/80 bg-white/50 dark:bg-slate-900/50 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none backdrop-blur-sm transition-all duration-200 hover:bg-white/80 hover:dark:bg-slate-900/80 focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 dark:focus:bg-slate-900 disabled:opacity-70"
              />

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeletePopupOpen(false);
                    setDeleteConfirmationText("");
                  }}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isSaving}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Deleting..." : "Delete permanently"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function PlanSettingsCard() {
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  useEffect(() => {
    const savedPlan = localStorage.getItem("nextnews-plan");
    if (savedPlan) setCurrentPlan(savedPlan);
  }, []);

  if (!currentPlan) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "relative overflow-hidden flex items-center justify-between gap-4 rounded-2xl border p-4 shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-md sm:p-5",
        currentPlan === "Pro+"
          ? "border-orange-200/60 bg-orange-50/60 dark:border-orange-700/40 dark:bg-orange-950/30"
          : "border-slate-200/60 bg-white/60 dark:border-slate-700/60 dark:bg-slate-800/60",
      )}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={clsx(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            currentPlan === "Pro+"
              ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
              : "bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400",
          )}
        >
          {currentPlan === "Pro+" ? (
            <Zap className="h-6 w-6" />
          ) : currentPlan === "Pro" ? (
            <ShieldCheck className="h-6 w-6" />
          ) : (
            <Sparkles className="h-6 w-6" />
          )}
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Current Plan
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your selected subscription is{" "}
            <span className="font-medium">{currentPlan} Plan</span> currently
            active on this account.
          </p>
        </div>
      </div>
      <Link
        href="/plans"
        className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        Manage
      </Link>
    </motion.div>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 p-5 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-slate-300/80 hover:shadow-md dark:hover:border-slate-600/80 sm:p-6 ${
        className ?? ""
      }`}
    >
      <div className="mb-4 relative z-10 flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100/80 shadow-inner dark:bg-slate-700/80">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-[var(--primary)]" : "bg-slate-300 dark:bg-slate-600"
          }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? "left-6" : "left-1"
            }`}
        />
      </button>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password" | "number";
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-300/80 dark:border-slate-600/80 bg-white/50 dark:bg-slate-900/50 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none backdrop-blur-sm transition-all duration-200 hover:bg-white/80 hover:dark:bg-slate-900/80 focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--primary)]/20 dark:focus:bg-slate-900 disabled:bg-slate-100/50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 dark:disabled:text-slate-400"
      />
    </div>
  );
}

function BillingSettingsCard({ setFlash }: { setFlash: React.Dispatch<React.SetStateAction<FlashMessage>> }) {
  const [planDetails, setPlanDetails] = useState<{name: string, purchaseDate: Date} | null>(null);
  const [apiUsage, setApiUsage] = useState({ used: 0, total: 100, percentage: 0 });

  useEffect(() => {
    const savedPlan = localStorage.getItem("nextnews-plan");
    if (savedPlan) {
      let savedDate = localStorage.getItem("nextnews-plan-date");
      if (!savedDate) {
        const now = new Date();
        savedDate = now.toISOString();
        localStorage.setItem("nextnews-plan-date", savedDate);
      }
      setPlanDetails({ name: savedPlan, purchaseDate: new Date(savedDate) });
      
      const analytics = readActivityAnalytics();
      const usedCalls = analytics.aiSummaryCount + analytics.personalizationSuggestionCount + analytics.events.length;
      let planTotal = 100;
      if (savedPlan === "Pro") planTotal = 1000;
      if (savedPlan === "Pro+") planTotal = 10000;
      
      setApiUsage({
        used: usedCalls,
        total: planTotal,
        percentage: Math.min(100, Math.round((usedCalls / planTotal) * 100)),
      });
    }
  }, []);

  if (!planDetails) {
    return (
      <SettingsCard
        icon={<CreditCard className="h-5 w-5 text-[var(--primary)]" />}
        title="Billing & Usage"
        description="Manage your subscription and track API usage."
        className="lg:col-span-2"
      >
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">No active subscription plan found.</p>
          <Link href="/plans" className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110">
            View Plans
          </Link>
        </div>
      </SettingsCard>
    );
  }

  const expiryDate = new Date(planDetails.purchaseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const formattedExpiry = expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedPurchase = planDetails.purchaseDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <SettingsCard
      icon={<CreditCard className="h-5 w-5 text-[var(--primary)]" />}
      title="Billing & Usage"
      description="Manage active plans, track API usage, and download activity logs."
      className="lg:col-span-2"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <div className="space-y-4">
          {/* Active Plan */}
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Active Plan Details</h4>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 transition-colors hover:bg-slate-100/50 dark:border-slate-700/60 dark:bg-slate-800/30 hover:dark:bg-slate-800/50 shadow-sm">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 shadow-sm border border-emerald-200 dark:border-emerald-900 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{planDetails.name} Plan</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Expires on {formattedExpiry}</p>
              </div>
            </div>
            <Link href="/plans" className="shrink-0 text-sm font-semibold text-[var(--primary)] hover:underline">Manage</Link>
          </div>

          {/* Usage Summary */}
          <div className="rounded-xl border border-slate-200/60 bg-white/50 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/40">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">NewsAPI and AI API Calls</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{apiUsage.percentage}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/80">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-indigo-500 transition-all duration-500" style={{ width: `${apiUsage.percentage}%` }} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">You have used {apiUsage.used.toLocaleString()} of your {apiUsage.total.toLocaleString()} included API calls.</p>
            </div>
          </div>
        </div>

        {/* Invoices List */}
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">Recent Activity Logs</h4>
          <div className="space-y-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 p-2 dark:border-slate-700/60 dark:bg-slate-800/30">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-2.5 transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/80 shadow-sm bg-white/60 dark:bg-slate-800/60">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-200/50 dark:bg-stone-800/50">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{planDetails.name} Plan Activation</p>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">{formattedPurchase}</p>
                </div>
              </div>
              <button type="button" onClick={() => window.alert("Data not available now")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-[var(--primary)] hover:shadow-sm dark:hover:bg-slate-700 transition-all"><Download className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
