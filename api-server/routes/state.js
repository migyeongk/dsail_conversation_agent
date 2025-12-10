// routes/state.js
// 상태 추적 관련 API
const express = require("express");
const Status = require("../models/Status");
const Session = require("../models/Session");
const sessionMiddleware = require("../middleware/session");

module.exports = function () {
  const router = express.Router();

  // 사용자별 상태 목록 조회 (Navbar State 버튼용)
  router.get("/:userId", async (req, res) => {
    console.log("사용자별 상태 목록 조회 요청:", req.params);
    try {
      const { userId } = req.params;
      
      // 해당 사용자의 모든 상태들 조회 (최신순으로 정렬)
      const statuses = await Status.find({ userId })
        .sort({ updatedAt: -1 })
        .select('sessionId createdAt updatedAt isCompleted completedAt lastAnsweredQuestion lastAskedQuestion questions');
      
      // 각 상태에 해당하는 세션 정보도 가져오기
      const enrichedStatuses = await Promise.all(
        statuses.map(async (status) => {
          try {
            const session = await Session.findOne({ 
              userId, 
              sessionId: status.sessionId 
            }).select('messageCount totalDuration isActive lastActivity').lean();
            
            // 가상 필드를 명시적으로 계산
            const answeredCount = status.questions.filter(q => q.status === 'answered').length;
            const totalQuestions = status.questions.length;
            const completionRate = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
            
            return {
              ...status.toObject({ virtuals: true }),
              answeredCount,
              totalQuestions,
              completionRate,
              session: session || null
            };
          } catch (err) {
            console.error(`세션 정보 조회 실패 (${status.sessionId}):`, err.message);
            
            // 가상 필드를 명시적으로 계산 (세션 정보 없는 경우)
            const answeredCount = status.questions.filter(q => q.status === 'answered').length;
            const totalQuestions = status.questions.length;
            const completionRate = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
            
            return {
              ...status.toObject({ virtuals: true }),
              answeredCount,
              totalQuestions,
              completionRate,
              session: null
            };
          }
        })
      );
      
      console.log(`=== 사용자 ${userId}의 상태 목록 조회 결과 ===`);
      console.log(`조회된 상태 수: ${enrichedStatuses.length}개`);
      enrichedStatuses.forEach((s, index) => {
        console.log(`상태 ${index + 1}:`, s);
      });
      
      // 상태 목록 반환
      res.json(enrichedStatuses);
    } catch (err) {
      console.error("사용자별 상태 목록 조회 오류:", err.message);
      res.status(500).json({ message: "서버 오류" });
    }
  });

  // 특정 대화의 상태 조회 (Chat 상태 추적 버튼용)
  router.get("/:userId/:sessionId", async (req, res) => {
    console.log("대화 상태 조회 요청:", req.params);
    try {
      const { userId, sessionId } = req.params;
      
      // findOrCreate 사용 - 상태가 없으면 자동으로 초기화
      const status = await Status.findOrCreate(userId, sessionId);
      
      // 해당 세션 정보도 함께 가져오기
      try {
        const session = await Session.findOne({ 
          userId, 
          sessionId 
        }).select('messageCount totalDuration isActive lastActivity createdAt updatedAt').lean();
        
        // 가상 필드를 명시적으로 계산
        const answeredCount = status.questions.filter(q => q.status === 'answered').length;
        const totalQuestions = status.questions.length;
        const completionRate = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
        
        console.log("=== answeredCount 계산 디버깅 ===");
        console.log("전체 questions:", status.questions.length);
        console.log("answered 상태인 questions:", status.questions.filter(q => q.status === 'answered'));
        console.log("계산된 answeredCount:", answeredCount);
        
        const enrichedStatus = {
          ...status.toObject({ virtuals: true }),
          answeredCount,
          totalQuestions,
          completionRate,
          session: session || null
        };
        
        console.log("대화 상태 조회 성공:", enrichedStatus);
        return res.json(enrichedStatus);
      } catch (sessionErr) {
        console.error("세션 정보 조회 실패:", sessionErr.message);
        // 가상 필드를 명시적으로 계산 (세션 정보 없는 경우)
        const answeredCount = status.questions.filter(q => q.status === 'answered').length;
        const totalQuestions = status.questions.length;
        const completionRate = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
        
        console.log("대화 상태 조회 성공 (세션 정보 없음):", status);
        return res.json({
          ...status.toObject({ virtuals: true }),
          answeredCount,
          totalQuestions,
          completionRate,
          session: null
        });
      }
    } catch (err) {
      console.error("대화 상태 조회 오류:", err.message);
      res.status(500).send("서버 오류");
    }
  });

  // 상태 업데이트 (AI 서비스에서 호출)
  router.post("/update", sessionMiddleware, async (req, res) => {
    try {
      const { questionId, updateData } = req.body;
      const { id: userId, sessionId } = req.user;
      
      console.log("상태 업데이트 요청:", { 
        questionId, 
        updateData, 
        userId, 
        sessionId 
      });
      
      if (!questionId || !updateData) {
        return res.status(400).json({ 
          message: "questionId, updateData are required" 
        });
      }

      // 상태 찾기 또는 생성
      let status = await Status.findOne({ userId, sessionId });
      if (!status) {
        status = await Status.findOrCreate(userId, sessionId);
      }

      // 특정 문항 업데이트
      await status.updateQuestion(questionId, updateData);
      
      console.log("상태 업데이트 성공:", status);

      res.json({ 
        message: "상태가 업데이트되었습니다.",
        status: status
      });
    } catch (err) {
      console.error("상태 업데이트 오류:", err.message);
      res.status(500).send("서버 오류");
    }
  });

  // 상태 저장 (대화 완료 시)
  router.post("/save", sessionMiddleware, async (req, res) => {
    try {
      const { finalData } = req.body;
      const { id: userId, sessionId } = req.user;
      
      console.log("상태 저장 요청:", { 
        finalData, 
        userId, 
        sessionId 
      });

      // 상태 찾기 또는 생성
      let status = await Status.findOne({ userId, sessionId });
      if (!status) {
        status = await Status.findOrCreate(userId, sessionId);
      }

      // 최종 데이터로 업데이트
      if (finalData && finalData.questions) {
        for (const question of finalData.questions) {
          await status.updateQuestion(question.questionId, question);
        }
      }

      // 완료 상태로 설정
      status.isCompleted = true;
      status.completedAt = new Date();
      await status.save();
      
      console.log("상태 저장 성공:", status);

      res.json({ 
        message: "상태가 저장되었습니다.",
        status: status
      });
    } catch (err) {
      console.error("상태 저장 오류:", err.message);
      res.status(500).send("서버 오류");
    }
  });


  return router;
};
