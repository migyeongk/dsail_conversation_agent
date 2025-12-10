// backend/models/Chat.js
const mongoose = require("mongoose");

// 대화 쌍 단위로 저장하는 Chat 스키마
// "봇 질문 → 사용자 답변" 쌍으로 저장됩니다
const ChatSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  bot_question: {
    type: String,
    required: false, // 첫 번째 대화에서는 봇 질문이 없을 수 있음 (greeting)
    trim: true
  },
  user_answer: {
    type: String,
    required: true,
    trim: true
  },
  response_time: {
    type: Number, // 밀리초 단위
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { 
  timestamps: true,
  collection: 'chats'
});

// 인덱스 설정 (성능 최적화)
ChatSchema.index({ userId: 1, sessionId: 1, timestamp: -1 });
ChatSchema.index({ sessionId: 1, timestamp: -1 });

// 가상 필드: 응답 시간 (초 단위)
ChatSchema.virtual('responseTimeSeconds').get(function() {
  return (this.response_time / 1000).toFixed(2);
});

// 정적 메서드: 중복 저장 방지를 위한 Chat 저장
// Chat는 "봇 질문 → 사용자 답변" 쌍으로 저장됩니다
ChatSchema.statics.saveWithDuplicateCheck = async function(userId, sessionId, botQuestion, userAnswer, responseTime) {
  try {
    // 1. 직전 Chat 레코드 조회
    const lastChat = await this.findOne({ userId, sessionId })
      .sort({ timestamp: -1 })
      .lean();
    
    // 2. 중복 체크 (내용 + 시간 간격)
    const isDuplicate = lastChat && 
      lastChat.bot_question === botQuestion && 
      lastChat.user_answer === userAnswer &&
      (Date.now() - new Date(lastChat.timestamp).getTime()) < 10000; // 10초 이내
    
    if (isDuplicate) {
      console.log(`🔄 [DUPLICATE_PREVENTED] Chat 중복 저장 방지: ${userId}/${sessionId}`);
      return { 
        message: "중복 저장 방지됨", 
        saved: false, 
        duplicate: true,
        lastChatId: lastChat._id
      };
    }
    
    // 3. 새로운 Chat 저장
    const chat = new this({
      userId, 
      sessionId, 
      bot_question: botQuestion,    // 봇 질문이 먼저
      user_answer: userAnswer,      // 사용자 답변이 나중
      response_time: responseTime
    });
    
    await chat.save();
    console.log(`💾 [CHAT_SAVED] 새로운 대화 저장: ${userId}/${sessionId}`);
    return { 
      message: "대화 저장 완료", 
      saved: true, 
      duplicate: false,
      chatId: chat._id 
    };
    
  } catch (error) {
    console.error("❌ Chat 저장 실패:", error.message);
    throw error;
  }
};

module.exports = mongoose.model("Chat", ChatSchema);
