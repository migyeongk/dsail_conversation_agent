const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// 로그 레벨별 색상 설정 (winston 내장)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'magenta',
  debug: 'green'
};

winston.addColors(colors);

// 커스텀 콘솔 포맷터 (winston 내장 색상 적용)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    let logMessage = `[${timestamp}] ${level}: ${message}`;
    if (stack) {
      logMessage += `\n${stack}`;
    }
    return logMessage;
  })
);

// 파일용 포맷터 (색상 미적용)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// 로그 폴더 생성
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 1. 콘솔 Transport
const consoleTransport = new winston.transports.Console({
  level: process.env.LOG_LEVEL || 'debug',
  format: consoleFormat
});

// 2. 일반 로그 파일용 Transport
const fileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '30d',
  level: 'info',
  format: fileFormat
});

// 3. 에러 로그용 Transport
const errorFileTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error', // 'error' 레벨 로그만 저장
  format: fileFormat
});

// 로거 인스턴스 생성
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug', // 로거의 최소 레벨
  transports: [
    consoleTransport,
    fileTransport,
    errorFileTransport
  ],
  exitOnError: false
});

module.exports = logger;