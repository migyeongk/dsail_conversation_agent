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
  
  // 문항 수집 상태 (Q1~Q10)
  questions: [{
    questionId: {
      type: String,
      required: true,
      enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"]
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
      enum: ["unanswered", "checking", "asking", "conflict", "answered"],
      default: "unanswered"
    },
    rawUserInput: {
      type: [String],
      default: []
    },
    frequency: {
      type: String,
      default: null
    },
    context:{
      type: String,
      default: null
    },
    note:{
      type: String,
      default: null
    },
    conflict: {
      type: String,
      default: null
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
  lastAnsweredQuestion: {
    type: String,
    default: null,
    enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", null]
  },
  lastAskedQuestion: {
    type: String,
    default: null,
    enum: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", null]
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
    
    // 전체 점수 재계산
    this.totalScore = this.questions
      .filter(q => q.score !== null)
      .reduce((sum, q) => sum + q.score, 0);
    
    // 완료 상태 확인
    this.isCompleted = this.questions.every(q => q.status === 'answered');
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
      { questionId: "Q1", questionText: "최근 스트레스를 받거나 나를 힘들게 하는 일이 있다" },
      { questionId: "Q2", questionText: "기분이 가라앉거나, 우울하거나, 희망이 없다고 느낀다" },
      { questionId: "Q3", questionText: "평소 하던 일에 대한 흥미가 없어지거나 즐거움을 느끼지 못한다" },
      { questionId: "Q4", questionText: "잠들기가 어렵거나 자주 깨거나 혹은 평소와 다르게 너무 많이 잔다" },
      { questionId: "Q5", questionText: "최근 매사에 피곤하고 기운이 없다" },
      { questionId: "Q6", questionText: "내가 무언가를 잘못했거나 실패했다는 생각이 들거나 자신과 가족을 실망시켰다고 생각한다." },
      { questionId: "Q7", questionText: "차라리 죽는 것이 더 낫겠다거나 혹은 자해할 생각을 한다" },
      { questionId: "Q8", questionText: "초조하거나, 마음이 불안하거나, 혹시 나쁜 일이 생길까 조마조마한 느낌을 받는다" },
      { questionId: "Q9", questionText: "최근 여러 가지 일에 대해 너무 많은 걱정을 한다" },
      { questionId: "Q10", questionText: "걱정이 한 번 시작되면 쉽게 멈추거나 조절하기 어렵다" }
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
