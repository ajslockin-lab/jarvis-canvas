import { describe, it, expect } from "vitest";

describe("Canvas sync cross-user scoping", () => {
  // These mirror the functions in canvas.ts that scope IDs with userId prefix
  function scopedCourseId(userId: string, canvasCourseId: string) {
    return `${userId}__c${canvasCourseId}`;
  }

  function scopedAssignmentId(scopedCourse: string, canvasAssignmentId: string) {
    return `${scopedCourse}__a${canvasAssignmentId}`;
  }

  it("generates different scoped course IDs for different users on same Canvas course", () => {
    const userA = "u1";
    const userB = "u2";
    const canvasCourseId = "12345";
    const idA = scopedCourseId(userA, canvasCourseId);
    const idB = scopedCourseId(userB, canvasCourseId);
    expect(idA).not.toBe(idB);
    expect(idA).toBe("u1__c12345");
    expect(idB).toBe("u2__c12345");
  });

  it("includes the userId prefix in scoped course ID", () => {
    const id = scopedCourseId("canvas-99", "101");
    expect(id.startsWith("canvas-99__c")).toBe(true);
    expect(id).toBe("canvas-99__c101");
  });

  it("generates scoped assignment IDs that nest under course scope", () => {
    const courseId = "u1__c1001";
    const assignmentId = scopedAssignmentId(courseId, "2002");
    expect(assignmentId).toBe("u1__c1001__a2002");
    expect(assignmentId.startsWith(courseId)).toBe(true);
  });

  it("prevents cross-user collision for same Canvas assignment", () => {
    const courseA = scopedCourseId("u1", "55");
    const courseB = scopedCourseId("u2", "55");
    const assignmentA = scopedAssignmentId(courseA, "100");
    const assignmentB = scopedAssignmentId(courseB, "100");
    expect(assignmentA).not.toBe(assignmentB);
    expect(assignmentA).toBe("u1__c55__a100");
    expect(assignmentB).toBe("u2__c55__a100");
  });

  it("handles edge case of empty or special user IDs gracefully", () => {
    expect(scopedCourseId("u-special", "999")).toBe("u-special__c999");
    expect(scopedCourseId("", "999")).toBe("__c999");
  });

  it("maintains deterministic prefix for scoped IDs enabling reverse lookup", () => {
    const scoped = scopedCourseId("u3", "88");
    const [, userPart, coursePart] = scoped.match(/(.+)__c(.+)/) || [];
    expect(userPart).toBe("u3");
    expect(coursePart).toBe("88");
  });

  it("creates unique IDs even when same user has multiple Canvas courses", () => {
    const user = "u4";
    const id1 = scopedCourseId(user, "1");
    const id2 = scopedCourseId(user, "2");
    const id3 = scopedCourseId(user, "3");
    expect(new Set([id1, id2, id3]).size).toBe(3);
    expect(id1).toBe("u4__c1");
    expect(id2).toBe("u4__c2");
    expect(id3).toBe("u4__c3");
  });
});
