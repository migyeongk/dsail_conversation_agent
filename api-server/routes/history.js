// backend/routes/history.js
const express = require("express");//웹 프레임워크
const Session = require("../models/Session");//세션 및 대화 데이터 저장하는 Mongoose모델
const Chat = require("../models/Chat");//대화 쌍 저장하는 Mongoose모델
const sessionMiddleware = require("../middleware/session");//세션 기반 인증 미들웨어
const logger = require("../config/logger");

module.exports = function () {
  const router = express.Router();//세션 기반 인증으로 변경

  // 사용자별 대화 목록 조회
  router.get("/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      
      // 해당 사용자의 모든 세션 조회 (최신순으로 정렬)
      const sessions = await Session.find({ userId })
        .sort({ createdAt: -1 })
        .select('sessionId createdAt updatedAt messageCount isActive isFinished')
        .lean();
      
      const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0);
      const activeSessions = sessions.filter(s => s.isActive).length;
      
      logger.info(`📊 [STATS] 사용자 ${userId} 대화목록 조회 성공: ${sessions.length}개 세션, 총 ${totalMessages}개 메시지, 활성 ${activeSessions}개`);
      
      // 대화 목록 반환
      res.json(sessions);
    } catch (err) {
      logger.error("❌ 대화 목록 조회 실패:", err.message);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // 대화내역 불러오기(userId, sessionId로 특정 대화 조회)
  router.get("/:userId/:sessionId", async (req, res) => {
    try {
      const { userId, sessionId } = req.params;
      
      const session = await Session.findOne({ userId, sessionId });
      
      if (!session) {
        logger.info(`🆕 [SESSION] 새 세션 시작: ${userId}/${sessionId}`);
        // 대화 내역이 없으면 빈 세션 객체 반환 (첫 인사말 표시용)
        return res.json({
          conversationId: `conv_${userId}_${sessionId}`,
          messages: [],
          messageCount: 0,
          isActive: true
        });
      } else {
        logger.info(`📂 [LOAD] 대화내역 로드 성공: ${session.messageCount}개 메시지, 활성상태: ${session.isActive}`);
        return res.json(session);
      }
    } catch (err) {
      logger.error("❌ 대화내역 로드 실패:", err.message);
      res.status(500).send("서버 오류");
    }
  });

  // 이전 봇 응답 + 사용자 현재 발화 저장 (중복 방지 적용)
  // 주의: 이 엔드포인트는 현재 사용되지 않음. 백엔드 통합 저장으로 대체됨
  router.post("/save/chat", sessionMiddleware, async (req, res) => {
    logger.warn("⚠️ [DEPRECATED] /save/chat 엔드포인트 호출됨 - 백엔드 통합 저장으로 대체됨");
    return res.status(410).json({ 
      message: "이 엔드포인트는 더 이상 사용되지 않습니다. 백엔드에서 자동으로 저장됩니다.",
      deprecated: true
    });
  });

  // 현재 봇 응답을 세션에 업데이트 (중복 방지 적용)
  // 주의: 이 엔드포인트는 현재 사용되지 않음. 백엔드 통합 저장으로 대체됨
  router.post("/save/session", sessionMiddleware, async (req, res) => {
    logger.warn("⚠️ [DEPRECATED] /save/session 엔드포인트 호출됨 - 백엔드 통합 저장으로 대체됨");
    return res.status(410).json({ 
      message: "이 엔드포인트는 더 이상 사용되지 않습니다. 백엔드에서 자동으로 저장됩니다.",
      deprecated: true
    });
  });


  return router;
};
