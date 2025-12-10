# logger_config.py - AI 서비스용 로깅 설정
import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler

def setup_logger(name='ai_service', log_level=logging.INFO):
    """
    AI 서비스용 로거 설정 함수
    
    Args:
        name (str): 로거 이름
        log_level: 로깅 레벨
        
    Returns:
        logging.Logger: 설정된 로거 객체
    """
    
    # 로그 디렉토리 생성
    log_dir = os.path.join(os.path.dirname(__file__), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    # 로거 생성
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # 이미 핸들러가 있으면 제거 (중복 방지)
    if logger.handlers:
        logger.handlers.clear()
    
    # 포맷터 설정
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # 콘솔 핸들러 (기존 print 출력 유지)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # 파일 핸들러 (log.txt에 저장)
    log_file = os.path.join(log_dir, 'log.txt')
    file_handler = RotatingFileHandler(
        log_file, 
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # 일별 로그 파일 (추가적으로)
    daily_log_file = os.path.join(log_dir, f"ai-service-{datetime.now().strftime('%Y-%m-%d')}.log")
    daily_handler = RotatingFileHandler(
        daily_log_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=3,
        encoding='utf-8'
    )
    daily_handler.setLevel(log_level)
    daily_handler.setFormatter(formatter)
    logger.addHandler(daily_handler)
    
    return logger

# 전역 로거 인스턴스
ai_logger = setup_logger()

def log_api_request(user_id, session_id, message, timestamp):
    """API 요청 로깅"""
    ai_logger.info(f"API_REQUEST | User: {user_id} | Session: {session_id} | Timestamp: {timestamp} | Message: {message}")

def log_error(error_msg, exception=None):
    """에러 로깅"""
    if exception:
        ai_logger.error(f"ERROR | {error_msg} | Exception: {str(exception)}")
    else:
        ai_logger.error(f"ERROR | {error_msg}")

def log_api_call(model, prompt_type, attempt=1, tokens_used=None):
    """GPT API 호출 로깅"""
    attempt_info = f" | Attempt: {attempt}" if attempt > 1 else ""
    if tokens_used:
        ai_logger.info(f"GPT_API_CALL | Model: {model} | Type: {prompt_type}{attempt_info} | Tokens: {tokens_used}")
    else:
        ai_logger.info(f"GPT_API_CALL | Model: {model} | Type: {prompt_type}{attempt_info}")
