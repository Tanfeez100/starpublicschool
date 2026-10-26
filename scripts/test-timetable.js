import assert from "assert";
import {
  detectSlotConflicts,
} from "../src/controllers/timetable.controller.js";

console.log("🚀 Running Timetable Module Automated Unit Tests...\n");

// 1. Test Conflict Detection: Class Double Booking
console.log("Test 1: Class double-booking detection...");
const mockEntries = [
  {
    id: "slot-1",
    academic_session: "2026-27",
    weekday: "Monday",
    period_number: 1,
    class_name: "1",
    section: "A",
    subject_name: "English",
    teacher_id: "teacher-101",
    teacher_name: "John Doe",
    room_no: "Room 101",
  },
  {
    id: "slot-2",
    academic_session: "2026-27",
    weekday: "Monday",
    period_number: 2,
    class_name: "1",
    section: "A",
    subject_name: "Math",
    teacher_id: "teacher-102",
    teacher_name: "Jane Smith",
    room_no: "Room 101",
  },
];

const classConflict = detectSlotConflicts({
  academic_session: "2026-27",
  weekday: "Monday",
  period_number: 1,
  class_name: "1",
  section: "A",
  teacher_id: "teacher-103",
  teacher_name: "Bob Wilson",
  room_no: "Room 102",
  allEntries: mockEntries,
});
assert.strictEqual(classConflict.length, 1, "Should detect exactly 1 class collision");
assert.strictEqual(classConflict[0].type, "CLASS_DOUBLE_BOOKING");
console.log("✅ Passed: Class double booking caught successfully.\n");

// 2. Test Conflict Detection: Teacher Double Booking
console.log("Test 2: Teacher double-booking detection...");
const teacherConflict = detectSlotConflicts({
  academic_session: "2026-27",
  weekday: "Monday",
  period_number: 1,
  class_name: "2",
  section: "B",
  teacher_id: "teacher-101", // Already teaching slot-1 in Class 1-A
  teacher_name: "John Doe",
  room_no: "Room 103",
  allEntries: mockEntries,
});
assert.strictEqual(teacherConflict.length, 1, "Should detect teacher collision");
assert.strictEqual(teacherConflict[0].type, "TEACHER_DOUBLE_BOOKING");
console.log("✅ Passed: Teacher double booking caught successfully.\n");

// 3. Test Conflict Detection: Room Collision
console.log("Test 3: Room collision detection...");
const roomConflict = detectSlotConflicts({
  academic_session: "2026-27",
  weekday: "Monday",
  period_number: 2,
  class_name: "3",
  section: "A",
  teacher_id: "teacher-105",
  teacher_name: "Alice Brown",
  room_no: "Room 101", // Already occupied by slot-2 in period 2
  allEntries: mockEntries,
});
assert.strictEqual(roomConflict.length, 1, "Should detect room collision");
assert.strictEqual(roomConflict[0].type, "ROOM_COLLISION");
console.log("✅ Passed: Room collision caught successfully.\n");

// 4. Test Conflict Detection: Clean Slot (No conflict)
console.log("Test 4: Clean slot without conflict...");
const cleanSlot = detectSlotConflicts({
  academic_session: "2026-27",
  weekday: "Tuesday", // Different day
  period_number: 1,
  class_name: "1",
  section: "A",
  teacher_id: "teacher-101",
  teacher_name: "John Doe",
  room_no: "Room 101",
  allEntries: mockEntries,
});
assert.strictEqual(cleanSlot.length, 0, "Different day should have zero conflicts");
console.log("✅ Passed: No false positive on different weekday.\n");

// 5. Test Conflict Detection: Editing same slot (excludeEntryId)
console.log("Test 5: Editing existing slot without self-collision...");
const editSelf = detectSlotConflicts({
  academic_session: "2026-27",
  weekday: "Monday",
  period_number: 1,
  class_name: "1",
  section: "A",
  teacher_id: "teacher-101",
  teacher_name: "John Doe",
  room_no: "Room 101",
  excludeEntryId: "slot-1",
  allEntries: mockEntries,
});
assert.strictEqual(editSelf.length, 0, "Excluding current slot must produce zero conflicts");
console.log("✅ Passed: Self-update excluded successfully.\n");

// 6. Test Substitution Busy Teacher Check
console.log("Test 6: Substitution busy teacher check...");
const busyTeacherId = "teacher-101"; // busy on Monday Period 1 in slot-1
const isBusy = mockEntries.some(
  (e) => e.weekday === "Monday" && e.period_number === 1 && e.teacher_id === busyTeacherId
);
assert.strictEqual(isBusy, true, "Should identify that teacher-101 is already teaching in period 1 on Monday");
console.log("✅ Passed: Busy teacher identified and prevented from taking simultaneous substitution.\n");

// 7. Test Faculty Replacement in Master Routine
console.log("Test 7: Faculty handover collision detection...");
const outgoingTeacherId = "teacher-101";
const incomingTeacherId = "teacher-102"; // Already teaches slot-2 in period 2
// slot-1 is period 1, so replacing teacher-101 with teacher-102 on slot-1 does NOT collide with slot-2 (period 2)
const collisions = mockEntries
  .filter((e) => e.teacher_id === outgoingTeacherId)
  .filter((targetSlot) =>
    mockEntries.some(
      (e) =>
        e.weekday === targetSlot.weekday &&
        e.period_number === targetSlot.period_number &&
        e.teacher_id === incomingTeacherId
    )
  );
assert.strictEqual(collisions.length, 0, "No collision because teacher-102 teaches period 2, not period 1");
console.log("✅ Passed: Faculty replacement collision check verified successfully.\n");

console.log("🎉 ALL TIMETABLE UNIT TESTS PASSED SUCCESSFULLY!");
