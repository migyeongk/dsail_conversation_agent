// models/User.js
// 사용자 정보를 MongoDB에 저장하기 위한 Mongoose 모델 정의
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    trim: true
  },
  username: { 
    type: String, 
    required: true, 
    default: "UNKNOWN",
    trim: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  collection: 'users' // 컬렉션명 명시
});

// 인덱스 설정 (성능 최적화)
UserSchema.index({ userId: 1 }, { unique: true }); // userId 유니크 인덱스

// 정적 메서드: 사용자 ID로 사용자 찾기 또는 생성
UserSchema.statics.findOrCreate = async function(userId, username = "UNKNOWN") {
  let user = await this.findOne({ userId });
  
  if (!user) {
    user = new this({
      userId,
      username
    });
    await user.save();
  }
  
  return user;
};

module.exports = mongoose.model("User", UserSchema);
