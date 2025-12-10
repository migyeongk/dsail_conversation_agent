// routes/summary.js
// Summary 레포트 생성 관련 API
const express = require("express");
const axios = require("axios");
const logger = require("../config/logger");
const Session = require("../models/Session");
require("dotenv").config();

// AI 서비스 URL 환경변수
const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

module.exports = function () {
  const router = express.Router();

  // 한국 시간으로 변환하는 함수
  const getKoreaTime = () => {
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return koreaTime;
  };

  // Summary 레포트 생성 API (DB 캐싱 포함)
  router.get("/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    
    try {
      logger.info(`📊 [SUMMARY] 레포트 요청 - User: ${userId}, Session: ${sessionId}`);
      
      // 1. DB에서 세션 정보 조회
      const session = await Session.findOne({ userId, sessionId });
      
      if (!session) {
        logger.warn(`❌ [SUMMARY] 세션을 찾을 수 없음 - User: ${userId}, Session: ${sessionId}`);
        return res.status(404).json({
          success: false,
          error: "세션을 찾을 수 없습니다.",
          details: "존재하지 않는 세션입니다."
        });
      }
      
      // 2. 이미 summary가 있는지 확인 (캐시 확인)
      if (session.hasSummary()) {
        logger.info(`✅ [SUMMARY] 캐시된 레포트 반환 - User: ${userId}, Session: ${sessionId}`);
        const cachedSummary = session.getSummary();
        
        return res.status(200).json({
          success: true,
          data: {
            depression: cachedSummary.depression,
            anxiety: cachedSummary.anxiety,
            suggestion: cachedSummary.suggestion
          },
          user_id: userId,
          session_id: sessionId,
          generated_at: cachedSummary.generatedAt,
          from_cache: true
        });
      }
      
      // 3. 캐시된 summary가 없으면 AI 서비스에 요청
      logger.info(`🤖 [SUMMARY] AI 서비스로 새 레포트 생성 요청 - User: ${userId}, Session: ${sessionId}`);
      
      const aiServiceUrl = `${AI_SERVICE_URL}/api/summary/${userId}/${sessionId}`;
      
      const response = await axios.get(aiServiceUrl, {
        timeout: 30000, // 30초 타임아웃
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.status === 200 && response.data.success) {
        logger.info(`✅ [SUMMARY] AI 서비스에서 레포트 생성 성공 - User: ${userId}, Session: ${sessionId}`);
        
        // 4. 생성된 summary를 DB에 저장 (캐싱)
        const summaryData = response.data.data;
        if (summaryData && summaryData.depression && summaryData.anxiety && summaryData.suggestion) {
          try {
            await session.setSummary(summaryData);
            logger.info(`💾 [SUMMARY] DB에 레포트 캐시 저장 완료 - User: ${userId}, Session: ${sessionId}`);
          } catch (dbError) {
            logger.error(`❌ [SUMMARY] DB 저장 실패 (계속 진행) - User: ${userId}, Session: ${sessionId}`, dbError);
          }
        }
        
        // 5. 성공 응답
        res.status(200).json({
          success: true,
          data: summaryData,
          user_id: userId,
          session_id: sessionId,
          generated_at: new Date().toISOString(),
          from_cache: false
        });
        
      } else {
        logger.error(`❌ [SUMMARY] AI 서비스 응답 실패 - User: ${userId}, Session: ${sessionId}`);
        res.status(500).json({
          success: false,
          error: "레포트 생성에 실패했습니다.",
          details: response.data?.error || "Unknown error"
        });
      }
      
    } catch (error) {
      logger.error(`❌ [SUMMARY] 레포트 생성 오류 - User: ${userId}, Session: ${sessionId}`, error);
      
      // AI 서비스 연결 오류
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        res.status(503).json({
          success: false,
          error: "AI 서비스에 연결할 수 없습니다.",
          details: "서비스를 확인해주세요."
        });
      } 
      // 타임아웃 오류
      else if (error.code === 'ECONNABORTED') {
        res.status(504).json({
          success: false,
          error: "레포트 생성 시간이 초과되었습니다.",
          details: "잠시 후 다시 시도해주세요."
        });
      }
      // 기타 오류
      else {
        res.status(500).json({
          success: false,
          error: "서버 내부 오류가 발생했습니다.",
          details: error.message || "Unknown error"
        });
      }
    }
  });

  // Summary 레포트 강제 재생성 API
  router.post("/regenerate/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    
    try {
      logger.info(`🔄 [SUMMARY] 레포트 강제 재생성 요청 - User: ${userId}, Session: ${sessionId}`);
      
      // 1. DB에서 세션 정보 조회
      const session = await Session.findOne({ userId, sessionId });
      
      if (!session) {
        logger.warn(`❌ [SUMMARY] 세션을 찾을 수 없음 - User: ${userId}, Session: ${sessionId}`);
        return res.status(404).json({
          success: false,
          error: "세션을 찾을 수 없습니다."
        });
      }
      
      // 2. 기존 summary 삭제 (캐시 무효화)
      session.summary = undefined;
      await session.save();
      logger.info(`🗑️ [SUMMARY] 기존 캐시 삭제 완료 - User: ${userId}, Session: ${sessionId}`);
      
      // 3. AI 서비스에 새로운 summary 요청
      const aiServiceUrl = `${AI_SERVICE_URL}/api/summary/${userId}/${sessionId}`;
      
      const response = await axios.get(aiServiceUrl, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.status === 200 && response.data.success) {
        const summaryData = response.data.data;
        
        // 4. 새로운 summary를 DB에 저장
        if (summaryData && summaryData.depression && summaryData.anxiety && summaryData.suggestion) {
          await session.setSummary(summaryData);
          logger.info(`💾 [SUMMARY] 새 레포트 DB 저장 완료 - User: ${userId}, Session: ${sessionId}`);
        }
        
        res.status(200).json({
          success: true,
          data: summaryData,
          user_id: userId,
          session_id: sessionId,
          generated_at: new Date().toISOString(),
          regenerated: true
        });
        
      } else {
        res.status(500).json({
          success: false,
          error: "레포트 재생성에 실패했습니다."
        });
      }
      
    } catch (error) {
      logger.error(`❌ [SUMMARY] 레포트 재생성 오류 - User: ${userId}, Session: ${sessionId}`, error);
      res.status(500).json({
        success: false,
        error: "레포트 재생성 중 오류가 발생했습니다."
      });
    }
  });

  // Summary 캐시 삭제 API
  router.delete("/cache/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    
    try {
      logger.info(`🗑️ [SUMMARY] 캐시 삭제 요청 - User: ${userId}, Session: ${sessionId}`);
      
      const session = await Session.findOne({ userId, sessionId });
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "세션을 찾을 수 없습니다."
        });
      }
      
      // summary 필드 삭제
      session.summary = undefined;
      await session.save();
      
      logger.info(`✅ [SUMMARY] 캐시 삭제 완료 - User: ${userId}, Session: ${sessionId}`);
      
      res.status(200).json({
        success: true,
        message: "Summary 캐시가 삭제되었습니다.",
        user_id: userId,
        session_id: sessionId
      });
      
    } catch (error) {
      logger.error(`❌ [SUMMARY] 캐시 삭제 오류 - User: ${userId}, Session: ${sessionId}`, error);
      res.status(500).json({
        success: false,
        error: "캐시 삭제 중 오류가 발생했습니다."
      });
    }
  });

  // Summary 레포트 상태 확인 API
  router.get("/status/:userId/:sessionId", async (req, res) => {
    const { userId, sessionId } = req.params;
    
    try {
      logger.info(`📊 [SUMMARY] 상태 확인 - User: ${userId}, Session: ${sessionId}`);
      
      const session = await Session.findOne({ userId, sessionId });
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "세션을 찾을 수 없습니다."
        });
      }
      
      const hasSummary = session.hasSummary();
      const summary = session.getSummary();
      
      res.status(200).json({
        success: true,
        has_summary: hasSummary,
        summary_generated_at: summary?.generatedAt || null,
        user_id: userId,
        session_id: sessionId,
        timestamp: getKoreaTime().toISOString()
      });
      
    } catch (error) {
      logger.error(`❌ [SUMMARY] 상태 확인 오류`, error);
      res.status(500).json({
        success: false,
        error: "상태 확인 중 오류가 발생했습니다."
      });
    }
  });

  return router;
};
