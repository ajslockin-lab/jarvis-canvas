import { canvasFetch } from "./errors";

interface CanvasEnrollment {
  id: number;
  course_id: number;
  user_id: number;
  grades?: {
    current_score: number | null;
    final_score: number | null;
  };
}

/**
 * Fetch enrollments with grades for a specific course from Canvas API.
 * Canvas endpoint: GET /api/v1/courses/:course_id/enrollments?include[]=grades
 */
export async function fetchEnrollmentsWithGrades(
  token: string,
  canvasBaseUrl: string,
  canvasUserId: string
): Promise<{ courseId: string; currentScore: number | null; finalScore: number | null }[]> {
  const base = canvasBaseUrl.replace(/\/+$/, "");

  // First, get the user's enrollments across all courses
  const enrollments = await canvasFetch<CanvasEnrollment[]>(
    `${base}/api/v1/users/${canvasUserId}/enrollments?include[]=grades&per_page=100&type[]=StudentEnrollment`,
    token
  );

  return enrollments
    .filter((e) => e.grades)
    .map((e) => ({
      courseId: String(e.course_id),
      currentScore: e.grades?.current_score ?? null,
      finalScore: e.grades?.final_score ?? null,
    }));
}
