import { TeamData } from "@/lib/types";

const now = new Date().toISOString();

export const sampleData: TeamData = {
  profiles: [
    { id: "p-admin", role: "admin", is_admin: true, display_name: "Admin", email: "admin@example.com", require_password_reset: false, created_at: now },
    { id: "p-junwei", member_id: "m1", role: "member", is_admin: false, display_name: "Jun Wei", email: "junwei@example.com", require_password_reset: false, created_at: now },
    { id: "p-kaixin", member_id: "m2", role: "member", is_admin: false, display_name: "Kai Xin", email: "kaixin@example.com", require_password_reset: false, created_at: now }
  ],
  members: [
    { id: "m1", name: "Jun Wei", role: "Section Leader", group_name: "Snare", phone: "", active: true, created_at: now },
    { id: "m2", name: "Kai Xin", role: "Member", group_name: "Bass", phone: "", active: true, created_at: now },
    { id: "m3", name: "Aiman", role: "Member", group_name: "Tenor", phone: "", active: true, created_at: now },
    { id: "m4", name: "Mei Yi", role: "Member", group_name: "Cymbal", phone: "", active: true, created_at: now }
  ],
  sessions: [
    {
      id: "s1",
      title: "Monday Practice",
      session_date: "2026-07-06",
      start_time: "20:00",
      end_time: "22:00",
      late_after_minutes: 10,
      notes: "Marching and endurance"
    },
    {
      id: "s2",
      title: "Friday Workout Review",
      session_date: "2026-07-10",
      start_time: "19:00",
      end_time: "21:00",
      late_after_minutes: 5,
      notes: "Monthly baseline"
    }
  ],
  attendance: [
    { id: "a1", member_id: "m1", session_id: "s1", status: "present", reason: "", created_at: now },
    { id: "a2", member_id: "m2", session_id: "s1", status: "late", reason: "Transport", created_at: now },
    { id: "a3", member_id: "m3", session_id: "s1", status: "present", reason: "", created_at: now },
    { id: "a4", member_id: "m4", session_id: "s1", status: "absent", reason: "", created_at: now }
  ],
  metrics: [
    { id: "wm1", session_id: "s1", name: "Pumping", unit: "reps", target: 40 },
    { id: "wm2", session_id: "s1", name: "Sit-up", unit: "reps", target: 50 },
    { id: "wm3", session_id: "s2", name: "Run", unit: "minutes", target: 12 }
  ],
  workouts: [
    { id: "w1", member_id: "m1", session_id: "s1", metric_id: "wm1", value: 48, remark: "Strong form", recorded_at: now },
    { id: "w2", member_id: "m2", session_id: "s1", metric_id: "wm1", value: 35, remark: "Need consistency", recorded_at: now },
    { id: "w3", member_id: "m3", session_id: "s1", metric_id: "wm1", value: 42, remark: "", recorded_at: now },
    { id: "w4", member_id: "m4", session_id: "s1", metric_id: "wm1", value: 22, remark: "Absent from final set", recorded_at: now }
  ],
  reviews: [
    { id: "r1", member_id: "m1", period_type: "weekly", period_label: "2026-W28", score: 88, feedback: "Reliable attendance and good stamina.", created_at: now },
    { id: "r2", member_id: "m2", period_type: "weekly", period_label: "2026-W28", score: 72, feedback: "Good attitude, improve punctuality.", created_at: now }
  ]
};
