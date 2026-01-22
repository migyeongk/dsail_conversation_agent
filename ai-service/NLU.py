# NLU.py
import json
import os
import time
from logger_config import ai_logger, log_api_call, log_error


# INTENT_ANALYSIS_PROMPT = """
# 당신은 우울 및 불안에 대해 문진하는 정신의학 전문 인공지능 챗봇입니다.
# 이전 대화 내용을 바탕으로 현재 사용자의 발화의 의도를 파악해주세요.
# 같이 전달하는 직전 챗봇의 발화 정책을 참고하세요. 사용자의 현재 의도와 관련이 있을 수 있습니다. 

# 분석할 의도 유형:
# 1. "greeting": 인사 및 자기소개와 관련된 발화 
# 2. "answer_symptom": 사용자가 경험하는 증상의 유무에 대해 대답하는 발화 
#    - 증상의 존재, 경험, 느낌 등을 표현하는 모든 발화
#    - 예: "우울해", "잠을 못자요", "기분이 안 좋아요", "힘들어요" 등
# 3. "answer_frequency": 사용자가 경험하는 증상의 빈도에 대해 답변하는 발화 
#    - "거의 매일", "일주일에 몇 번", "가끔", "자주" 등 빈도 표현
# 4. "answer_condition": 사용자가 경험하는 증상의 조건이나 배경, 원인에 대해 서술하는 발화  
#    - "회사가 너무 바빠서", "시험 때문에", "가족 문제로" 등 조건 표현
# 5. "question": 사용자 측에서 궁금한 것에 대해 질문하는 발화 
#    - "우울증이 뭐예요?", "치료는 어떻게 해요?" 등
# 6. "request": 사용자가 챗봇에게 무언가를 요청하는 발화 
# 7. "off_topic": 주제 이탈과 관련된 발화 (날씨, 음식, 게임 등)
# 8. "modify_tone": 사용자가 대화 스타일이나 말투를 바꾸길 요청하는 발화 (예: 말투 바꿔줘, 다른 말투가 좋을 거 같아 등)
# 9. "modify_conversation_style": 사용자가 대화 스타일을 바꾸길 요청하는 발화 (예: 대화 스타일 바꾸고 싶어 등)
# 10. "answer_tone": 사용자가 지정 또는 변경하고 싶은 말투에 대해 답변하는 발화 
# 11. "answer_conversation_style": 사용자가 지정 또는 변경하고 싶은 대화 스타일에 대해 답변하는 발화
# 12. "other": 위에 나열되지 않은 기타 의도 유형 

# 주의사항:
# - 사용자의 발화가 위에 나열된 의도 유형 중 어떤 유형에 해당하는지 파악해주세요. 
# - answer_tone의 경우, 항상 "정중하고 다정한 말투" 또는 "이성적이고 전문적인 말투" 또는 "친구처럼 대화하는 말투" 중 하나가 선택됨. 그 외의 것은 "modify_tone" 또는 "others"와 연관 
# - answer_conversation_style의 경우, 항상 "심층적이고 구체적인 대화" 또는 "간결하고 신속한 대화" 중 하나가 선택됨. 그 외의 것은 "modify_conversation_style" 또는 "others"와 연관 
# - other 의도 유형의 경우 직접 어떤 유형인지 명시해주세요. 

# JSON 형태로 답변해주세요:
# {
#     "intent": "의도 유형"
# }
# """

INTENT_ANALYSIS_PROMPT = """
당신은 사용자의 마음 건강을 확인하는 인공지능 챗봇입니다.
이전 대화 내용을 바탕으로 현재 사용자의 발화의 의도를 파악해주세요.
같이 전달하는 직전 챗봇의 발화 정책을 참고하세요. 사용자의 현재 의도와 관련이 있을 수 있습니다. 

분석할 의도 유형:
1. "greeting": 인사 및 자기소개와 관련된 발화 
2. "answer_state": 사용자가 자신의 기분, 상태, 경험에 대해 대답하는 발화 
   - 기분, 수면, 피로, 취미 활동, 사회적 교류 등에 대한 모든 답변
   - 예: "기분이 좋아요", "요즘 잠을 못자요", "친구들이랑 자주 만나요", "취미 생활 하고 있어요" 등
3. "answer_context": 사용자가 자신의 상태나 경험의 배경, 이유, 상황에 대해 서술하는 발화  
   - "회사가 너무 바빠서", "시험 때문에", "요즘 프로젝트가 많아서", "날씨가 안 좋아서" 등
4. "question": 사용자 측에서 궁금한 것에 대해 질문하는 발화 
   - "스트레스 관리는 어떻게 해요?", "수면의 질을 높이려면?" 등
5. "request": 사용자가 챗봇에게 무언가를 요청하는 발화 
6. "off_topic": 주제 이탈과 관련된 발화 (날씨, 음식, 게임 등 대화 주제와 무관한 내용)
7. "other": 위에 나열되지 않은 기타 의도 유형 
8. "no_response": 사용자가 응답을 하지 않았거나 거부한 경우 (NO_RESPONSE로 입력됨)

주의사항:
- 사용자의 발화가 위에 나열된 의도 유형 중 어떤 유형에 해당하는지 파악해주세요. 
- other 의도 유형의 경우 직접 어떤 유형인지 명시해주세요. 

JSON 형태로 답변해주세요:
{
    "intent": "의도 유형"
}
"""


def analyze_intent(user_message, history, client, previous_policy):
    """ 사용자의 의도를 분석하는 함수 (3번 재시도 포함) """ 
    ai_logger.info("🔍 의도 분석 중...")
    
    # 마지막 챗봇 발화와 현재 사용자 메시지만 사용
    if history:
        context_text = f"이전 대화내역: {history}\n현재 사용자 메시지: {user_message}\n직전 챗봇 발화 정책: {previous_policy}"
    else:
        context_text = f"현재 사용자 메시지: {user_message}\n직전 챗봇 발화 정책: {previous_policy}"
    messages = [
        {"role": "system", "content": INTENT_ANALYSIS_PROMPT},
        {"role": "user", "content": context_text}]
    
    max_retries = 3
    retry_delay = 1  # 초
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                ai_logger.info(f"🔄 의도 분석 재시도 {attempt}/{max_retries}")
                time.sleep(retry_delay * attempt)  # 재시도 시 대기 시간 증가
            
            log_api_call("gpt-5-chat-latest", "intent_analysis", attempt + 1)
            response = client.chat.completions.create(
                model="gpt-5-chat-latest",
                messages=messages,
                max_tokens=50,
                temperature=0.5
            )
            
            result_text = response.choices[0].message.content.strip()
            intent_result = json.loads(result_text)
            ai_logger.info(f"✅ 의도 분석 완료: {intent_result}")
            ai_logger.info("----------------------------------------------------------")
            return intent_result
            
        except Exception as e:
            ai_logger.warning(f"⚠️ 의도 분석 시도 {attempt + 1} 실패: {str(e)}")
            if attempt == max_retries - 1:
                log_error("의도 분석 최종 실패", e)
                return {
                    "intent": "failed"
                }
            continue

def is_symptom_intent(intent):
    """
    의도가 symptom 관련인지 판단하는 함수
    
    Args:
        intent (str): 분석된 의도
        
    Returns:
        bool: symptom 관련 의도면 True, 아니면 False
    """
    symptom_intents = ["answer_symptom", "answer_frequency", "answer_condition", "answer_context", "answer_state"]
    return intent in symptom_intents



