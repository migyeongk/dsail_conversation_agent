# 우울 및 불안 문진을 위한 대화 에이전트

## 프로젝트 구조

```
.
├── api-server/      # 백엔드 서버
│   └── models/      # DB 스키마 정의
└── ai-service/      # AI 서비스 (OpenAI GPT 연동)
```

## 환경 설정

### 1. api-server 설정

`api-server/.env` 파일을 생성하고 다음 항목 작성:

```dotenv
# API 서버 설정
SERVER_PORT=                # 백엔드 서버 포트 번호 (예: 3003)
FRONTEND_URL=               # 연결된 프론트엔드 URL (예: http://localhost:3000)
MONGO_URI=                  # MongoDB 연결 URL (예: mongodb://localhost:27017/sanjabu)
AI_SERVICE_URL=             # AI 서비스 URL (예: http://localhost:5002)
WINDOW_SIZE=                # 대화 히스토리 참조 범위 (-1: 전체 참조)
```

### 2. ai-service 설정

`ai-service/.env` 파일을 생성하고 다음 항목 작성:

```dotenv
# AI 서비스 설정
AI_SERVICE_PORT=            # AI 서비스 포트 번호 (예: 5002)
API_SERVER_URL=             # 백엔드 서버 URL (예: http://localhost:3003)
MONGO_URI=                  # MongoDB 연결 URL (예: mongodb://localhost:27017/sanjabu)
OPENAI_API_KEY=             # OpenAI API 키 (별도 안내 예정)
```

## 데이터베이스 스키마

데이터베이스 스키마는 `api-server/models/` 폴더에 정의되어 있음:

- `User.js` - 사용자 정보
- `Session.js` - 대화 세션
- `Chat.js` - 대화 내용
- `Status.js` - 상태 정보



## 설치 및 실행

### 설치

```bash
# api-server 설치
cd api-server
npm install

# ai-service 설치
cd ../ai-service
pip install -r requirements.txt
```

### 실행

```bash
# MongoDB 확인 (보통 백그라운드에서 자동 실행됨)
# 만약 실행되지 않았다면: mongod

# 터미널 1: API 서버 실행
cd api-server
node server.js

# 터미널 2: AI 서비스 실행
cd ai-service
python run_chatbot.py
```

## 주의사항
- MongoDB가 실행 중이어야 서비스가 정상 작동합니다. 
- OpenAI API Key는 별도로 전달드릴 예정입니다. 
- 프론트엔드 코드는 포함하지 않았습니다. 

