# NLG.py - Natural Language Generation
import time
from logger_config import ai_logger, log_api_call, log_error
from prompts import (
    POLICY_PROMPTS_SINGLE,
    POLICY_MAX_TOKENS,
)

def generate_response(policy, user_message, history, status, client):
    """정책에 따라 응답을 생성하도록 요청하는 메인 함수"""
    ai_logger.info("🤖 응답 생성 중...")
    response = generate_response_by_policy(policy, user_message, history, status, client)
    return response


def generate_response_by_policy(policy, user_message, history, status, client):
    """통합된 응답 생성 함수 - 모든 정책에 대해 동일한 로직 사용"""
    ai_logger.info("🔍 한 개의 응답 정책을 조합하여 최종 응답을 생성")
    
    first_policy = policy.get('first_policy', 'default')
    ai_logger.info(f"🔍 선택된 정책: {first_policy}")
    
    prompt = POLICY_PROMPTS_SINGLE.get(first_policy, "others")
    question = check_question(policy)
    if question != None:
        context_history = f"선택된 정책: {policy}\n대화 히스토리:\n{history}\n현재 사용자 메시지: {user_message}\n현재 문진 상태: {status}\n선택된 문진문항: {question}"
    else:
        context_history = f"선택된 정책: {policy}\n대화 히스토리:\n{history}\n현재 사용자 메시지: {user_message}\n현재 문진 상태: {status}"

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": context_history}
    ]
    
    # 정책별 토큰 제한
    max_tokens = POLICY_MAX_TOKENS.get(first_policy,200)
    
    max_retries = 3
    retry_delay = 1  # 초
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                ai_logger.info(f"🔄 응답 생성 재시도 {attempt}/{max_retries}")
                time.sleep(retry_delay * attempt)  # 재시도 시 대기 시간 증가
            
            log_api_call("gpt-5-chat-latest", f"response_generation_{first_policy}", attempt + 1)
            # OpenAI API 호출
            response = client.chat.completions.create(
                model="gpt-5-chat-latest",
                messages=messages,
                max_tokens=max_tokens,
                temperature=1.0
            )
            
            generated_response = response.choices[0].message.content.strip()
            ai_logger.info(f"✅ 응답 생성 완료: {generated_response}")
            return generated_response
            
        except Exception as e:
            ai_logger.warning(f"⚠️ 응답 생성 시도 {attempt + 1} 실패: {str(e)}")
            if attempt == max_retries - 1:
                log_error("응답 생성 최종 실패", e)
                return "죄송합니다. 응답 생성 중 오류가 발생했습니다."
            continue


def check_question(policy):
    """정책 딕셔너리에서 question 를 추출하는 함수"""
    question = policy.get('next_question_text', None)
    ai_logger.info(f"🔍 선택된 문진문항: {question}")
    return question
