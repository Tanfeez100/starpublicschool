# Invoice API - Frontend Integration Reference

## Purpose
This document explains how to fetch and display invoice data in your frontend, matching your current invoice design. It also clarifies which fields to use and which to ignore (e.g., Hostel Fee).

---

## 1. API Endpoint

**GET /api/invoice/:id**
- Returns all invoice details for a given fee record.
- Example: `/api/invoice/8c34112a-70ee-4e37-a84a-5a8595f24edf`

### Example Response
```json
{
  "id": "8c34112a-70ee-4e37-a84a-5a8595f24edf",
  "month": "January",
  "total_fee": 2100,
  "paid_amount": 2000,
  "status": "PARTIAL",
  "created_at": "2026-01-22T00:00:00Z",
  "students": {
    "name": "John Doe",
    "class": "5",
    "roll_no": 12,
    "father_name": "Mr. Doe"
  },
  "tuition_fee": 1000,
  "exam_fee": 200,
  "annual_fee": 100,
  "transport_fee": 300,
  "computer_fee": 200,
  "fine": 50,
  "advance": 150,
  "breakdown": {
    "School Fee": 1000,
    "Examination Fee": 200,
    "Annual Charges": 100,
    "Transport Fee": 300,
    "Computer Fee": 200,
    "Fine Fee": 50,
    "Balance / Adv.": 150
  }
}
```

---

## 2. Frontend Invoice Table Mapping

| Invoice Field      | API Field         | Notes                       |
|-------------------|-------------------|-----------------------------|
| School Fee        | tuition_fee       | Use as is                   |
| Examination Fee   | exam_fee          | Use as is                   |
| Annual Charges    | annual_fee        | Use as is                   |
| Transport Fee     | transport_fee     | Use as is                   |
| Computer Fee      | computer_fee      | Use if present, else 0      |
| Balance / Adv.    | advance           | Use as is                   |
| Fine Fee          | fine              | Use as is                   |
| Hostel Fee        | (IGNORE)          | Do not display              |

- **Do not show Hostel Fee** in the invoice table, even if present in the API or design.
- If a field is missing in the API, display as ₹0.

---

## 3. Example JSX Table Row Mapping

```jsx
<tr>
  <td>School Fee</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.tuition_fee || 0}</td>
</tr>
<tr>
  <td>Examination Fee</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.exam_fee || 0}</td>
</tr>
<tr>
  <td>Annual Charges</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.annual_fee || 0}</td>
</tr>
<tr>
  <td>Transport Fee</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.transport_fee || 0}</td>
</tr>
<tr>
  <td>Computer Fee</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.computer_fee || 0}</td>
</tr>
<tr>
  <td>Balance / Adv.</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.advance || 0}</td>
</tr>
<tr>
  <td>Fine Fee</td>
  <td style={{ textAlign: 'right' }}>₹{invoice.fine || 0}</td>
</tr>
```

---

## 4. Student & Invoice Header Fields

- **Student Name:** `invoice.students.name`
- **Father's Name:** `invoice.students.father_name`
- **Class:** `invoice.students.class`
- **Section:** (if available)
- **Roll No:** `invoice.students.roll_no`
- **Month:** `invoice.month`
- **Date:** Format `invoice.created_at` as needed

---

## 5. Totals

- **Total:** `invoice.total_fee`
- **Paid:** `invoice.paid_amount`
- **Balance:** `invoice.total_fee - invoice.paid_amount`

---

## 6. Notes
- Always ignore Hostel Fee in the frontend, even if present in the design or API.
- If any field is missing, default to ₹0.
- Use the API as the single source of truth for invoice data.

---

**Reference this document when updating your InvoiceEnhanced.jsx or similar frontend files.**
