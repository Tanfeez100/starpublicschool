# Student Add/Edit Form - Frontend Reference

## Purpose
This note explains how to update the student add/edit form in your frontend to support the `uses_transport` field, which is required for the new billing logic.

---

## 1. Add/Edit Student API (Backend)
- **POST /api/students/add**: Add a new student
- **PUT /api/students/edit/:id**: Edit an existing student
- Both endpoints accept a `uses_transport` boolean field (true/false)

### Example Request Body
```json
{
  "name": "John Doe",
  "father_name": "Father Doe",
  "mobile": "9876543210",
  "address": "123 Main St",
  "class": "1",
  "roll_no": 5,
  "section": "A",
  "uses_transport": true
}
```

---

## 2. Frontend Form Field
Add a checkbox or toggle for transport usage:

### Example (React JSX)
```jsx
<label>
  <input
    type="checkbox"
    name="uses_transport"
    checked={form.uses_transport}
    onChange={e => setForm({ ...form, uses_transport: e.target.checked })}
  />
  Uses School Transport
</label>
```
- Default value: `false`
- Save as boolean (true/false)

---

## 3. Data Flow
- When adding or editing a student, always send the `uses_transport` field.
- The backend will store this value in the students table.
- The billing system will use this field to determine if the transport fee should be applied for each student.

---

## 4. Existing Details
- All other student fields (name, class, section, roll_no, etc.) remain unchanged.
- Only the new `uses_transport` field is added.

---

## 5. Summary
- **Always include `uses_transport` in the student form.**
- **No need to ask for transport info during billing—it's automatic.**
- **This ensures correct fee calculation for each student.**

---

## 6. Example Full Form Data
```json
{
  "name": "Jane Smith",
  "father_name": "Mr. Smith",
  "mobile": "1234567890",
  "address": "456 Elm St",
  "class": "2",
  "roll_no": 12,
  "section": "B",
  "uses_transport": false
}
```

---

**Reference this note when updating your frontend student add/edit page.**
