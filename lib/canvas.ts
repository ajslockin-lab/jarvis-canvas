/**
 * Canvas API helpers.
 * `canvasBaseUrl` is the full URL (e.g., https://school.instructure.com).
 * We strip trailing slashes and use it directly — never prepend https://.
 */

function normalize(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function fetchCanvasCourses(token: string, canvasBaseUrl: string) {
  const base = normalize(canvasBaseUrl);
  const res = await fetch(`${base}/api/v1/courses?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json();
}

export async function fetchCanvasAssignments(token: string, canvasBaseUrl: string, courseId: string) {
  const base = normalize(canvasBaseUrl);
  const res = await fetch(
    `${base}/api/v1/courses/${courseId}/assignments?include[]=due_at&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json();
}
