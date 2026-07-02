"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  Check,
  ClipboardCheck,
  Dumbbell,
  LineChart,
  LogIn,
  LogOut,
  Plus,
  Save,
  Shield,
  Trash2,
  Users
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { sampleData } from "@/lib/sample-data";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  AttendanceRecord,
  AttendanceStatus,
  Member,
  Review,
  TeamData,
  TrainingSession,
  UserProfile,
  WorkoutMetric,
  WorkoutRecord
} from "@/lib/types";

type Persist = <T extends keyof TeamData>(key: T, table: string, row: TeamData[T][number]) => Promise<void>;
type Permission = { profile: UserProfile; isAdmin: boolean; memberId?: string };

const storageKey = "ex-senior-tracker-demo";
const profileKey = "ex-senior-tracker-profile";
const statusOptions: AttendanceStatus[] = ["present", "late", "absent", "excused"];
const unlinkedProfile: UserProfile = {
  id: "unlinked",
  role: "member",
  display_name: "Unlinked account",
  created_at: new Date().toISOString()
};

function id(_prefix: string) {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function canEditMember(permission: Permission, memberId: string) {
  return permission.isAdmin || permission.memberId === memberId;
}

function profileRoleSummary(profile: UserProfile, profiles: UserProfile[]) {
  const sameUserProfiles = profiles.filter((item) => (
    item.display_name.trim().toLowerCase() === profile.display_name.trim().toLowerCase()
  ));
  const roles = Array.from(new Set(sameUserProfiles.map((item) => item.role)));
  return roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(" + ");
}

function profileLabel(profile: UserProfile) {
  return profile.display_name || profile.email || "Unnamed user";
}

export default function TeamTracker() {
  const [data, setData] = useState<TeamData>(sampleData);
  const [sessionId, setSessionId] = useState(sampleData.sessions[0]?.id ?? "");
  const [selectedMemberId, setSelectedMemberId] = useState(sampleData.members[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState("attendance");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupUsername, setSignupUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(!isSupabaseConfigured);
  const [profile, setProfile] = useState<UserProfile>(sampleData.profiles[0]);

  const permission = useMemo<Permission>(() => ({
    profile,
    isAdmin: profile.role === "admin",
    memberId: profile.member_id
  }), [profile]);

  useEffect(() => {
    async function boot() {
      if (!isSupabaseConfigured || !supabase) {
        const saved = window.localStorage.getItem(storageKey);
        const savedProfileId = window.localStorage.getItem(profileKey);
        const nextData = saved ? JSON.parse(saved) as TeamData : sampleData;
        setData(nextData);
        setProfile(nextData.profiles.find((item) => item.id === savedProfileId) ?? nextData.profiles[0]);
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      setIsAuthed(Boolean(sessionData.session));
      if (sessionData.session) await loadSupabaseData(sessionData.session.user.id);
      setLoading(false);
    }

    boot();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
      window.localStorage.setItem(profileKey, profile.id);
    }
  }, [data, profile]);

  async function loadSupabaseData(userId?: string) {
    if (!supabase) return;
    const [profiles, members, sessions, attendance, metrics, workouts, reviews] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("training_sessions").select("*").order("session_date", { ascending: false }),
      supabase.from("attendance_records").select("*"),
      supabase.from("workout_metrics").select("*"),
      supabase.from("workout_records").select("*").order("recorded_at", { ascending: false }),
      supabase.from("reviews").select("*").order("created_at", { ascending: false })
    ]);

    const nextData: TeamData = {
      profiles: profiles.data ?? [],
      members: members.data ?? [],
      sessions: sessions.data ?? [],
      attendance: attendance.data ?? [],
      metrics: metrics.data ?? [],
      workouts: workouts.data ?? [],
      reviews: reviews.data ?? []
    };
    setData(nextData);
    const currentProfile = nextData.profiles.find((item) => item.user_id === userId);
    setProfile(currentProfile ?? unlinkedProfile);
    setSessionId(nextData.sessions[0]?.id ?? "");
    setSelectedMemberId(nextData.members[0]?.id ?? "");
  }

  async function signIn() {
    if (!supabase) return;
    setNotice("");
    const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setNotice(error.message);
      return;
    }
    setIsAuthed(true);
    await loadSupabaseData(loginData.user.id);
  }

  async function signUp() {
    setNotice("");
    if (!signupUsername.trim()) {
      setNotice("Username is required.");
      return;
    }
    if (!email.trim()) {
      setNotice("Email is required.");
      return;
    }
    if (password.length < 6) {
      setNotice("Password must be at least 6 characters.");
      return;
    }
    if (password !== signupConfirmPassword) {
      setNotice("Passwords do not match.");
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: signupUsername,
        email,
        password,
        confirmPassword: signupConfirmPassword
      })
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setNotice(result.error ?? "Unable to sign up.");
      return;
    }

    if (!supabase) return;
    const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMode("login");
      setNotice("Account created. Please login.");
      return;
    }
    setIsAuthed(true);
    await loadSupabaseData(loginData.user.id);
  }

  async function signOut() {
    if (supabase && isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setIsAuthed(false);
    setProfile(unlinkedProfile);
    setEmail("");
    setPassword("");
    setSignupUsername("");
    setSignupConfirmPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function resetOwnPassword() {
    if (!supabase || !profile.user_id) return;
    setNotice("");
    if (newPassword.length < 6) {
      setNotice("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setNotice(error.message);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setNotice("Missing login session.");
      return;
    }

    const response = await fetch("/api/account/complete-password-reset", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setNotice(result.error ?? "Password was updated, but profile reset flag could not be cleared.");
      return;
    }

    const updatedProfile = { ...profile, require_password_reset: false };
    setProfile(updatedProfile);
    setNewPassword("");
    setConfirmPassword("");
    setNotice("Password updated.");
  }

  async function persist<T extends keyof TeamData>(key: T, table: string, row: TeamData[T][number]) {
    if (supabase && isSupabaseConfigured && isAuthed) {
      const { error } = await supabase.from(table).upsert(row as never);
      if (error) {
        setNotice(error.message);
        return;
      }
    }
    setData((current) => {
      const items = current[key] as Array<{ id: string }>;
      const rowId = (row as { id: string }).id;
      const exists = items.some((item) => item.id === rowId);
      return {
        ...current,
        [key]: exists ? items.map((item) => (item.id === rowId ? row : item)) : [row, ...items]
      };
    });
  }

  async function remove<T extends keyof TeamData>(key: T, table: string, rowId: string) {
    if (supabase && isSupabaseConfigured && isAuthed) {
      const { error } = await supabase.from(table).delete().eq("id", rowId);
      if (error) {
        setNotice(error.message);
        return;
      }
    }
    setData((current) => ({
      ...current,
      [key]: (current[key] as Array<{ id: string }>).filter((item) => item.id !== rowId)
    }));
  }

  const memberRows = useMemo(() => data.members.map((member) => {
    const records = data.attendance.filter((record) => record.member_id === member.id);
    const counted = records.filter((record) => record.status === "present" || record.status === "late").length;
    const rate = records.length ? Math.round((counted / records.length) * 100) : 0;
    const pumpingMetric = data.metrics.find((metric) => metric.name.toLowerCase().includes("pumping"));
    const pumping = data.workouts
      .filter((record) => record.member_id === member.id && record.metric_id === pumpingMetric?.id)
      .reduce((sum, record) => sum + Number(record.value), 0);
    const review = data.reviews.find((item) => item.member_id === member.id);
    return { ...member, rate, pumping, score: review?.score ?? 0 };
  }), [data]);

  const visibleMemberRows = permission.isAdmin
    ? memberRows
    : memberRows.filter((member) => member.id === permission.memberId);
  const currentSession = data.sessions.find((session) => session.id === sessionId);
  const visibleMemberId = permission.isAdmin ? selectedMemberId : permission.memberId;
  const selectedMember = data.members.find((member) => member.id === visibleMemberId);
  const selectedMemberRow = memberRows.find((member) => member.id === visibleMemberId);

  const summary = useMemo(() => {
    if (!permission.isAdmin) {
      const ownAttendance = data.attendance.filter((record) => record.member_id === permission.memberId);
      const ownPresentLike = ownAttendance.filter((record) => record.status === "present" || record.status === "late").length;
      const ownWorkouts = data.workouts.filter((record) => record.member_id === permission.memberId);
      const ownReview = data.reviews.find((record) => record.member_id === permission.memberId);
      return {
        memberCount: 1,
        attendanceRate: ownAttendance.length ? Math.round((ownPresentLike / ownAttendance.length) * 100) : 0,
        absences: ownAttendance.filter((record) => record.status === "absent").length,
        workoutAverage: ownWorkouts.length ? Math.round(ownWorkouts.reduce((sum, record) => sum + Number(record.value), 0) / ownWorkouts.length) : 0,
        reviewScore: ownReview?.score ?? 0
      };
    }

    const activeMembers = data.members.filter((member) => member.active);
    const possible = activeMembers.length * Math.max(data.sessions.length, 1);
    const presentLike = data.attendance.filter((record) => record.status === "present" || record.status === "late").length;
    const avgAttendance = possible ? Math.round((presentLike / possible) * 100) : 0;
    const absent = data.attendance.filter((record) => record.status === "absent").length;
    const avgWorkout = data.workouts.length
      ? Math.round(data.workouts.reduce((sum, record) => sum + Number(record.value), 0) / data.workouts.length)
      : 0;
    return { memberCount: activeMembers.length, attendanceRate: avgAttendance, absences: absent, workoutAverage: avgWorkout, reviewScore: 0 };
  }, [data, permission.isAdmin, permission.memberId]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-moss">Loading tracker...</main>;
  }

  if (isSupabaseConfigured && !isAuthed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-moss text-white"><LogIn size={20} /></div>
            <div>
              <h1 className="text-xl font-semibold">Ex Senior Tracker</h1>
              <p className="text-sm text-ink/60">{authMode === "login" ? "Admin and member login" : "Member sign up"}</p>
            </div>
          </div>
          <div className="space-y-3">
            {authMode === "signup" && (
              <label>
                <span className="mb-1 block text-xs text-ink/60">Username <span className="text-clay">*</span></span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Your username" value={signupUsername} onChange={(event) => setSignupUsername(event.target.value)} />
              </label>
            )}
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {authMode === "signup" && (
              <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Confirm password" type="password" value={signupConfirmPassword} onChange={(event) => setSignupConfirmPassword(event.target.value)} />
            )}
            {authMode === "login" ? (
              <>
                <button className="focus-ring w-full rounded-md bg-moss px-3 py-2 text-white" onClick={signIn}>Login</button>
                <button className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" onClick={() => { setNotice(""); setAuthMode("signup"); }}>Create member account</button>
              </>
            ) : (
              <>
                <button className="focus-ring w-full rounded-md bg-moss px-3 py-2 text-white" onClick={signUp}>Sign up as member</button>
                <button className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" onClick={() => { setNotice(""); setAuthMode("login"); }}>Back to login</button>
              </>
            )}
            {notice && <p className="text-sm text-clay">{notice}</p>}
          </div>
        </section>
      </main>
    );
  }

  if (isSupabaseConfigured && isAuthed && profile.require_password_reset) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-moss text-white"><Shield size={20} /></div>
            <div>
              <h1 className="text-xl font-semibold">Reset Password</h1>
              <p className="text-sm text-ink/60">Set your own password before continuing</p>
            </div>
          </div>
          <div className="space-y-3">
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Confirm password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <button className="focus-ring w-full rounded-md bg-moss px-3 py-2 text-white" onClick={resetOwnPassword}>Update Password</button>
            <button className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-2" onClick={signOut}><LogOut size={16} /> Logout</button>
            {notice && <p className="text-sm text-clay">{notice}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Ex Senior Tracker</h1>
            <p className="text-sm text-ink/60">Same team view, role-based editing for admin and members</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm capitalize text-ink/70">
              <Shield size={16} className="text-moss" /> {profileRoleSummary(profile, data.profiles) || (permission.isAdmin ? "Admin" : "Member")}
            </div>
            {!isSupabaseConfigured && (
              <select className="focus-ring rounded-md border border-ink/15 bg-white px-3 py-2 text-sm" value={profile.id} onChange={(event) => setProfile(data.profiles.find((item) => item.id === event.target.value) ?? data.profiles[0])}>
                {data.profiles.map((item) => <option key={item.id} value={item.id}>{item.display_name} · {item.role}</option>)}
              </select>
            )}
            {["attendance", "members", "workout", "reviews"].map((tab) => (
              <button key={tab} className={`focus-ring rounded-md px-3 py-2 text-sm capitalize ${activeTab === tab ? "bg-moss text-white" : "border border-ink/10 bg-white"}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
            {isSupabaseConfigured && (
              <button className="focus-ring flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm" onClick={signOut}>
                <LogOut size={16} /> Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={<Users size={18} />} label={permission.isAdmin ? "Active members" : "My profile"} value={permission.isAdmin ? summary.memberCount : profile.display_name} />
            <Stat icon={<ClipboardCheck size={18} />} label={permission.isAdmin ? "Team attendance" : "My attendance"} value={`${summary.attendanceRate}%`} />
            <Stat icon={<Activity size={18} />} label={permission.isAdmin ? "Team absences" : "My absences"} value={summary.absences} />
            <Stat icon={<Dumbbell size={18} />} label={permission.isAdmin ? "Avg workout" : "My review"} value={permission.isAdmin ? summary.workoutAverage : `${summary.reviewScore}/100`} />
          </div>

          {activeTab === "attendance" && <AttendancePanel data={data} currentSession={currentSession} sessionId={sessionId} setSessionId={setSessionId} permission={permission} persist={persist} />}
          {activeTab === "members" && <MembersPanel data={data} permission={permission} persist={persist} remove={remove} setNotice={setNotice} setSelectedMemberId={setSelectedMemberId} />}
          {activeTab === "workout" && <WorkoutPanel data={data} sessionId={sessionId} setSessionId={setSessionId} permission={permission} persist={persist} />}
          {activeTab === "reviews" && <ReviewsPanel data={data} selectedMemberId={selectedMemberId} setSelectedMemberId={setSelectedMemberId} permission={permission} persist={persist} />}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-3 flex items-center gap-2"><Shield size={18} className="text-moss" /><h2 className="font-semibold">Current Access</h2></div>
            <div className="space-y-2 text-sm">
              <p><span className="text-ink/55">User:</span> {profile.display_name}</p>
              <p><span className="text-ink/55">Role:</span> {profileRoleSummary(profile, data.profiles) || profile.role}</p>
              <p className="text-ink/65">
                {profile.id === "unlinked"
                  ? "This login is not linked to a member profile yet. Ask an admin to create the profile row."
                  : permission.isAdmin
                    ? "Admin can edit every member, session, workout item, and review."
                    : "Member can edit only their own attendance and workout cells."}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-3 flex items-center gap-2"><LineChart size={18} className="text-moss" /><h2 className="font-semibold">{permission.isAdmin ? "Overall Data" : "My Status"}</h2></div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleMemberRows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="rate" name="Attendance %" fill="#315d49" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pumping" name="Pumping" fill="#c76b4b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <h2 className="mb-3 font-semibold">Personal Snapshot</h2>
            {permission.isAdmin && (
              <select className="focus-ring mb-3 w-full rounded-md border border-ink/15 px-3 py-2" value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
                {data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            )}
            {selectedMember && (
              <div className="space-y-2 text-sm">
                <p><span className="text-ink/55">Role:</span> {selectedMember.role}</p>
                <p><span className="text-ink/55">Group:</span> {selectedMember.group_name}</p>
                <p><span className="text-ink/55">Attendance:</span> {selectedMemberRow?.rate ?? 0}%</p>
                <p><span className="text-ink/55">Review score:</span> {selectedMemberRow?.score ?? 0}/100</p>
              </div>
            )}
          </section>

          {!isSupabaseConfigured && <section className="rounded-lg border border-clay/25 bg-white p-4 text-sm text-ink/70">Demo mode is active. Use the role switcher to test Admin vs Member permissions.</section>}
          {notice && <section className="rounded-lg border border-clay/25 bg-white p-4 text-sm text-clay">{notice}</section>}
        </aside>
      </div>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-2 flex items-center gap-2 text-moss">{icon}<span className="text-sm text-ink/60">{label}</span></div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function AttendancePanel({ data, currentSession, sessionId, setSessionId, permission, persist }: {
  data: TeamData;
  currentSession?: TrainingSession;
  sessionId: string;
  setSessionId: (value: string) => void;
  permission: Permission;
  persist: Persist;
}) {
  const [newSession, setNewSession] = useState({ title: "", session_date: today(), start_time: "20:00", end_time: "22:00", late_after_minutes: 10, notes: "" });
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);

  async function addSession() {
    if (!permission.isAdmin || !newSession.title.trim()) return;
    const row: TrainingSession = { id: id("session"), ...newSession };
    await persist("sessions", "training_sessions", row);
    setSessionId(row.id);
    setNewSession({ title: "", session_date: today(), start_time: "20:00", end_time: "22:00", late_after_minutes: 10, notes: "" });
    setIsAddSessionOpen(false);
  }

  async function setAttendance(memberId: string, status: AttendanceStatus, reason?: string) {
    if (!sessionId || !canEditMember(permission, memberId)) return;
    const existing = data.attendance.find((record) => record.member_id === memberId && record.session_id === sessionId);
    const row: AttendanceRecord = {
      id: existing?.id ?? id("attendance"),
      member_id: memberId,
      session_id: sessionId,
      status,
      reason: reason ?? existing?.reason ?? "",
      created_at: existing?.created_at ?? new Date().toISOString()
    };
    await persist("attendance", "attendance_records", row);
  }

  const currentAttendance = data.attendance.filter((record) => record.session_id === sessionId);
  const attendanceSummary = {
    present: currentAttendance.filter((record) => record.status === "present").length,
    late: currentAttendance.filter((record) => record.status === "late").length,
    absent: currentAttendance.filter((record) => record.status === "absent").length,
    excused: currentAttendance.filter((record) => record.status === "excused").length,
    notMarked: Math.max(data.members.length - currentAttendance.length, 0)
  };

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2"><CalendarClock size={18} className="text-moss" /><h2 className="font-semibold">Attendance</h2></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            {data.sessions.map((session) => <option key={session.id} value={session.id}>{session.session_date} · {session.title}</option>)}
          </select>
          {permission.isAdmin && (
            <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-sm text-white" onClick={() => setIsAddSessionOpen(true)}>
              <Plus size={16} /> Add Session
            </button>
          )}
        </div>
      </div>

      {permission.isAdmin && isAddSessionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-6">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><CalendarClock size={18} className="text-moss" /><h2 className="font-semibold">Add Session</h2></div>
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm" onClick={() => setIsAddSessionOpen(false)}>Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs text-ink/60">Practice title <span className="text-clay">*</span></span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Practice title" value={newSession.title} onChange={(event) => setNewSession({ ...newSession, title: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Date</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" type="date" value={newSession.session_date} onChange={(event) => setNewSession({ ...newSession, session_date: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Late after minutes</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" type="number" min={0} value={newSession.late_after_minutes} onChange={(event) => setNewSession({ ...newSession, late_after_minutes: Number(event.target.value) })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Start time</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" type="time" value={newSession.start_time} onChange={(event) => setNewSession({ ...newSession, start_time: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">End time</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" type="time" value={newSession.end_time} onChange={(event) => setNewSession({ ...newSession, end_time: event.target.value })} />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs text-ink/60">Notes</span>
                <textarea className="focus-ring min-h-20 w-full rounded-md border border-ink/15 px-3 py-2" value={newSession.notes} onChange={(event) => setNewSession({ ...newSession, notes: event.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2" onClick={() => setIsAddSessionOpen(false)}>Cancel</button>
              <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={addSession}><Plus size={16} /> Add Session</button>
            </div>
          </section>
        </div>
      )}

      {currentSession && <p className="mb-3 text-sm text-ink/60">Late after {currentSession.late_after_minutes} minutes · {currentSession.start_time} to {currentSession.end_time}</p>}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
            <thead className="text-left text-ink/55"><tr><th className="px-3">Member</th><th>Group</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
              {data.members.map((member) => {
                const record = data.attendance.find((item) => item.member_id === member.id && item.session_id === sessionId);
                const editable = canEditMember(permission, member.id);
                const needsReason = record?.status === "late" || record?.status === "absent";
                return (
                  <tr key={member.id} className={`${editable ? "bg-paper" : "bg-ink/5 text-ink/45"}`}>
                    <td className="rounded-l-md px-3 py-3 font-medium">{member.name}</td>
                    <td>{member.group_name}</td>
                    <td className="py-2">
                      <select
                        disabled={!editable}
                        className="focus-ring w-36 rounded-md border border-ink/15 bg-white px-2 py-1 capitalize disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/45"
                        value={record?.status ?? ""}
                        onChange={(event) => {
                          if (event.target.value) void setAttendance(member.id, event.target.value as AttendanceStatus);
                        }}
                      >
                        <option value="">Not marked</option>
                        {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="rounded-r-md py-2 pr-3">
                      {needsReason ? (
                        <input
                          disabled={!editable}
                          className="focus-ring w-full rounded-md border border-ink/15 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/45"
                          placeholder={`${record.status === "late" ? "Late" : "Absent"} reason`}
                          defaultValue={record.reason ?? ""}
                          onBlur={(event) => void setAttendance(member.id, record.status, event.target.value)}
                        />
                      ) : (
                        <span className="text-ink/40">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="rounded-lg border border-ink/10 bg-paper p-4">
          <h3 className="mb-3 font-semibold">Session Summary</h3>
          <div className="space-y-2 text-sm">
            <SummaryRow label="Present" value={attendanceSummary.present} />
            <SummaryRow label="Late" value={attendanceSummary.late} />
            <SummaryRow label="Absent" value={attendanceSummary.absent} />
            <SummaryRow label="Excused" value={attendanceSummary.excused} />
            <SummaryRow label="Not marked" value={attendanceSummary.notMarked} />
            <div className="border-t border-ink/10 pt-2">
              <SummaryRow label="Total members" value={data.members.length} />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink/65">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function MembersPanel({
  data,
  permission,
  persist,
  remove,
  setNotice,
  setSelectedMemberId
}: {
  data: TeamData;
  permission: Permission;
  persist: Persist;
  remove: <T extends keyof TeamData>(key: T, table: string, rowId: string) => Promise<void>;
  setNotice: (message: string) => void;
  setSelectedMemberId: (value: string) => void;
}) {
  const defaultAccountForm = {
    name: "",
    email: "",
    defaultPassword: "ChangeMe123",
    role: "Drummer",
    group_name: "General"
  };
  const [memberForm, setMemberForm] = useState(defaultAccountForm);
  const [adminForm, setAdminForm] = useState(defaultAccountForm);
  const [submittedAdd, setSubmittedAdd] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [submittedAdminAdd, setSubmittedAdminAdd] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, Pick<UserProfile, "display_name" | "role" | "member_id">>>({});

  async function addAccount(accountRole: UserProfile["role"]) {
    if (!permission.isAdmin) return;
    const form = accountRole === "admin" ? adminForm : memberForm;
    if (accountRole === "admin") setSubmittedAdminAdd(true);
    else setSubmittedAdd(true);
    setNotice("");
    if (!form.name.trim()) {
      setNotice(`${accountRole === "admin" ? "Admin" : "Member"} name is required.`);
      return;
    }
    if (isSupabaseConfigured && !form.email.trim()) {
      setNotice("Member email is required.");
      return;
    }
    if (isSupabaseConfigured && form.defaultPassword.length < 6) {
      setNotice("Default password must be at least 6 characters.");
      return;
    }

    const normalizedName = form.name.trim().toLowerCase();
    const normalizedGroup = form.group_name.trim().toLowerCase();
    const localExisting = accountRole === "member"
      ? data.members.find((member) => (
        member.name.trim().toLowerCase() === normalizedName &&
        member.group_name.trim().toLowerCase() === normalizedGroup
      ))
      : undefined;

    if (localExisting) {
      setSelectedMemberId(localExisting.id);
      setNotice(`${localExisting.name} already exists in ${localExisting.group_name}. Existing member selected.`);
      return;
    }

    if (supabase && isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setNotice("Missing admin login session.");
        return;
      }

      const response = await fetch("/api/admin/create-member", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          defaultPassword: form.defaultPassword,
          memberRole: form.role,
          groupName: form.group_name,
          accountRole
        })
      });
      const result = await response.json() as { error?: string; member?: Member; profile?: UserProfile };

      if (!response.ok) {
        if (response.status === 409 && result.member) {
          await persist("members", "members", result.member);
          setSelectedMemberId(result.member.id);
        }
        setNotice(result.error ?? "Unable to create member.");
        return;
      }

      if (result.member) await persist("members", "members", result.member);
      if (result.profile) await persist("profiles", "profiles", result.profile);
      if (result.member) setSelectedMemberId(result.member.id);
      if (accountRole === "admin") {
        setAdminForm(defaultAccountForm);
        setSubmittedAdminAdd(false);
        setIsAddAdminOpen(false);
      } else {
        setMemberForm(defaultAccountForm);
        setSubmittedAdd(false);
        setIsAddOpen(false);
      }
      setNotice(`${accountRole === "admin" ? "Admin" : "Member"} login account created. User must reset password on first login.`);
      return;
    }

    const row: Member = { id: id("member"), name: form.name, role: form.role, group_name: form.group_name, active: true, created_at: new Date().toISOString() };
    await persist("members", "members", row);
    setSelectedMemberId(row.id);
    setMemberForm(defaultAccountForm);
    setSubmittedAdd(false);
    setIsAddOpen(false);
  }

  function draftFor(profile: UserProfile) {
    return profileDrafts[profile.id] ?? {
      display_name: profile.display_name,
      role: profile.role,
      member_id: profile.member_id ?? ""
    };
  }

  function updateDraft(profile: UserProfile, patch: Partial<Pick<UserProfile, "display_name" | "role" | "member_id">>) {
    setProfileDrafts((current) => ({
      ...current,
      [profile.id]: {
        ...draftFor(profile),
        ...patch
      }
    }));
  }

  async function saveProfile(profile: UserProfile) {
    if (!permission.isAdmin) return;
    const draft = draftFor(profile);
    const row: UserProfile = {
      ...profile,
      display_name: draft.display_name,
      role: draft.role,
      member_id: draft.member_id || undefined
    };
    await persist("profiles", "profiles", row);
  }

  async function deleteMember(member: Member) {
    if (!permission.isAdmin) return;
    const linkedProfiles = data.profiles.filter((profile) => profile.member_id === member.id);
    await Promise.all(linkedProfiles.map((profile) => persist("profiles", "profiles", { ...profile, member_id: undefined })));
    await remove("members", "members", member.id);
  }

  async function deleteProfile(profile: UserProfile) {
    if (!permission.isAdmin || !supabase) return;
    setNotice("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setNotice("Missing admin login session.");
      return;
    }

    const response = await fetch("/api/admin/delete-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ profileId: profile.id })
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setNotice(result.error ?? "Unable to delete admin account.");
      return;
    }
    await remove("profiles", "profiles", profile.id);
    setNotice(`${profileLabel(profile)} deleted.`);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Users size={18} className="text-moss" /><h2 className="font-semibold">Member Management</h2></div>
          {permission.isAdmin && (
            <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-sm text-white" onClick={() => { setSubmittedAdd(false); setIsAddOpen(true); }}>
              <Plus size={16} /> Add Member
            </button>
          )}
          </div>
        <div className="grid gap-2 md:grid-cols-2">
          {data.members.map((member) => (
            <div key={member.id} className={`rounded-md border border-ink/10 p-3 ${canEditMember(permission, member.id) ? "bg-paper" : "bg-ink/5"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{member.name}</div>
                  <div className="text-sm text-ink/60">{member.role} · {member.group_name}</div>
                </div>
                {permission.isAdmin && (
                  <button className="focus-ring rounded-md border border-clay/30 bg-white p-2 text-clay hover:bg-clay hover:text-white" onClick={() => deleteMember(member)} aria-label={`Delete ${member.name}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {permission.isAdmin && isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-6">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Users size={18} className="text-moss" /><h2 className="font-semibold">Add Member</h2></div>
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm" onClick={() => setIsAddOpen(false)}>Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs text-ink/60">Name <span className="text-clay">*</span></span>
                <input className={`focus-ring w-full rounded-md border px-3 py-2 ${submittedAdd && !memberForm.name.trim() ? "border-clay" : "border-ink/15"}`} placeholder="Member name" value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Email {isSupabaseConfigured && <span className="text-clay">*</span>}</span>
                <input className={`focus-ring w-full rounded-md border px-3 py-2 ${submittedAdd && isSupabaseConfigured && !memberForm.email.trim() ? "border-clay" : "border-ink/15"}`} placeholder="member@email.com" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Default password {isSupabaseConfigured && <span className="text-clay">*</span>}</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Default password" value={memberForm.defaultPassword} onChange={(event) => setMemberForm({ ...memberForm, defaultPassword: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Member role</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Drummer" value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Group</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="General" value={memberForm.group_name} onChange={(event) => setMemberForm({ ...memberForm, group_name: event.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={() => addAccount("member")}><Plus size={16} /> Add Member</button>
            </div>
          </section>
        </div>
      )}

      {permission.isAdmin && (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2"><Shield size={18} className="text-moss" /><h2 className="font-semibold">Admin Management</h2></div>
            <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-sm text-white" onClick={() => { setSubmittedAdminAdd(false); setIsAddAdminOpen(true); }}>
              <Plus size={16} /> Add Admin
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {data.profiles.filter((profile) => profile.role === "admin").map((adminProfile) => (
              <div key={adminProfile.id} className="rounded-md border border-ink/10 bg-paper p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{profileLabel(adminProfile)}</div>
                    <div className="text-sm text-ink/60">{adminProfile.email ?? "No email stored"}</div>
                  </div>
                  <button className="focus-ring rounded-md border border-clay/30 bg-white p-2 text-clay hover:bg-clay hover:text-white" onClick={() => deleteProfile(adminProfile)} aria-label={`Delete ${profileLabel(adminProfile)}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {permission.isAdmin && isAddAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-6">
          <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Shield size={18} className="text-moss" /><h2 className="font-semibold">Add Admin</h2></div>
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2 text-sm" onClick={() => setIsAddAdminOpen(false)}>Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs text-ink/60">Name <span className="text-clay">*</span></span>
                <input className={`focus-ring w-full rounded-md border px-3 py-2 ${submittedAdminAdd && !adminForm.name.trim() ? "border-clay" : "border-ink/15"}`} placeholder="Admin name" value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-ink/60">Email {isSupabaseConfigured && <span className="text-clay">*</span>}</span>
                <input className={`focus-ring w-full rounded-md border px-3 py-2 ${submittedAdminAdd && isSupabaseConfigured && !adminForm.email.trim() ? "border-clay" : "border-ink/15"}`} placeholder="admin@email.com" value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-xs text-ink/60">Default password {isSupabaseConfigured && <span className="text-clay">*</span>}</span>
                <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Default password" value={adminForm.defaultPassword} onChange={(event) => setAdminForm({ ...adminForm, defaultPassword: event.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2" onClick={() => setIsAddAdminOpen(false)}>Cancel</button>
              <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={() => addAccount("admin")}><Plus size={16} /> Add Admin</button>
            </div>
          </section>
        </div>
      )}

      {permission.isAdmin && (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-4 flex items-center gap-2"><Shield size={18} className="text-moss" /><h2 className="font-semibold">Login Access Linking</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
              <thead className="text-left text-ink/55">
                <tr><th className="px-3">User</th><th>Display name</th><th>Role</th><th>Linked member</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.profiles.map((profile) => {
                  const draft = draftFor(profile);
                  return (
                    <tr key={profile.id} className="bg-paper">
                      <td className="rounded-l-md px-3 py-3">
                        <div className="font-medium">{profileLabel(profile)}</div>
                        <div className="text-xs text-ink/50">{profile.email ?? "No email stored"}</div>
                        <div className="text-xs text-moss">{profileRoleSummary(profile, data.profiles) || profile.role}</div>
                      </td>
                      <td>
                        <input className="focus-ring w-40 rounded-md border border-ink/15 bg-white px-2 py-1" value={draft.display_name} onChange={(event) => updateDraft(profile, { display_name: event.target.value })} />
                      </td>
                      <td>
                        <select className="focus-ring rounded-md border border-ink/15 bg-white px-2 py-1" value={draft.role} onChange={(event) => updateDraft(profile, { role: event.target.value as UserProfile["role"] })}>
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>
                        <select className="focus-ring w-44 rounded-md border border-ink/15 bg-white px-2 py-1" value={draft.member_id ?? ""} onChange={(event) => updateDraft(profile, { member_id: event.target.value })}>
                          <option value="">No member link</option>
                          {data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                      </td>
                      <td className="rounded-r-md">
                        <button className="focus-ring flex items-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={() => saveProfile(profile)}><Save size={16} /> Save</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function WorkoutPanel({ data, sessionId, setSessionId, permission, persist }: { data: TeamData; sessionId: string; setSessionId: (value: string) => void; permission: Permission; persist: Persist }) {
  const [metric, setMetric] = useState({ name: "", unit: "reps", target: 0 });
  const metrics = data.metrics.filter((item) => item.session_id === sessionId || !item.session_id);

  async function addMetric() {
    if (!permission.isAdmin || !metric.name.trim()) return;
    const row: WorkoutMetric = { id: id("metric"), session_id: sessionId, ...metric };
    await persist("metrics", "workout_metrics", row);
    setMetric({ name: "", unit: "reps", target: 0 });
  }

  async function saveWorkout(memberId: string, metricId: string, value: number) {
    if (!sessionId || !canEditMember(permission, memberId)) return;
    const existing = data.workouts.find((record) => record.member_id === memberId && record.metric_id === metricId && record.session_id === sessionId);
    const row: WorkoutRecord = {
      id: existing?.id ?? id("workout"),
      member_id: memberId,
      session_id: sessionId,
      metric_id: metricId,
      value,
      remark: existing?.remark ?? "",
      recorded_at: existing?.recorded_at ?? new Date().toISOString()
    };
    await persist("workouts", "workout_records", row);
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2"><Dumbbell size={18} className="text-moss" /><h2 className="font-semibold">Workout Table</h2></div>
        <select className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
          {data.sessions.map((session) => <option key={session.id} value={session.id}>{session.session_date} · {session.title}</option>)}
        </select>
      </div>

      {permission.isAdmin && (
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" placeholder="Workout item e.g. Pumping" value={metric.name} onChange={(event) => setMetric({ ...metric, name: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" placeholder="Unit" value={metric.unit} onChange={(event) => setMetric({ ...metric, unit: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" type="number" placeholder="Target" value={metric.target} onChange={(event) => setMetric({ ...metric, target: Number(event.target.value) })} />
          <button className="focus-ring flex items-center justify-center gap-2 rounded-md border border-ink/15 px-3 py-2" onClick={addMetric}><Plus size={16} /> Add Item</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-ink/55">
              <th className="sticky left-0 z-10 border-b border-ink/10 bg-white px-3 py-3">Member</th>
              {metrics.map((item) => (
                <th key={item.id} className="border-b border-ink/10 px-3 py-3">
                  <div className="font-medium text-ink">{item.name}</div>
                  <div className="text-xs">{item.unit}{item.target ? ` · target ${item.target}` : ""}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => {
              const editable = canEditMember(permission, member.id);
              return (
                <tr key={member.id} className={editable ? "bg-paper" : "bg-ink/5"}>
                  <td className="sticky left-0 z-10 border-b border-white bg-inherit px-3 py-3 font-medium">{member.name}</td>
                  {metrics.map((metricItem) => {
                    const record = data.workouts.find((item) => item.member_id === member.id && item.metric_id === metricItem.id && item.session_id === sessionId);
                    return (
                      <td key={metricItem.id} className="border-b border-white px-3 py-2">
                        <input
                          disabled={!editable}
                          className="focus-ring w-28 rounded-md border border-ink/15 bg-white px-2 py-1 disabled:cursor-not-allowed disabled:bg-ink/5 disabled:text-ink/45"
                          type="number"
                          defaultValue={record?.value ?? ""}
                          placeholder="-"
                          onBlur={(event) => {
                            if (event.target.value !== "") void saveWorkout(member.id, metricItem.id, Number(event.target.value));
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewsPanel({ data, selectedMemberId, setSelectedMemberId, permission, persist }: { data: TeamData; selectedMemberId: string; setSelectedMemberId: (value: string) => void; permission: Permission; persist: Persist }) {
  const [review, setReview] = useState({ period_type: "weekly" as "weekly" | "monthly", period_label: "2026-W28", score: 80, feedback: "" });

  async function addReview() {
    if (!permission.isAdmin || !selectedMemberId) return;
    const row: Review = { id: id("review"), member_id: selectedMemberId, ...review, created_at: new Date().toISOString() };
    await persist("reviews", "reviews", row);
    setReview({ ...review, feedback: "" });
  }

  const visibleReviews = permission.isAdmin ? data.reviews : data.reviews.filter((item) => item.member_id === permission.memberId);

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2"><Check size={18} className="text-moss" /><h2 className="font-semibold">Weekly / Monthly Review</h2></div>
      {permission.isAdmin && (
        <>
          <div className="mb-4 grid gap-2 md:grid-cols-5">
            <select className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
            <select className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={review.period_type} onChange={(event) => setReview({ ...review, period_type: event.target.value as "weekly" | "monthly" })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
            <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={review.period_label} onChange={(event) => setReview({ ...review, period_label: event.target.value })} />
            <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" type="number" min={0} max={100} value={review.score} onChange={(event) => setReview({ ...review, score: Number(event.target.value) })} />
            <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={addReview}><Save size={16} /> Review</button>
          </div>
          <textarea className="focus-ring mb-4 min-h-24 w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Admin feedback" value={review.feedback} onChange={(event) => setReview({ ...review, feedback: event.target.value })} />
        </>
      )}
      <div className="space-y-2">
        {visibleReviews.slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-md bg-paper p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{data.members.find((member) => member.id === item.member_id)?.name} · {item.period_label}</span>
              <span className="font-semibold">{item.score}/100</span>
            </div>
            <p className="text-ink/65">{item.feedback}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
