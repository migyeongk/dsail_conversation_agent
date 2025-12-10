// routes/delete.js
// 모든 삭제 관련 API를 통합 관리 및 로그 중앙화
const express = require("express");
const Session = require("../models/Session");
const Chat = require("../models/Chat");
const Status = require("../models/Status");

// 삭제 로그 헬퍼 함수
const logDelete = (operation, details) => {
  console.log(`🗑️ [DELETE] ${operation}:`, details);
};

const logDeleteSuccess = (operation, result) => {
  console.log(`✅ [DELETE SUCCESS] ${operation}:`, result);
};

const logDeleteError = (operation, error) => {
  console.error(`❌ [DELETE ERROR] ${operation}:`, error.message);
};

module.exports = function () {
  const router = express.Router();

  // ==================== 대화만 삭제 ====================
  
  // 대화만 삭제 (여러 세션) - 더 구체적인 라우트를 먼저 배치
  router.delete("/conversation/batch/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const { sessionIds } = req.body;
      
      logDelete("대화만 삭제 (일괄)", { userId, sessionIds });
      
      if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ message: "sessionIds 배열이 필요합니다." });
      }
      
      // Session 일괄 삭제
      const sessionResult = await Session.deleteMany({ 
        userId, 
        sessionId: { $in: sessionIds } 
      });
      logDelete("Session 일괄 삭제", sessionResult);
      
      // Chat 일괄 삭제
      const chatResult = await Chat.deleteMany({ 
        userId, 
        sessionId: { $in: sessionIds } 
      });
      logDelete("Chat 일괄 삭제", chatResult);
      
      const result = {
        message: `선택된 대화들이 삭제되었습니다. (세션: ${sessionResult.deletedCount}개, 채팅: ${chatResult.deletedCount}개)`,
        deletedSessions: sessionResult.deletedCount,
        deletedChats: chatResult.deletedCount
      };
      
      logDeleteSuccess("대화만 삭제 (일괄)", result);
      res.json(result);
    } catch (err) {
      logDeleteError("대화만 삭제 (일괄)", err);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // 대화만 삭제 (단일 세션) - 더 구체적인 라우트 뒤에 배치
  router.delete("/conversation/:userId/:sessionId", async (req, res) => {
    try {
      const { userId, sessionId } = req.params;
      
      logDelete("대화만 삭제 (단일)", { userId, sessionId });
      
      // Session 삭제
      const sessionResult = await Session.deleteOne({ userId, sessionId });
      logDelete("Session 삭제", sessionResult);
      
      // Chat 삭제
      const chatResult = await Chat.deleteMany({ userId, sessionId });
      logDelete("Chat 삭제", chatResult);
      
      const result = {
        message: `대화가 삭제되었습니다. (세션: ${sessionResult.deletedCount}개, 채팅: ${chatResult.deletedCount}개)`,
        deletedSessions: sessionResult.deletedCount,
        deletedChats: chatResult.deletedCount
      };
      
      logDeleteSuccess("대화만 삭제 (단일)", result);
      res.json(result);
    } catch (err) {
      logDeleteError("대화만 삭제 (단일)", err);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // ==================== 상태만 삭제 ====================
  
  // 상태만 삭제 (여러 세션) - 더 구체적인 라우트를 먼저 배치
  router.delete("/status/batch/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const { sessionIds } = req.body;
      
      logDelete("상태만 삭제 (일괄)", { userId, sessionIds });
      
      if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ message: "sessionIds 배열이 필요합니다." });
      }
      
      // Status 일괄 삭제
      const statusResult = await Status.deleteMany({ 
        userId,
        sessionId: { $in: sessionIds } 
      });
      logDelete("Status 일괄 삭제", statusResult);
      
      const result = {
        message: `선택된 상태들이 삭제되었습니다. (${statusResult.deletedCount}개)`,
        deletedStatuses: statusResult.deletedCount
      };
      
      logDeleteSuccess("상태만 삭제 (일괄)", result);
      res.json(result);
    } catch (err) {
      logDeleteError("상태만 삭제 (일괄)", err);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // 상태만 삭제 (단일 세션) - 더 구체적인 라우트 뒤에 배치
  router.delete("/status/:userId/:sessionId", async (req, res) => {
    try {
      const { userId, sessionId } = req.params;
      
      logDelete("상태만 삭제 (단일)", { userId, sessionId });
      
      // Status 삭제
      const statusResult = await Status.deleteOne({ userId, sessionId });
      logDelete("Status 삭제", statusResult);
      
      const result = {
        message: `상태가 삭제되었습니다. (${statusResult.deletedCount}개)`,
        deletedStatuses: statusResult.deletedCount
      };
      
      logDeleteSuccess("상태만 삭제 (단일)", result);
      res.json(result);
    } catch (err) {
      logDeleteError("상태만 삭제 (단일)", err);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  return router;
};