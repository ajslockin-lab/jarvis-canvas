export interface Assignment {
  id: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  points: number | null;
  url: string | null;
  completed: boolean;
  courseId?: string;
}

export interface Course {
  id: string;
  userId: string;
  name: string;
  code: string | null;
  color: string | null;
  lastSynced: Date;
  assignments?: Assignment[];
}

export interface Reminder {
  id: string;
  userId: string;
  assignmentId: string | null;
  type: string;
  triggeredAt: Date;
  active: boolean;
}

export interface VoiceCommand {
  intent:
    | "check_deadlines"
    | "set_reminder"
    | "study_plan"
    | "tutor"
    | "social"
    | "general";
  entities: {
    courseName?: string;
    assignmentName?: string;
    dueDate?: string;
    timeDuration?: string;
  };
  confidence: number;
  rawText: string;
}
