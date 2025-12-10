const express = require("express");
const logger = require("../config/logger");
const mongoose = require("mongoose");

// 에러 리포트 스키마 정의
const errorReportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  sessionId: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'in_progress', 'resolved'], default: 'pending' }
});

const ErrorReport = mongoose.model('ErrorReport', errorReportSchema);

const router = express.Router();

// 에러 리포트 제출 API
router.post("/", async (req, res) => {
  try {
    const { message, userId, sessionId, timestamp } = req.body;
    
    // 입력 검증
    if (!message || !userId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: "필수 필드가 누락되었습니다."
      });
    }

    // 에러 리포트 저장
    const errorReport = new ErrorReport({
      userId,
      sessionId,
      message: message.trim(),
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await errorReport.save();

    logger.info(`🗳️ [FEEDBACK] 새로운 의견 제출됨 - User: ${userId}, Session: ${sessionId}, Content: ${message.substring(0, 50)}...`);

    res.json({
      success: true,
      message: "소중한 의견이 성공적으로 제출되었습니다.",
      reportId: errorReport._id
    });

  } catch (error) {
    logger.error("❌ [ERROR_REPORT] 에러 리포트 제출 실패:", error);
    res.status(500).json({
      success: false,
      error: "에러 리포트 제출 중 오류가 발생했습니다."
    });
  }
});


// 에러 리포트 목록 조회 (관리자용)
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    const reports = await ErrorReport.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await ErrorReport.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
    
  } catch (error) {
    logger.error("❌ [ERROR_REPORT] 에러 리포트 목록 조회 실패:", error);
    res.status(500).json({
      success: false,
      error: "에러 리포트 목록 조회 중 오류가 발생했습니다."
    });
  }
});

// 에러 리포트 상태 업데이트 (관리자용)
router.patch("/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status } = req.body;
    
    if (!status || !['pending', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "유효하지 않은 상태입니다."
      });
    }
    
    const report = await ErrorReport.findByIdAndUpdate(
      reportId,
      { status },
      { new: true }
    );
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: "에러 리포트를 찾을 수 없습니다."
      });
    }
    
    res.json({
      success: true,
      message: "에러 리포트 상태가 업데이트되었습니다.",
      data: report
    });
    
  } catch (error) {
    logger.error("❌ [ERROR_REPORT] 에러 리포트 상태 업데이트 실패:", error);
    res.status(500).json({
      success: false,
      error: "에러 리포트 상태 업데이트 중 오류가 발생했습니다."
    });
  }
});

// 에러 리포트 삭제 (관리자용)
router.delete("/:reportId", async (req, res) => {
  try {
    const { reportId } = req.params;
    
    const report = await ErrorReport.findByIdAndDelete(reportId);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: "에러 리포트를 찾을 수 없습니다."
      });
    }
    
    logger.info(`🗑️ [FEEDBACK] 의견 삭제됨 - ID: ${reportId}, User: ${report.userId}`);
    
    res.json({
      success: true,
      message: "에러 리포트가 삭제되었습니다."
    });
    
  } catch (error) {
    logger.error("❌ [ERROR_REPORT] 에러 리포트 삭제 실패:", error);
    res.status(500).json({
      success: false,
      error: "에러 리포트 삭제 중 오류가 발생했습니다."
    });
  }
});

module.exports = router;
