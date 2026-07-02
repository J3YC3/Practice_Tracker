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

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function canEditMember(permission: Permission, memberId: string) {
  return permission.isAdmin || permission.memberId === memberId;
}

export default function TeamTracker() {
  const [data, setData] = useState<TeamData>(sampleData);
  const [sessionId, setSessionId] = useState(sampleData.sessions[0]?.id ?? "");
  const [selectedMemberId, setSelectedMemberId] = useState(sampleData.members[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState("attendance");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (!supabase) return;
    setNotice("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setNotice(error.message);
    else setNotice("Account created. Admin still needs to link this user to a member profile.");
  }

  async function signOut() {
    if (supabase && isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setIsAuthed(false);
    setProfile(unlinkedProfile);
    setEmail("");
    setPassword("");
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
              <p className="text-sm text-ink/60">Admin and member login</p>
            </div>
          </div>
          <div className="space-y-3">
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input className="focus-ring w-full rounded-md border border-ink/15 px-3 py-2" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button className="focus-ring rounded-md bg-moss px-3 py-2 text-white" onClick={signIn}>Login</button>
              <button className="focus-ring rounded-md border border-ink/15 px-3 py-2" onClick={signUp}>Sign up</button>
            </div>
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
          {activeTab === "members" && <MembersPanel data={data} permission={permission} persist={persist} setSelectedMemberId={setSelectedMemberId} />}
          {activeTab === "workout" && <WorkoutPanel data={data} sessionId={sessionId} setSessionId={setSessionId} permission={permission} persist={persist} />}
          {activeTab === "reviews" && <ReviewsPanel data={data} selectedMemberId={selectedMemberId} setSelectedMemberId={setSelectedMemberId} permission={permission} persist={persist} />}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-3 flex items-center gap-2"><Shield size={18} className="text-moss" /><h2 className="font-semibold">Current Access</h2></div>
            <div className="space-y-2 text-sm">
              <p><span className="text-ink/55">User:</span> {profile.display_name}</p>
              <p><span className="text-ink/55">Role:</span> {profile.role}</p>
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

  async function addSession() {
    if (!permission.isAdmin || !newSession.title.trim()) return;
    const row: TrainingSession = { id: id("session"), ...newSession };
    await persist("sessions", "training_sessions", row);
    setSessionId(row.id);
    setNewSession({ title: "", session_date: today(), start_time: "20:00", end_time: "22:00", late_after_minutes: 10, notes: "" });
  }

  async function setAttendance(memberId: string, status: AttendanceStatus) {
    if (!sessionId || !canEditMember(permission, memberId)) return;
    const existing = data.attendance.find((record) => record.member_id === memberId && record.session_id === sessionId);
    const row: AttendanceRecord = {
      id: existing?.id ?? id("attendance"),
      member_id: memberId,
      session_id: sessionId,
      status,
      reason: existing?.reason ?? "",
      created_at: existing?.created_at ?? new Date().toISOString()
    };
    await persist("attendance", "attendance_records", row);
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2"><CalendarClock size={18} className="text-moss" /><h2 className="font-semibold">Attendance</h2></div>
        <select className="focus-ring rounded-md border border-ink/15 px-3 py-2" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
          {data.sessions.map((session) => <option key={session.id} value={session.id}>{session.session_date} · {session.title}</option>)}
        </select>
      </div>

      {permission.isAdmin && (
        <div className="mb-4 grid gap-2 md:grid-cols-6">
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2 md:col-span-2" placeholder="Practice title" value={newSession.title} onChange={(event) => setNewSession({ ...newSession, title: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" type="date" value={newSession.session_date} onChange={(event) => setNewSession({ ...newSession, session_date: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" type="time" value={newSession.start_time} onChange={(event) => setNewSession({ ...newSession, start_time: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" type="time" value={newSession.end_time} onChange={(event) => setNewSession({ ...newSession, end_time: event.target.value })} />
          <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={addSession}><Plus size={16} /> Session</button>
        </div>
      )}

      {currentSession && <p className="mb-3 text-sm text-ink/60">Late after {currentSession.late_after_minutes} minutes · {currentSession.start_time} to {currentSession.end_time}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-sm">
          <thead className="text-left text-ink/55"><tr><th className="px-3">Member</th><th>Group</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {data.members.map((member) => {
              const record = data.attendance.find((item) => item.member_id === member.id && item.session_id === sessionId);
              const editable = canEditMember(permission, member.id);
              return (
                <tr key={member.id} className={`${editable ? "bg-paper" : "bg-ink/5 text-ink/45"}`}>
                  <td className="rounded-l-md px-3 py-3 font-medium">{member.name}</td>
                  <td>{member.group_name}</td>
                  <td className="capitalize">{record?.status ?? "not marked"}</td>
                  <td className="rounded-r-md py-2">
                    <div className="flex flex-wrap gap-2">
                      {statusOptions.map((status) => (
                        <button key={status} disabled={!editable} className={`focus-ring rounded-md px-2 py-1 capitalize disabled:cursor-not-allowed disabled:opacity-40 ${record?.status === status ? "bg-moss text-white" : "border border-ink/10 bg-white"}`} onClick={() => setAttendance(member.id, status)}>{status}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MembersPanel({ data, permission, persist, setSelectedMemberId }: { data: TeamData; permission: Permission; persist: Persist; setSelectedMemberId: (value: string) => void }) {
  const [form, setForm] = useState({ name: "", role: "Member", group_name: "General", phone: "" });

  async function addMember() {
    if (!permission.isAdmin || !form.name.trim()) return;
    const row: Member = { id: id("member"), ...form, active: true, created_at: new Date().toISOString() };
    await persist("members", "members", row);
    setSelectedMemberId(row.id);
    setForm({ name: "", role: "Member", group_name: "General", phone: "" });
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2"><Users size={18} className="text-moss" /><h2 className="font-semibold">Member Management</h2></div>
      {permission.isAdmin && (
        <div className="mb-4 grid gap-2 md:grid-cols-5">
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2 md:col-span-2" placeholder="Member name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" placeholder="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
          <input className="focus-ring rounded-md border border-ink/15 px-3 py-2" placeholder="Group" value={form.group_name} onChange={(event) => setForm({ ...form, group_name: event.target.value })} />
          <button className="focus-ring flex items-center justify-center gap-2 rounded-md bg-moss px-3 py-2 text-white" onClick={addMember}><Plus size={16} /> Member</button>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {data.members.map((member) => (
          <div key={member.id} className={`rounded-md border border-ink/10 p-3 ${canEditMember(permission, member.id) ? "bg-paper" : "bg-ink/5"}`}>
            <div className="font-medium">{member.name}</div>
            <div className="text-sm text-ink/60">{member.role} · {member.group_name}</div>
          </div>
        ))}
      </div>
    </section>
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
