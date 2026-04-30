// models/Status.js
// 문항 상태를 MongoDB에 저장하기 위한 Mongoose 모델 정의
const mongoose = require("mongoose");

const StatusSchema = new mongoose.Schema({
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
  
  // 문항 수집 상태
  questions: [{
    questionId: {
      type: String,
      required: true,
      enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]
    },
    questionText: {
      type: String,
      required: true
    },
    experience: {
      type: String,
      enum: ["yes", "no", "unknown"],
      default: "unknown"
    },
    status: {
      type: String,
      enum: ["unanswered", "answered", "skipped"],
      default: "unanswered"
    },
    rawUserInput: {
      type: [String],
      default: []
    },
    detail: {
      type: [String],
      default: []
    },
    updated: {
      type: Boolean,
      default: false
    }
  }],
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  recentContextSummary: {
    type: String,
    default: "",
    trim: true
  },
  noResponseRetryQuestion: {
    type: String,
    default: null,
    enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", null]
  },
  noResponseRetryCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  lastAnsweredQuestion: {
    type: String,
    default: null,
    enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", null]
  },
  lastAskedQuestion: {
    type: String,
    default: null,
    enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", null]
  }
}, { 
  timestamps: true,
  collection: 'statuses', // 컬렉션명 명시
  toJSON: { virtuals: true }, // JSON 직렬화 시 가상 필드 포함
  toObject: { virtuals: true } // Object 변환 시 가상 필드 포함
});

// 인덱스 설정 (성능 최적화)
StatusSchema.index({ userId: 1, sessionId: 1 }, { unique: true }); // userId + sessionId 조합 유니크 인덱스
StatusSchema.index({ userId: 1, isCompleted: 1 });

// 가상 필드: 답변 완료된 문항 수
StatusSchema.virtual('answeredCount').get(function() {
  return this.questions.filter(q => q.status === 'answered').length;
});

// 가상 필드: 전체 문항 수
StatusSchema.virtual('totalQuestions').get(function() {
  return this.questions.length;
});

// 가상 필드: 완료율
StatusSchema.virtual('completionRate').get(function() {
  return this.totalQuestions > 0 ? (this.answeredCount / this.totalQuestions) * 100 : 0;
});

// 가상 필드: 대화 ID (AI 서비스 통신용)
StatusSchema.virtual('conversationId').get(function() {
  return `conv_${this.userId}_${this.sessionId}`;
});

// 인스턴스 메서드: 특정 문항 업데이트
StatusSchema.methods.updateQuestion = function(questionId, updateData) {
  const question = this.questions.find(q => q.questionId === questionId);
  if (question) {
    Object.assign(question, updateData);
    question.updated = true; // 업데이트 플래그 설정
    
    // 답변된 경우 lastAnsweredQuestion 업데이트
    if (updateData.status === 'answered') {
      this.lastAnsweredQuestion = questionId;
    }
    
    // 완료 상태 확인
    this.isCompleted = this.questions.every(
      q => q.status === "answered" || q.status === "skipped"
    );
    if (this.isCompleted && !this.completedAt) {
      this.completedAt = new Date();
    }
  }
  return this.save();
};

// 인스턴스 메서드: 답변된 문항들만 조회
StatusSchema.methods.getAnsweredQuestions = function() {
  return this.questions.filter(q => q.status === 'answered');
};

// 인스턴스 메서드: 답변되지 않은 문항들만 조회
StatusSchema.methods.getUnansweredQuestions = function() {
  return this.questions.filter(q => q.status === 'unanswered');
};

// 인스턴스 메서드: 마지막에 물어본 질문 업데이트
StatusSchema.methods.updateLastAskedQuestion = function(questionId) {
  this.lastAskedQuestion = questionId;
  return this.save();
};

// 인스턴스 메서드: updated 플래그 리셋
StatusSchema.methods.resetUpdatedFlags = function() {
  this.questions.forEach(q => {
    q.updated = false;
  });
  return this.save();
};

// 정적 메서드: 대화별 상태 찾기 또는 생성
StatusSchema.statics.findOrCreate = async function(userId, sessionId) {
  let status = await this.findOne({ userId, sessionId });

  if (!status) {
    const questions = [
      { questionId: "Q1", questionText: "이유 없이 너무 피곤하거나 힘이 쭉 빠질 때" },
      { questionId: "Q2", questionText: "마음이 불안하거나 예민해질 때" },
      { questionId: "Q3", questionText: "가만히 있기 어렵고 계속 조급할 때" },
      { questionId: "Q4", questionText: "많이 우울해서 다른 걸 해도 기분이 안 나아질 때" },
      { questionId: "Q5", questionText: "해야 할 일들이 너무 버겁게 느껴질 때" },
      { questionId: "Q6", questionText: "내가 초라하거나 쓸모없게 느껴질 때" },
    ];

    status = new this({
      userId,
      sessionId,
      questions
    });
    await status.save();
  }
  
  return status;
};

// 정적 메서드: 사용자별 완료된 상태 조회
StatusSchema.statics.findCompletedByUser = function(userId) {
  return this.find({ userId, isCompleted: true }).sort({ completedAt: -1 });
};

// 정적 메서드: 대화별 상태 조회
StatusSchema.statics.findByConversation = function(userId, sessionId) {
  return this.findOne({ userId, sessionId });
};

module.exports = mongoose.model("Status", StatusSchema);
