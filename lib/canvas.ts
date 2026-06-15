export async function fetchCanvasCourses(token: string, domain: string) {
  const res = await fetch(`https://${domain}/api/v1/courses?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json();
}

export async function fetchCanvasAssignments(token: string, domain: string, courseId: string) {
  const res = await fetch(
    `https://${domain}/api/v1/courses/${courseId}/assignments?include[]=due_at&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Canvas API error: ${res.status}`);
  return res.json();
}
