function normalize(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function canvasFetch(url: string, token: string): Promise<Response> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res;
  } catch (err) {
    throw new Error(
      `Canvas connection failed: ${err instanceof Error ? err.message : "network error"}`,
    );
  }
}

export async function fetchCanvasCourses(token: string, canvasBaseUrl: string) {
  const base = normalize(canvasBaseUrl);
  const res = await canvasFetch(`${base}/api/v1/courses?per_page=100`, token);
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>[]>;
}

export async function fetchCanvasAssignments(token: string, canvasBaseUrl: string, courseId: string) {
  const base = normalize(canvasBaseUrl);
  const res = await canvasFetch(`${base}/api/v1/courses/${courseId}/assignments?include[]=due_at&per_page=100`, token);
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>[]>;
}

export async function fetchCanvasUser(token: string, canvasBaseUrl: string) {
  const base = normalize(canvasBaseUrl);
  const res = await canvasFetch(`${base}/api/v1/users/self`, token);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Canvas auth failed: invalid or expired token");
    }
    throw new Error(`Canvas API error: ${res.status}`);
  }
  return res.json() as Promise<{ id: number; name: string; primary_email?: string; login_id?: string }>;
}

export async function fetchEnrollmentsWithGrades(token: string, canvasBaseUrl: string, canvasUserId: string) {
  const base = normalize(canvasBaseUrl);
  const res = await canvasFetch(
    `${base}/api/v1/users/${canvasUserId}/enrollments?include[]=grades&per_page=100&type[]=StudentEnrollment`,
    token,
  );
  if (!res.ok) throw new Error(`Canvas enrollments error: ${res.status}`);
  const enrollments = await res.json() as {
    id: number;
    course_id: number;
    grades?: { current_score: number | null; final_score: number | null };
  }[];
  return enrollments.filter((e) => e.grades).map((e) => ({
    courseId: String(e.course_id),
    currentScore: e.grades?.current_score ?? null,
    finalScore: e.grades?.final_score ?? null,
  }));
}
