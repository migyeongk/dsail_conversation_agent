// routes/session.js
// 세션 관리 관련 API
const express = require("express");
const crypto = require("crypto");
const Session = require("../models/Session");
const User = require("../models/User");
const Status = require("../models/Status");

module.exports = function () {
  const router = express.Router();

  // 한국 시간으로 변환하는 함수
  const getKoreaTime = () => {
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return koreaTime;
  };

  // 대화 시작 (세션 생성)
  router.post("/start", async (req, res) => {
    console.log("=== 세션 시작 요청 ===", new Date().toISOString());
    try {
      const greeting = "안녕하세요? 제 이름은 디제이, 정신건강 문진 대화를 위한 챗봇이에요 🩺 오늘 만나서 정말 반가워요 🙌 당신의 이름을 알려주실래요? 👀";
      const userId = req.headers['x-user-id'] || req.headers['X-User-ID'];
      const sessionId = req.headers['x-session-id'] || req.headers['X-Session-ID'];
      
      // 터미널에 받은 ID들 출력
      console.log("User_ID:", userId);
      console.log("Session_ID:", sessionId);

      // User 인스턴스 존재 여부 확인 및 생성
      let user = await User.findOne({ userId });
      if (!user) {
        user = await User.findOrCreate(userId, "UNKNOWN");
        console.log("새 User 객체 생성 완료:", user.userId);
      } else {
        console.log("기존 사용자 사용:", user.userId);
      }

      // Session 인스턴스 원자적 생성/조회 (중복 방지)
      const sessionData = {
        userId,
        sessionId,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip || req.socket.remoteAddress,
        messages: [{
          sender: "bot",
          text: greeting,
          timestamp: new Date()
        }],
        messageCount: 1,
        isActive: true,
        isFinished: false
      };

      // findOneAndUpdate with upsert 사용 (원자적 처리)
      const session = await Session.findOneAndUpdate(
        { userId, sessionId }, // 검색 조건
        { 
          $setOnInsert: sessionData, // 새로 생성할 때만 설정
          $set: { 
            lastActivity: new Date() // 항상 업데이트
          }
        },
        { 
          upsert: true, // 없으면 생성
          new: true,    // 업데이트된 문서 반환
          runValidators: true
        }
      );
      
      console.log("세션 처리 완료:", session.isNew ? "새로 생성" : "기존 사용");

      // Status 인스턴스 존재 여부 확인 및 생성 
      let status = await Status.findOne({ userId, sessionId });
      console.log("Status 존재 여부:", status ? "존재" : "없음");
      
      if (!status) {
        // findOrCreate 사용 - questions 배열 자동 초기화
        status = await Status.findOrCreate(userId, sessionId);
        console.log("새 Status 객체 생성 완료");
      }
            
      return res.json({ 
        response: greeting,  
        user_id: userId, 
        session_id: sessionId,
        message: {
          sender: "bot",
          text: greeting,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error("세션 시작 오류:", error);
      return res.status(500).json({ 
        error: "세션 시작 중 오류가 발생했습니다." 
      });
    }
  });

  // 세션 정보 조회
  router.get("/:userId/:sessionId", async (req, res) => {
    try {
      const { userId, sessionId } = req.params;
      
      const session = await Session.findOne({ userId, sessionId }).lean();
      
      if (!session) {
        return res.status(404).json({ error: "세션을 찾을 수 없습니다." });
      }
      
      // 필요한 정보만 반환
      const sessionInfo = {
        userId: session.userId,
        sessionId: session.sessionId,
        isActive: session.isActive,
        isFinished: session.isFinished || false,
        messageCount: session.messageCount || 0,
        totalDuration: session.totalDuration || 0,
        selectedPolicies: session.selectedPolicies || [],
        tonePreference: session.tonePreference || null,
        conversationStyle: session.conversationStyle || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastActivity: session.lastActivity
      };
      
      res.json(sessionInfo);
    } catch (error) {
      console.error("세션 정보 조회 실패:", error);
      res.status(500).json({ error: "세션 정보 조회 중 오류가 발생했습니다." });
    }
  });

  return router;
};
