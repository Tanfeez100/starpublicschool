import db from '../config/mega.js';

// ─── Get All Holidays ────────────────────────────────────────────────────
export const getAllHolidays = async (req, res) => {
  try {
    const query = `
      SELECT id, holiday_date, title, description, holiday_type, is_optional
      FROM holiday_calendar
      ORDER BY holiday_date ASC
    `;
    
    const [holidays] = await db.promise().query(query);
    
    return res.status(200).json({
      success: true,
      data: holidays,
      count: holidays.length
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching holidays',
      error: error.message
    });
  }
};

// ─── Get Holidays by Year ────────────────────────────────────────────────
export const getHolidaysByYear = async (req, res) => {
  try {
    const { year } = req.params;

    if (!year || isNaN(year)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year parameter'
      });
    }

    const query = `
      SELECT id, holiday_date, title, description, holiday_type, is_optional
      FROM holiday_calendar
      WHERE YEAR(holiday_date) = ?
      ORDER BY holiday_date ASC
    `;
    
    const [holidays] = await db.promise().query(query, [year]);
    
    return res.status(200).json({
      success: true,
      year: parseInt(year),
      data: holidays,
      count: holidays.length
    });
  } catch (error) {
    console.error('Error fetching holidays by year:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching holidays',
      error: error.message
    });
  }
};

// ─── Get Holidays in Date Range ──────────────────────────────────────────
export const getHolidaysInRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    const query = `
      SELECT id, holiday_date, title, description, holiday_type, is_optional
      FROM holiday_calendar
      WHERE holiday_date BETWEEN ? AND ?
      ORDER BY holiday_date ASC
    `;
    
    const [holidays] = await db.promise().query(query, [startDate, endDate]);
    
    return res.status(200).json({
      success: true,
      startDate,
      endDate,
      data: holidays,
      count: holidays.length
    });
  } catch (error) {
    console.error('Error fetching holidays in range:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching holidays',
      error: error.message
    });
  }
};

// ─── Check if Date is Holiday ───────────────────────────────────────────
export const checkIsHoliday = async (req, res) => {
  try {
    const { date } = req.params;

    const query = `
      SELECT id, holiday_date, title, description, holiday_type, is_optional
      FROM holiday_calendar
      WHERE holiday_date = ?
      LIMIT 1
    `;
    
    const [result] = await db.promise().query(query, [date]);
    const holiday = result[0] || null;
    
    return res.status(200).json({
      success: true,
      date,
      isHoliday: !!holiday,
      holiday
    });
  } catch (error) {
    console.error('Error checking holiday:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking holiday',
      error: error.message
    });
  }
};

// ─── Create Holiday ─────────────────────────────────────────────────────
export const createHoliday = async (req, res) => {
  try {
    const { holiday_date, title, description, holiday_type, is_optional } = req.body;
    const userId = req.user?.id;

    // Validation
    if (!holiday_date || !title) {
      return res.status(400).json({
        success: false,
        message: 'holiday_date and title are required'
      });
    }

    const query = `
      INSERT INTO holiday_calendar 
      (holiday_date, title, description, holiday_type, is_optional, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.promise().query(query, [
      holiday_date,
      title,
      description || null,
      holiday_type || 'national',
      is_optional ? 1 : 0,
      userId || null
    ]);
    
    return res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      holidayId: result.insertId
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Holiday on this date already exists'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error creating holiday',
      error: error.message
    });
  }
};

// ─── Bulk Create Holidays ───────────────────────────────────────────────
export const bulkCreateHolidays = async (req, res) => {
  try {
    const { holidays } = req.body;
    const userId = req.user?.id;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'holidays array is required'
      });
    }

    const query = `
      INSERT INTO holiday_calendar 
      (holiday_date, title, description, holiday_type, is_optional, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title = VALUES(title)
    `;

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const holiday of holidays) {
      try {
        await db.promise().query(query, [
          holiday.holiday_date,
          holiday.title,
          holiday.description || null,
          holiday.holiday_type || 'national',
          holiday.is_optional ? 1 : 0,
          userId || null
        ]);
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({
          date: holiday.holiday_date,
          error: err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Created ${successCount} holidays, ${failCount} failed`,
      successCount,
      failCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating holidays:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating holidays',
      error: error.message
    });
  }
};

// ─── Update Holiday ─────────────────────────────────────────────────────
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { holiday_date, title, description, holiday_type, is_optional } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Holiday ID is required'
      });
    }

    const query = `
      UPDATE holiday_calendar
      SET 
        holiday_date = COALESCE(?, holiday_date),
        title = COALESCE(?, title),
        description = ?,
        holiday_type = COALESCE(?, holiday_type),
        is_optional = COALESCE(?, is_optional)
      WHERE id = ?
    `;
    
    const [result] = await db.promise().query(query, [
      holiday_date,
      title,
      description,
      holiday_type,
      is_optional !== undefined ? (is_optional ? 1 : 0) : null,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Holiday updated successfully'
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating holiday',
      error: error.message
    });
  }
};

// ─── Delete Holiday ─────────────────────────────────────────────────────
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Holiday ID is required'
      });
    }

    const query = `DELETE FROM holiday_calendar WHERE id = ?`;
    
    const [result] = await db.promise().query(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Holiday deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting holiday',
      error: error.message
    });
  }
};

// ─── Get Holiday Statistics ────────────────────────────────────────────
export const getHolidayStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        YEAR(holiday_date) as year,
        COUNT(*) as total,
        SUM(CASE WHEN holiday_type = 'national' THEN 1 ELSE 0 END) as national_count,
        SUM(CASE WHEN holiday_type = 'religious' THEN 1 ELSE 0 END) as religious_count,
        SUM(CASE WHEN holiday_type = 'school' THEN 1 ELSE 0 END) as school_count,
        SUM(CASE WHEN holiday_type = 'regional' THEN 1 ELSE 0 END) as regional_count,
        SUM(CASE WHEN is_optional = 1 THEN 1 ELSE 0 END) as optional_count
      FROM holiday_calendar
      GROUP BY YEAR(holiday_date)
      ORDER BY year DESC
    `;
    
    const [stats] = await db.promise().query(query);
    
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching holiday stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};
