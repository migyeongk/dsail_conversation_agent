// routes/summary.js
// Summary 레포트 생성 관련 API
const express = require("express");
const logger = require("../config/logger");

module.exports = function () {
  const router = express.Router();

  router.get("/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    logger.info(`🚫 [SUMMARY] 비활성화된 요청 - User: ${userId}, Session: ${sessionId}`);
    return res.status(404).json({
      success: false,
      error: "키오스크 버전에서는 summary 기능을 사용하지 않습니다."
    });
  });

  router.post("/regenerate/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    logger.info(`🚫 [SUMMARY] 재생성 비활성화 요청 - User: ${userId}, Session: ${sessionId}`);
    return res.status(404).json({
      success: false,
      error: "키오스크 버전에서는 summary 기능을 사용하지 않습니다."
    });
  });

  router.delete("/cache/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    logger.info(`🚫 [SUMMARY] 캐시 삭제 비활성화 요청 - User: ${userId}, Session: ${sessionId}`);
    return res.status(404).json({
      success: false,
      error: "키오스크 버전에서는 summary 기능을 사용하지 않습니다."
    });
  });

  router.get("/status/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    logger.info(`🚫 [SUMMARY] 상태 확인 비활성화 요청 - User: ${userId}, Session: ${sessionId}`);
    return res.status(404).json({
      success: false,
      error: "키오스크 버전에서는 summary 기능을 사용하지 않습니다."
    });
  });

  return router;
};
