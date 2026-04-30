// routes/agent.js
// 에이전트 대화 관련 API
const express = require("express");
const axios = require("axios");
const sessionMiddleware = require("../middleware/session");
const Status = require("../models/Status");
const Session = require("../models/Session");
const Chat = require("../models/Chat");
const logger = require("../config/logger");
require("dotenv").config();

// AI 서비스 URL 환경변수
const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const WINDOW_SIZE = parseInt(process.env.WINDOW_SIZE) || 10; // 기본값 10

module.exports = function () {
  const router = express.Router();  
  
  // 한국 시간으로 변환하는 함수
  const getKoreaTime = () => {
    const now = new Date();
    const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return koreaTime;
  };

  // 통합 대화 저장 함수 (백엔드에서 모든 저장 처리)
  const saveConversationTurn = async (userId, sessionId, userMessage, botResponse, metadata) => {
    try {
      const now = new Date();
      
      // 먼저 Session에서 이전 봇 메시지를 가져옴
      const session = await Session.findOne({ userId, sessionId });
      if (!session) {
        logger.warn(`⚠️ [WARN] Session을 찾을 수 없음: ${userId}/${sessionId}`);
        return { success: false, error: 'Session not found' };
      }
      
      // 현재 Session의 마지막 봇 메시지 찾기
      let previousBotQuestion = null;
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].sender === 'bot') {
          previousBotQuestion = session.messages[i].text;
          break;
        }
      }
      
      logger.info(`🔍 [PREVIOUS_BOT] 이전 봇 질문: "${previousBotQuestion || 'greeting'}"`);
      
      // 1. Chat 저장 (중복 방지 적용) - 봇 질문과 사용자 답변 쌍으로 저장
      const chatResult = await Chat.saveWithDuplicateCheck(
        userId,
        sessionId,
        previousBotQuestion || null,  // 봇 질문 (Session에서 가져온 이전 봇 발화)
        userMessage,                   // 사용자 답변 (현재 사용자 발화)
        metadata.responseTime || 0
      );
      
      if (chatResult.duplicate) {
        logger.info(`🔄 [DUPLICATE_PREVENTED] Chat 중복 저장 방지: ${userId}/${sessionId}`);
      } else {
        logger.info(`💾 [CHAT_SAVED] Chat 저장 완료: 봇질문 "${previousBotQuestion || 'greeting'}" → 사용자답변 "${userMessage}"`);
      }
      
      // 2. Session 메시지 저장 (중복 방지 적용)
      // 사용자 메시지 추가
      const userResult = await session.addMessageWithDuplicateCheck('user', userMessage);
      if (userResult.duplicate) {
        logger.info(`🔄 [DUPLICATE_PREVENTED] 사용자 메시지 중복 저장 방지: "${userMessage}"`);
      }
      
      // 봇 메시지 추가
      const botResult = await session.addMessageWithDuplicateCheck('bot', botResponse);
      if (botResult.duplicate) {
        logger.info(`🔄 [DUPLICATE_PREVENTED] 봇 메시지 중복 저장 방지: "${botResponse}"`);
      } else {
        logger.info(`💾 [SESSION_SAVED] Session 메시지 저장 완료: ${userId}/${sessionId}`);
      }
      
      // 3. 대화 종료 상태 업데이트
      if (metadata.finished && !session.isFinished) {
        await session.setFinished(true);
        logger.info(`🏁 [FINISHED] 대화 종료 상태 업데이트: ${userId}/${sessionId}`);
      }
      
      // 4. 활동 시간 업데이트
      await session.updateActivity();
      
      logger.info(`✅ [INTEGRATED_SAVE] 통합 저장 완료: ${userId}/${sessionId}`);
      return { success: true, chatSaved: !chatResult.duplicate };
      
    } catch (error) {
      logger.error(`❌ [INTEGRATED_SAVE] 통합 저장 실패: ${error.message}`);
      throw error;
    }
  };

  // 규칙 기반 응답 (테스트용)
  const ruleBaseResponses = {
    "자니?": "아니요? 저는 깨어 있어요!",
  };

  // 대화 상태를 조회하는 함수
  const getConversationStatus = async (userId, sessionId) => {
    try {
      logger.info(`📊 [STATUS] 상태 조회 시작: ${userId}, ${sessionId}`);
      // 최신 상태를 확실히 가져오기 위해 명시적으로 조회
      let status = await Status.findOne({ userId, sessionId }).exec();
      logger.info(`📊 [STATUS] DB 조회 결과: ${status ? '존재함' : '없음'}`);
      
      if (!status) {
        // 상태가 없으면 새로 생성
        logger.info(`📊 [STATUS] 새 상태 생성 중...`);
        status = await Status.findOrCreate(userId, sessionId);
        logger.info(`📊 [STATUS] 새로운 상태 생성 완료: ${userId}, ${sessionId}`);
      }
      
      // AI 서비스에 전달할 상태 정보 구성 (전체 question-answer 내용 포함)
      const statusInfo = {
        is_completed: status.isCompleted,
        recent_context_summary: status.recentContextSummary || "",
        no_response_retry_question: status.noResponseRetryQuestion || null,
        no_response_retry_count: status.noResponseRetryCount || 0,
        last_answered_question: status.lastAnsweredQuestion,
        last_asked_question: status.lastAskedQuestion,
        questions: status.questions.map(q => ({
          questionId: q.questionId,
          questionText: q.questionText,
          experience: q.experience,
          status: q.status,
          rawUserInput: q.rawUserInput,
          detail: q.detail || [],
          updated: q.updated || false
        }))
      };
      
      logger.info(`📊 [STATUS] DB에서 조회한 isCompleted: ${status.isCompleted}`);
      logger.info(`📊 [STATUS] AI 서비스로 전송할 상태 정보: is_completed=${statusInfo.is_completed}`);
      return statusInfo;
      
    } catch (error) {
      logger.error("❌ 대화 상태 조회 실패:", error.message);
      // 기본값 반환
      return {
        total_score: 0,
        is_completed: false,
        recent_context_summary: "",
        no_response_retry_question: null,
        no_response_retry_count: 0,
        answered_count: 0,
        completion_rate: 0,
        last_answered_question: null,
        last_asked_question: null,
        questions: []
      };
    }
  };

  // 모든 세션 데이터를 한 번에 조회하는 통합 함수
  const getSessionData = async (userId, sessionId) => {
    try {
      const session = await Session.findOne({ userId, sessionId }).lean();
      
      if (!session) {
        logger.info(`🆕 [SESSION] 새 세션: ${userId}/${sessionId}`);
        return {
          historyText: "",
          messageCount: 0,
          lastBotMessage: null,
          isFinished: false
        };
      }
      
      // 메시지 데이터 처리
      const messages = session.messages || [];
      let processedMessages = messages;
      
      // WINDOW_SIZE에 따른 제한
      if (WINDOW_SIZE !== -1 && WINDOW_SIZE > 0 && messages.length > 0) {
        processedMessages = messages.slice(-WINDOW_SIZE * 2);
      }
      
      // 히스토리 텍스트 생성
      const historyText = processedMessages
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(msg => `${msg.sender === 'bot' ? 'Bot' : 'User'}: ${msg.text}`)
        .join('\n');
      
      // 마지막 챗봇 발화 찾기
      let lastBotMessage = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].sender === 'bot') {
          lastBotMessage = messages[i].text;
          break;
        }
      }
      
      const result = {
        historyText,
        messageCount: session.messageCount || 0,
        lastBotMessage,
        isFinished: session.isFinished || false
      };
      
      logger.info(`📊 [SESSION_DATA] 메시지: ${result.messageCount}개, 히스토리: ${processedMessages.length}개 메시지`);
      if (lastBotMessage) {
        logger.info(`🤖 [LAST_BOT] "${lastBotMessage}"`);
      }
      
      return result;
    } catch (error) {
      logger.error("❌ 세션 데이터 조회 실패:", error.message);
        return {
          historyText: "",
          messageCount: 0,
          lastBotMessage: null,
          isFinished: false
        };
    }
  };





  
  // 일반 에이전트 대화
  router.post("/", sessionMiddleware, async (req, res) => {
    const { message: userMessage } = req.body;
    const { id: userId, sessionId } = req.user;
    
    logger.info(`👤 [USER] 사용자 입력: "${userMessage}" (${userMessage ? userMessage.length : 0}자)`);

    if (!userMessage) {
      logger.warn("[ERROR] 빈 메시지 요청");
      return res.status(400).json({ error: "No message provided" });
    }

    // 규칙 기반 응답 수행 
    const ruleResponse = ruleBaseResponses[userMessage];
    if (ruleResponse) {
      logger.info(`⚡ [RULE] 규칙 기반 응답: "${ruleResponse}"`);
      return res.json({ 
        response: ruleResponse,
        finished: false,
        first_policy: null,
        timestamp: getKoreaTime()
      });
    }

    // 기본 대화 에이전트 
    try {
      // 모든 세션 데이터 한 번에 조회
      const sessionData = await getSessionData(userId, sessionId);
      const statusInfo = await getConversationStatus(userId, sessionId);

      // 세션이 이미 종료된 경우 종료 메시지 반환
      if (sessionData.isFinished) {
        logger.info(`🔒 [FINISHED] 이미 종료된 세션: ${userId}/${sessionId}`);
        return res.json({
          response: "죄송합니다. 이 대화는 이미 종료되었습니다.",
          finished: true
        });
      }

      // AI 서비스로 전송할 데이터 준비
      const aiRequestData = {
        message: userMessage,
        user_id: userId,
        session_id: sessionId,
        timestamp: Date.now(),
        history: sessionData.historyText,
        last_bot_message: sessionData.lastBotMessage,
        status: statusInfo,
        messageCount: sessionData.messageCount
      };
      
      // AI 서비스 요청 상세 정보 로깅
      logger.info(`🤖 [CALL] URL=${AI_SERVICE_URL}/api/chat, 사용자ID=${userId}, 세션ID=${sessionId}`);
      logger.info(`👤 [USER]: "${userMessage}"`);
      
      // Flask에 현재 메시지, 히스토리와 새로운 데이터 전송
      const botResponse = await axios.post(`${AI_SERVICE_URL}/api/chat`, aiRequestData);
    
      const { 
        response: chatbotReply, 
        updated_slots: updatedSlots, 
        intent: intentAnalysis, 
        first_policy,
        recent_context_summary,
        no_response_retry_question,
        no_response_retry_count,
        is_completed, 
        is_finished,
        last_asked_question,
        last_asked_question_text,
        last_answered_question
      } = botResponse.data;

      logger.info(`🤖 [BOT]: "${chatbotReply}" (${chatbotReply ? chatbotReply.length : 0}자)`);
      logger.info(`🎯 [INTENT]: ${intentAnalysis ? intentAnalysis.intent : null}`);
      logger.info(`🎯 [IS_COMPLETED]: ${is_completed}`);
      logger.info(`🎯 [IS_FINISHED]: ${is_finished}`);
      logger.info(`🎯 [LAST_ASKED_QUESTION]: ${last_asked_question}`);
      logger.info(`🎯 [LAST_ASKED_QUESTION_TEXT]: ${last_asked_question_text}`);
      logger.info(`🎯 [LAST_ANSWERED_QUESTION]: ${last_answered_question}`);
      // 통합 저장 처리 (Chat + Session 메시지 + 정책 + 상태)
      try {
        const startTime = req.timestamp || Date.now();
        const responseTime = Date.now() - startTime;
        
        // 이전 봇 응답 찾기
        const previousBotResponse = sessionData.lastBotMessage;
        
        await saveConversationTurn(userId, sessionId, userMessage, chatbotReply, {
          previousBotResponse,
          responseTime,
          first_policy,
          finished: is_finished
        });
        
        logger.info(`💾 [INTEGRATED_SAVE] 모든 저장 완료: ${userId}/${sessionId}`);
      } catch (saveError) {
        logger.error("❌ 통합 저장 실패:", saveError.message);
        // 저장 실패해도 AI 응답은 반환 (사용자 경험 우선)
      }
      
      // 상태 정보를 DB에 반영
      try {
        const status = await Status.findOne({ userId, sessionId }).exec();
        if (status) {
          let hasChanges = false;
          
          // updated_slots가 있을 때만 문항 업데이트 처리
          if (updatedSlots && Array.isArray(updatedSlots) && updatedSlots.length > 0) {
            // updated_slots의 변경된 문항들만 처리
            for (const slot of updatedSlots) {
              if (slot.updated === true) {
                const questionId = slot.questionId;
                const existingQuestion = status.questions.find(q => q.questionId === questionId);
                
                if (existingQuestion) {
                  // 변경사항 체크
                  const fieldsToUpdate = ['experience', 'status', 'rawUserInput', 'detail'];
                  let questionChanged = false;
                  
                  for (const field of fieldsToUpdate) {
                    if (slot[field] !== undefined && existingQuestion[field] !== slot[field]) {
                      existingQuestion[field] = slot[field];
                      questionChanged = true;
                    }
                  }
                  
                  if (questionChanged) {
                    existingQuestion.updated = true;
                    hasChanges = true;
                    logger.info(`🔄 [SLOTS] ${questionId} 업데이트: ${JSON.stringify(slot)}`);
                  }
                }
              }
            }
          }
          
          // last_asked_question과 last_answered_question 업데이트
          if (last_asked_question && status.lastAskedQuestion !== last_asked_question) {
            status.lastAskedQuestion = last_asked_question;
            hasChanges = true;
            logger.info(`📝 [STATUS] Last Asked Question: ${last_asked_question}`);
          }
          
          if (last_answered_question && status.lastAnsweredQuestion !== last_answered_question) {
            status.lastAnsweredQuestion = last_answered_question;
            hasChanges = true;
            logger.info(`✅ [STATUS] Last Answered Question: ${last_answered_question}`);
          }

          if (
            recent_context_summary !== undefined &&
            status.recentContextSummary !== recent_context_summary
          ) {
            status.recentContextSummary = recent_context_summary || "";
            hasChanges = true;
            logger.info(`🧭 [STATUS] Recent Context Summary 업데이트: ${status.recentContextSummary}`);
          }

          if (
            no_response_retry_question !== undefined &&
            status.noResponseRetryQuestion !== no_response_retry_question
          ) {
            status.noResponseRetryQuestion = no_response_retry_question;
            hasChanges = true;
            logger.info(`🔁 [STATUS] noResponseRetryQuestion 업데이트: ${status.noResponseRetryQuestion}`);
          }

          if (
            no_response_retry_count !== undefined &&
            status.noResponseRetryCount !== no_response_retry_count
          ) {
            status.noResponseRetryCount = no_response_retry_count;
            hasChanges = true;
            logger.info(`🔁 [STATUS] noResponseRetryCount 업데이트: ${status.noResponseRetryCount}`);
          }
          
          // is_completed 상태 업데이트 
          if (is_completed !== undefined && status.isCompleted !== is_completed) {
            logger.info(`🔄 [STATUS] isCompleted 변경: ${status.isCompleted} → ${is_completed}`);
            status.isCompleted = is_completed;
            if (is_completed && !status.completedAt) {
              status.completedAt = new Date();
            }
            hasChanges = true;
            logger.info(`🎯 [STATUS] Completion Status 업데이트 완료: ${is_completed}`);
          } else if (is_completed !== undefined) {
            logger.info(`⚡ [STATUS] isCompleted 변경 없음: 현재=${status.isCompleted}, 받은값=${is_completed}`);
          }
          
          // 변경사항이 있을 때만 저장
          if (hasChanges) {
            await status.save();
            logger.info(`💾 [DB] Status 업데이트 완료: ${userId}, ${sessionId}`);
          } else {
            logger.info(`⚡ [DB] 변경사항 없음 - DB 저장 생략`);
          }
        }
      } catch (statusError) {
        logger.error("❌ 상태 업데이트 실패:", statusError.message);
      }
      
      
      logger.info(`✅ [SUCCESS] 대화 처리 성공 - 응답시간: ${Date.now() - req.timestamp}ms`);
      
      return res.json({
        response: chatbotReply,
        finished: is_finished, // 프론트엔드에서 사용할 종료 상태
        first_policy: first_policy,
        timestamp: getKoreaTime()
      });

    } catch (error) {
      logger.error("❌ [ERROR] AI 서비스 통신 실패:", error.message);
      return res.status(500).json({ error: "에이전트 모델로부터 응답을 받지 못했습니다." });
    }
  });


  return router;
};
