import express from 'express';
import {
  getAllHolidays,
  getHolidaysByYear,
  getHolidaysInRange,
  checkIsHoliday,
  createHoliday,
  bulkCreateHolidays,
  updateHoliday,
  deleteHoliday,
  getHolidayStats
} from '../controllers/holiday.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// ─── Public Routes (Read-only) ───────────────────────────────────────────
router.get('/', getAllHolidays);
router.get('/year/:year', getHolidaysByYear);
router.get('/range', getHolidaysInRange);
router.get('/check/:date', checkIsHoliday);
router.get('/stats', getHolidayStats);

// ─── Protected Routes (Requires Authentication) ──────────────────────────
router.post('/', authenticateToken, createHoliday);
router.post('/bulk', authenticateToken, bulkCreateHolidays);
router.put('/:id', authenticateToken, updateHoliday);
router.delete('/:id', authenticateToken, deleteHoliday);

export default router;
