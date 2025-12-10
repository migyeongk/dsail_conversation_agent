// models/Session.js
//세션 정보를 mongoDB에 저장하기 위한 Mongoose모델 정의
const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
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
  // 세션별 메타데이터
  userAgent: { type: String },
  ipAddress: { type: String },
  // 세션 상태
  isActive: { type: Boolean, default: true },
  isFinished: { type: Boolean, default: false }, // 대화 종료 여부
  lastActivity: { type: Date, default: Date.now },
  // 대화 통계
  messageCount: { type: Number, default: 0 },
  totalDuration: { type: Number, default: 0 }, // 초 단위
  // AI 정책 선택 이력
  selectedPolicies: { 
    type: [String], 
    default: [] 
  },
  // 사용자 선호 설정
  tonePreference: {
    type: String,
    enum: ['정중하지만 다정한 말투', '이성적이고 전문적인 말투', '친구처럼 대화하는 말투', '미선택'],
    default: '미선택'
  },
  conversationStyle: {
    type: String,
    enum: ['심층적이고 구체적인 대화', '간결하고 신속한 대화', '미선택'],
    default: '미선택'
  },
  // 대화 내용
  messages: [{
    sender: {
      type: String,
      enum: ["user", "bot"],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Summary 관련 필드
  summary: {
    depression: { type: String }, // 우울상태 분석
    anxiety: { type: String },    // 불안상태 분석
    suggestion: { type: String }, // 제안사항
    generatedAt: { type: Date },  // 생성 시간
    version: { type: String, default: "1.0" } // Summary 버전 (추후 업데이트 시 사용)
  }
}, { 
  timestamps: true,
  collection: 'sessions' // 컬렉션명 명시
});

// 인덱스 설정 (성능 최적화)
SessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true }); // 복합 유니크 인덱스
SessionSchema.index({ lastActivity: -1 });
SessionSchema.index({ isActive: 1, lastActivity: -1 });

// 가상 필드: 세션 지속 시간 (분)
SessionSchema.virtual('durationMinutes').get(function() {
  return Math.floor(this.totalDuration / 60);
});

// 가상 필드: 대화 ID (AI 서비스 통신용)
SessionSchema.virtual('conversationId').get(function() {
  return `conv_${this.userId}_${this.sessionId}`;
});

// 인스턴스 메서드: 세션 갱신 및 대화 시간 업데이트
SessionSchema.methods.updateActivity = function() {
  const now = new Date();
  
  // 대화 시간 계산 (현재 시간 - 생성 시간)
  if (this.createdAt) {
    this.totalDuration = Math.floor((now - this.createdAt) / 1000); // 초 단위
  }
  
  this.lastActivity = now;
  return this.save();
};

// 인스턴스 메서드: 메시지 추가
SessionSchema.methods.addMessage = function(sender, text) {
  const now = new Date();
  
  this.messages.push({
    sender,
    text,
    timestamp: now
  });
  this.messageCount = this.messages.length;
  this.lastActivity = now;
  
  // 대화 시간 업데이트 (현재 시간 - 생성 시간)
  if (this.createdAt) {
    this.totalDuration = Math.floor((now - this.createdAt) / 1000); // 초 단위
  }
  
  return this.save();
};

// 인스턴스 메서드: 중복 저장 방지를 위한 메시지 추가
SessionSchema.methods.addMessageWithDuplicateCheck = function(sender, text) {
  const now = new Date();
  
  // 마지막 메시지와 동일한지 체크
  const lastMessage = this.messages[this.messages.length - 1];
  
  const isDuplicate = lastMessage && 
    lastMessage.sender === sender && 
    lastMessage.text === text &&
    (now.getTime() - new Date(lastMessage.timestamp).getTime()) < 5000; // 5초 이내
  
  if (isDuplicate) {
    console.log(`🔄 [DUPLICATE_PREVENTED] Session 메시지 중복 저장 방지: ${this.userId}/${this.sessionId}`);
    return Promise.resolve({
      message: "중복 저장 방지됨",
      saved: false,
      duplicate: true,
      session: this
    });
  }
  
  // 새로운 메시지 추가
  this.messages.push({
    sender,
    text,
    timestamp: now
  });
  this.messageCount = this.messages.length;
  this.lastActivity = now;
  
  // 대화 시간 업데이트 (현재 시간 - 생성 시간)
  if (this.createdAt) {
    this.totalDuration = Math.floor((now - this.createdAt) / 1000); // 초 단위
  }
  
  return this.save().then(() => ({
    message: "메시지 저장 완료",
    saved: true,
    duplicate: false,
    session: this
  }));
};

// 인스턴스 메서드: 메시지 조회
SessionSchema.methods.getMessages = function() {
  return this.messages.sort((a, b) => a.timestamp - b.timestamp);
};

// 인스턴스 메서드: 선택된 정책 추가
SessionSchema.methods.addSelectedPolicies = function(policies) {
  if (!Array.isArray(policies)) {
    policies = [policies];
  }
  
  // 중복 허용하여 추가
  this.selectedPolicies = [...this.selectedPolicies, ...policies];
  
  return this.save();
};

// 인스턴스 메서드: 선택된 정책 조회
SessionSchema.methods.getSelectedPolicies = function() {
  return this.selectedPolicies;
};

// 인스턴스 메서드: 대화 종료 상태 업데이트
SessionSchema.methods.setFinished = function(finished = true) {
  this.isFinished = finished;
  if (finished) {
    this.isActive = false; // 종료되면 비활성화
  }
  return this.save();
};

// 인스턴스 메서드: 말투 선호 설정 업데이트
SessionSchema.methods.setTonePreference = function(tonePreference) {
  this.tonePreference = tonePreference;
  return this.save();
};

// 인스턴스 메서드: 대화 스타일 선호 설정 업데이트
SessionSchema.methods.setConversationStyle = function(conversationStyle) {
  this.conversationStyle = conversationStyle;
  return this.save();
};

// 인스턴스 메서드: 사용자 선호 설정 조회
SessionSchema.methods.getUserPreferences = function() {
  return {
    tonePreference: this.tonePreference,
    conversationStyle: this.conversationStyle
  };
};

// 인스턴스 메서드: Summary 저장
SessionSchema.methods.setSummary = function(summaryData) {
  this.summary = {
    depression: summaryData.depression,
    anxiety: summaryData.anxiety,
    suggestion: summaryData.suggestion,
    generatedAt: new Date(),
    version: summaryData.version || "1.0"
  };
  return this.save();
};

// 인스턴스 메서드: Summary 조회
SessionSchema.methods.getSummary = function() {
  return this.summary;
};

// 인스턴스 메서드: Summary 존재 여부 확인
SessionSchema.methods.hasSummary = function() {
  return !!(this.summary && this.summary.depression && this.summary.anxiety && this.summary.suggestion);
};

// 정적 메서드: 비활성 세션 정리
SessionSchema.statics.cleanupInactiveSessions = function(inactiveMinutes = 60) {
  const cutoffTime = new Date(Date.now() - inactiveMinutes * 60 * 1000);
  return this.updateMany(
    { 
      lastActivity: { $lt: cutoffTime },
      isActive: true 
    },
    { isActive: false }
  );
};

module.exports = mongoose.model("Session", SessionSchema);
