const logger = require("./config/logger");//Winston 로거
const express = require("express");
const axios = require("axios");//외부 API서버에 HTTP요청 보내기 위한 라이브러리
const cors = require("cors");//다른 도메인에서 요청할 수 있게 해주는 middleware
const mongoose = require("mongoose");//MongoDB, Node.js를 연결해주는 ODM라이브러리  
const dotenv = require("dotenv");//dotenv는 env파일에 저장된 환경변수를 node.js에서 사용할 수 있게 해줌
const crypto = require("crypto");//crypto:Node.js에 내장된 모듈로 보안관련 기능을 제공

//환경 변수 로드
const app = express();//express앱 객체 생성.객체를 통해서 라우팅,middleware설정
dotenv.config();//env파일에 있는 변수들을 process.env객체에 불러오는 역할을 불러옴
app.use(express.json());//요청의 body가 JSON형태면 자동으로 파싱해서 req.body에 넣어줌
const PORT = process.env.SERVER_PORT;//포트 설정. env에 정의된 포트 불러와서 저장 

// CORS 옵션 설정 - 외부 클라이언트 접근 허용
const corsOptions = {
  origin: true, // 모든 도메인에서 접근 허용
  methods: "GET,POST,PATCH,DELETE,OPTIONS",//HTTP메서드만 허용
  allowedHeaders: [
    "Content-Type", 
    "X-User-ID",
    "X-Session-ID",
  ], //헤더 명시적 허용 (대소문자 모두)
  credentials: true //쿠키 허용
};
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));//CORS옵션을 Express앱에 등록
app.use(express.json()); //middleware는 들어오는 요청의 body가 app/json이면 자동으로 json객체로 parsing해서 req.body에 넣음


// 요청 로깅 미들웨어: 모든 요청을 한국 시간으로 로깅 (요청 시간, 메서드, URL 기록)
app.use((req, res, next) => { 
  req.timestamp = Date.now(); // 응답시간 계산을 위한 타임스탬프 저장
  logger.http(`🌐 [HTTP] ${req.method} ${req.url} - IP: ${req.ip || req.socket.remoteAddress}`);
  next();
});

// MongoDB 연결
mongoose
  .connect(process.env.MONGO_URI, { //env파일에 정의된 MONGO_URI 사용 & 연결 옵션도 설정
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    logger.info("🗄️ [DB] MongoDB 연결 성공");
  })
  .catch((err) => {
    logger.error("❌ [ERROR] MongoDB 연결 실패:", err);
    process.exit(1);
  });//연결 실패 시 에러 출력하고, 서버 종료


//라우트 가져오기
logger.debug("🔧 [INIT] 라우터 등록 시작"); 
const sessionMiddleware = require("./middleware/session"); //세션 기반 인증 미들웨어
const historyRoutes=require("./routes/history")();//대화기록 관련 API라우트 불러옴
const sessionRoutes = require("./routes/session")();
const agentRoutes = require("./routes/agent")();
const stateRoutes = require("./routes/state")();//상태 추적 관련 API라우트 불러옴
const deleteRoutes = require("./routes/delete")();//삭제 관련 API라우트 불러옴
const summaryRoutes = require("./routes/summary")();//Summary 레포트 관련 API라우트 불러옴
const errorReportRoutes = require("./routes/errorReport");//에러 리포트 관련 API라우트 불러옴

app.use("/api/session", sessionRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/state", stateRoutes);
app.use("/api/delete", deleteRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/error-report", errorReportRoutes);

//기본 라우트 (접속 Testing)
app.get("/", (req, res) => {
  res.send("백엔드 서버가 정상적으로 작동 중입니다.");
});

//서버 시작
app.listen(PORT, '0.0.0.0', () => { //설정된 포트에서 서버 시작하고 성공메세지 출력
  logger.info(`🚀 [SERVER] 서버가 포트 ${PORT}에서 실행 중입니다.`);
});


