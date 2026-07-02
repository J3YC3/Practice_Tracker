export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type UserRole = "admin" | "member";

export type UserProfile = {
  id: string;
  user_id?: string;
  member_id?: string;
  role: UserRole;
  is_admin?: boolean;
  display_name: string;
  email?: string;
  require_password_reset?: boolean;
  created_at: string;
};

export type Member = {
  id: string;
  name: string;
  role: string;
  group_name: string;
  phone?: string;
  active: boolean;
  created_at: string;
};

export type TrainingSession = {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  late_after_minutes: number;
  notes?: string;
};

export type AttendanceRecord = {
  id: string;
  member_id: string;
  session_id: string;
  status: AttendanceStatus;
  reason?: string;
  created_at: string;
};

export type WorkoutMetric = {
  id: string;
  session_id?: string;
  name: string;
  unit: string;
  target?: number;
};

export type WorkoutRecord = {
  id: string;
  member_id: string;
  session_id?: string;
  metric_id: string;
  value: number;
  remark?: string;
  recorded_at: string;
};

export type Review = {
  id: string;
  member_id: string;
  period_type: "weekly" | "monthly";
  period_label: string;
  score: number;
  feedback: string;
  created_at: string;
};

export type TeamData = {
  profiles: UserProfile[];
  members: Member[];
  sessions: TrainingSession[];
  attendance: AttendanceRecord[];
  metrics: WorkoutMetric[];
  workouts: WorkoutRecord[];
  reviews: Review[];
};
