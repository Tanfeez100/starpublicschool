import { pool } from "../db.js";


export const addStudent = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
  student_name,
  father_name,
  mother_name,
  gender,
  class: studentClass,   // 👈 rename here
  roll_number,
  section,
  mobile_number,
  address,
  uses_transport,
  transport_charge,
} = req.body;


    if (
      !student_name ||
      !father_name ||
      !mother_name ||
      !gender ||
      !className ||
      !roll_number ||
      !section ||
      !mobile_number ||
      !address
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    await client.query("BEGIN");

    /* 1️⃣ INSERT STUDENT */
    const studentQuery = `
      INSERT INTO students (
        student_name,
        father_name,
        mother_name,
        gender,
        class,
        roll_number,
        section,
        mobile_number,
        address,
        uses_transport,
        transport_charge
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `;

    const studentValues = [
      student_name,
      father_name,
      mother_name,
      gender,
      className,
      roll_number,
      section,
      mobile_number,
      address,
      uses_transport,
      uses_transport ? transport_charge : null,
    ];

    const studentResult = await client.query(studentQuery, studentValues);
    const studentId = studentResult.rows[0].id;

    /* 2️⃣ No legacy `fees` insert here — transport is handled during bill generation */

    await client.query("COMMIT");

    res.status(201).json({
      message: "Student added successfully",
      student_id: studentId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Add student error:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};
