import {
  countStudentUnreadNotifications,
  listStudentNotifications,
  markStudentNotificationRead,
  registerStudentPushToken,
} from "../services/studentNotificationService.js";

export const registerPushToken = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { push_token, platform, device_id } = req.body || {};

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!push_token) {
      return res.status(400).json({ success: false, message: "push_token is required" });
    }

    const token = await registerStudentPushToken({
      studentId,
      pushToken: push_token,
      platform,
      deviceId: device_id,
    });

    return res.json({
      success: true,
      message: "Push token saved successfully.",
      token,
    });
  } catch (error) {
    console.error("Register push token error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save push token",
    });
  }
};

export const getMyNotifications = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const limit = Number(req.query.limit || 25);
    const offset = Number(req.query.offset || 0);

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { notifications, hasMore } = await listStudentNotifications({
      studentId,
      limit,
      offset,
    });

    const unreadCount = await countStudentUnreadNotifications(studentId);

    return res.json({
      success: true,
      notifications,
      unread_count: unreadCount,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
        next_offset: offset + notifications.length,
      },
    });
  } catch (error) {
    console.error("Get my notifications error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load notifications",
    });
  }
};

export const readNotification = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const { notificationId } = req.params;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const notification = await markStudentNotificationRead({
      studentId,
      notificationId,
    });

    return res.json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Read notification error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update notification",
    });
  }
};
