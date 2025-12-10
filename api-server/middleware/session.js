// session.js - 신뢰 가능한 클라이언트용 세션 인증
module.exports = function (req, res, next) {
  // 요청 헤더에서 회원아이디와 세션아이디 추출
  const userId = req.header('X-User-ID');
  const sessionId = req.header('X-Session-ID');
  
  // 필수 값 검증
  if (!userId || !sessionId) {
    return res.status(400).json({ 
      message: "회원아이디와 세션아이디가 필요합니다.",
      required: ["X-User-ID", "X-Session-ID"]
    });
  }
  
  // 간단한 형식 검증
  if (typeof userId !== 'string' || typeof sessionId !== 'string') {
    return res.status(400).json({ 
      message: "회원아이디와 세션아이디는 문자열이어야 합니다." 
    });
  }
  
  // 기본적인 길이 검증 (보안 강화)
  if (userId.length < 3 || userId.length > 50 || sessionId.length < 10) {
    return res.status(400).json({ 
      message: "유효하지 않은 ID 형식입니다." 
    });
  }
  
  // req 객체에 사용자 정보 저장
  req.user = {
    id: userId,
    sessionId: sessionId,
    ip: req.ip || req.connection.remoteAddress
  };
  
  // 로깅
  console.log(`[${new Date().toISOString()}] Trusted Client - User: ${userId}, Session: ${sessionId}, IP: ${req.user.ip}`);
  
  next();
};
