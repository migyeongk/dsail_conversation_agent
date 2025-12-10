const mongoose = require('mongoose');
require('dotenv').config();

async function checkDuplicates() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const Session = require('./models/Session');
    
    console.log('=== 중복 세션 검사 ===');
    
    // 모든 세션 조회
    const sessions = await Session.find({}).select('userId sessionId createdAt isFinished messageCount');
    
    console.log('총 세션 수:', sessions.length);
    
    // userId + sessionId 조합별로 그룹화
    const groupedSessions = {};
    sessions.forEach(session => {
      const key = session.userId + '_' + session.sessionId;
      if (!groupedSessions[key]) {
        groupedSessions[key] = [];
      }
      groupedSessions[key].push(session);
    });
    
    // 중복된 세션들 찾기
    const duplicates = Object.entries(groupedSessions).filter(([key, sessions]) => sessions.length > 1);
    
    console.log('중복된 세션 조합 수:', duplicates.length);
    
    if (duplicates.length > 0) {
      console.log('=== 중복 세션 상세 ===');
      duplicates.forEach(([key, sessions]) => {
        console.log(key + ': ' + sessions.length + '개');
        sessions.forEach((session, idx) => {
          console.log('  [' + (idx+1) + '] ID: ' + session._id + ', 생성: ' + session.createdAt + ', 완료: ' + session.isFinished + ', 메시지: ' + session.messageCount);
        });
      });
    } else {
      console.log('중복된 세션이 없습니다.');
    }
    
    // 최근 5개 세션 샘플 출력
    console.log('\n=== 최근 5개 세션 샘플 ===');
    const recentSessions = await Session.find({}).sort({createdAt: -1}).limit(5).select('userId sessionId isFinished messageCount createdAt');
    recentSessions.forEach((session, idx) => {
      console.log('[' + (idx+1) + '] ' + session.userId + '/' + session.sessionId + ' - 완료: ' + session.isFinished + ', 메시지: ' + session.messageCount + ', 생성: ' + session.createdAt);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('DB 연결 오류:', err);
    process.exit(1);
  }
}

checkDuplicates();
