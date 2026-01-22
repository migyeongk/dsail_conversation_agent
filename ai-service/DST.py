# DST.py (Dialogue State Tracking)
import json
import copy
import time
from logger_config import ai_logger, log_api_call, log_error

# 증상 분석 프롬프트 (Chain-of-Thought 방식)
# SYMPTOM_ANALYSIS_PROMPT = """
# 당신은 신중한 정신의학 전문가입니다. 
# 챗봇의 직전 질문과 사용자의 현재 발화를 분석하여 주어진 문진표 내의 우울 및 불안 관련 증상을 추출하고 업데이트해주세요.

# 현재 문항 상태:
# {questions_info}

# INSTRUCTIONS:
# 1. 현재 사용자 발화에서 증상 관련 표현을 찾으세요
# 2. 각 증상이 우울 및 불안의 증상으로 명확한지 판단하세요
# 3. 아래 데이터 구조에 맞게 정보를 업데이트하고 반환하세요
# 4. rawUserInput에 챗봇의 발화의 내용을 포함하지 마세요

# DATA STRUCTURE:
# - questionId: 해당 문항 ID (Q1~Q10)
# - questionText: 실제 문항 텍스트 
# - experience: 사용자가 해당 증상을 경험하고 있는지 여부 ("yes", "no", "unknown")
#     - yes: 사용자가 해당 증상을 경험하고 있다고 명확히 언급했을 때 
#     - no: 사용자가 명확히 해당 증상을 경험하지 않는다고 표현했을 때
#     - unknown: 관련 언급이 없거나 모호한 경우 
# - status: 답변 완료 상태 ("unanswered", "checking", "asking", "conflict", "answered") 
#     - unanswered: 관련 언급이 전혀 없는 상태
#     - checking: 관련 언급은 있지만 애매하여 추가 확인이 필요한 상태
#     - asking: 사용자가 증상을 경험하고 있다고 답하여 증상의 빈도나 맥락에 대해 추가로 질문해야 하는 상태 
#     - answered: 증상의 유무 및 빈도나 맥락에 대한 명확하고 구체적인 답변이 완료된 상태
#     - conflict: 이전에 수집된 문항과 상충되거나 모순이 있는 경우 
# - rawUserInput: 증상과 관련된 사용자 발화들을 저장한 리스트 (업데이트 할 내용이 있다면, 기존 내역에 새로운 요소 추가하여 리스트 업데이트)
# - frequency: 사용자 발화로부터 해당 증상 발생 빈도에 대한 내용 추출 (명확한 빈도가 아니라면 추출하지 마세요)
# - condition: 사용자 발화로부터 해당 증상 발생과 관련된 조건, 이유 등에 대한 내용 추출 (예: "회사가 너무 바빠서", "시험 때문에", "가족 문제로")
# - note: 사용자 발화로부터 해당 증상과 관련된 일반적인 노트나 추가 정보 추출 (예: "사용자의 응답 내용", "추가 설명", "관련 정보"), 
# - updated: 이번 시점에 업데이트 되었는지 여부 (true/false)

# CAUTION:
# 1. 해당 증상의 경험유무(experience)에 대한 언급은 있으나 명확하지 않은 경우 status를 "checking"으로 설정하여 추가 확인이 필요함을 표시하세요
# 2. 사용자가 해당 증상을 경험하고 있다고 답하여 추가적인 맥락이나 빈도에 대한 질문이 필요한 경우 status를 "asking"으로 설정하세요
# 3. 사용자가 해당 증상을 경험하고 있으며, 해당 증상에 대한 추가적인 맥락 또는 빈도에 대한 답변이 수집된 경우 status를 "answered"로 설정하세요. 
# 4. 사용자의 현재 발화에서 문진 항목 내 증상이 관찰되지 않은 경우 빈 배열을 반환하세요 
# 5. rawUserInput은 반드시 기존 내역에 현재 발화에서 추가로 관측된 내용을 추가하여 리스트를 업데이트한 후 반환하세요. 
# 6. 전체 status를 참고하여, 현재 사용자의 발화가 이전에 수집된 문항과 상충되거나 모순이 있는 경우 status를 "conflict"로 설정하고 그 모순에 대한 내용을 conflict 항목에 기록하세요. 
# 이후 챗봇이 사용자에게 충돌에 대해 확인하는 메시지를 보낼 것입니다 (예: 이전에는 ~했는데, 지금은 ~이라고 답했습니다, 어느쪽이 맞을까요?). 그것에 대한 답변이 온 경우 아래 단계를 수행하세요. 
#     a. experience 항목을 정정된 내용에 맞게 수정하세요. 
#     b. 이에 맞게 condition, frequency를 상황에 맞게 업데이트 하세요.
#     c. rawUserInput에 유저의 새로운 답변을 추가하세요.
#     d. status를 checking으로 설정하세요. 
#     e. conflict 항목에 충돌을 해결한 기록을 추가하세요.

# JSON 배열 형태로 답변해주세요:
# [
#     {{
#         "questionId": "[해당 문항 ID]",
#         "questionText": "[실제 문항 텍스트]",
#         "experience": "[yes, no, or unknown]",
#         "status": "[unanswered, checking, asking, answered, or conflict]",
#         "rawUserInput": ["[증상 관련 사용자 발화 리스트]"],
#         "frequency": "[빈도 내용 또는 null]",
#         "condition": "[조건/이유 내용 또는 null]",
#         "note": "[추가 정보 또는 null]",
#         "conflict": "[모순 내용 또는 null]",
#         "updated": "[true or false]"
#     }}
# ]
# """


SYMPTOM_ANALYSIS_PROMPT = """
당신은 사용자의 일상과 마음 상태를 신중하게 이해하고 기록하는 AI 어시스턴트입니다. 
챗봇의 직전 질문과 사용자의 현재 발화를 분석하여 주어진 대화 기록에 내용을 업데이트하세요. 

현재 문항 상태:
{questions_info}

INSTRUCTIONS:
1. 현재 사용자 발화가 어떤 맥락인지 충분히 이해하세요
2. 발화가 각 질문 항목 중 어떤 항목의 답변인지 생각하세요
3. 아래 데이터 구조에 맞게 정보를 업데이트하고 반환하세요
4. rawUserInput에 챗봇의 발화 내용을 포함하지 마세요

DATA STRUCTURE:
- questionId: 해당 문항 ID (Q1~Q8)
- questionText: 실제 문항 텍스트 
- experience: 사용자가 해당 항목에 대해 어떻게 응답했는지 ("yes", "no", "unknown")
    - yes: 사용자가 긍정적으로 응답했거나 해당 상태/경험을 하고 있다고 명확히 언급했을 때 
    - no: 사용자가 명확히 부정했거나 해당 상태를 경험하지 않는다고 표현했을 때
    - unknown: 관련 언급이 없거나 모호한 경우 
- status: 답변 완료 상태 ("unanswered", "checking", "asking", "conflict", "answered") 
    - unanswered: 관련 언급이 전혀 없는 상태
    - checking: 관련 언급은 있지만 모호하여 재확인이 필요한 상태 
    - asking: 사용자가 초기 답변을 했지만 더 구체적인 맥락이나 세부 정보가 필요한 상태 
    - answered: 해당 항목에 대한 명확하고 충분한 답변이 완료된 상태
    - conflict: 이전에 수집된 답변과 상충되거나 모순이 있는 상태 
- rawUserInput: 해당 항목과 관련된 사용자 발화들을 저장한 리스트 (업데이트 할 내용이 있다면, 기존 내역에 새로운 요소 추가하여 리스트 업데이트)
- condition: 사용자 발화로부터 해당 상태와 관련된 배경, 이유, 상황 등에 대한 내용 추출 (예: "회사가 너무 바빠서", "시험 기간이라서", "날씨 때문에")
- note: 사용자 발화로부터 해당 항목과 관련된 일반적인 노트나 추가 정보 추출 (예: "사용자의 응답 내용", "추가 설명", "관련 정보")
- updated: 이번 시점에 업데이트 되었는지 여부 (true/false)

CAUTION:
1. 해당 항목에 대한 언급은 있으나 명확하지 않은 경우 status를 "checking"으로 설정하여 추가 확인이 필요함을 표시하세요
2. 사용자가 초기 답변을 했지만 더 구체적인 배경이나 맥락에 대한 질문이 필요한 경우 status를 "asking"으로 설정하세요
3. 사용자가 특정 항목에 대해 충분한 답을 했거나 같은 항목에 대한 질문을 두 번 했다면 해당 항목의 status를 "answered"로 설정하세요
4. 사용자의 현재 발화에서 어떤 문항과도 관련이 없는 경우 빈 배열을 반환하세요 
5. rawUserInput은 반드시 기존 내역에 현재 발화에서 추가로 관측된 내용을 추가하여 리스트를 업데이트한 후 반환하세요
6. 전체 status를 참고하여, 현재 사용자의 발화가 이전에 수집된 답변과 상충되거나 모순이 있는 경우 status를 "conflict"로 설정하고 그 모순에 대한 내용을 conflict 항목에 기록하세요
이후 챗봇이 사용자에게 충돌에 대해 확인하는 메시지를 보낼 것입니다 (예: 이전에는 ~했는데, 지금은 ~이라고 답했습니다, 어느 쪽이 맞을까요?). 그것에 대한 답변이 온 경우 아래 단계를 수행하세요:
    a. experience 항목을 정정된 내용에 맞게 수정하세요
    b. 이에 맞게 condition, note를 상황에 맞게 업데이트 하세요
    c. rawUserInput에 유저의 새로운 답변을 추가하세요
    d. status를 checking으로 설정하세요
    e. conflict 항목에 충돌을 해결한 기록을 추가하세요
    
JSON 배열 형태로 답변해주세요:
[
    {{
        "questionId": "[해당 문항 ID]",
        "questionText": "[실제 문항 텍스트]",
        "experience": "[yes, no, or unknown]",
        "status": "[unanswered, checking, asking, answered, or conflict]",
        "rawUserInput": ["[해당 항목 관련 사용자 발화 리스트]"],
        "condition": "[배경/이유/상황 또는 null]",
        "note": "[추가 정보 또는 null]",
        "conflict": "[모순 내용 또는 null]",
        "updated": "[true or false]"
    }}
]
"""

def extract_json_array(text):
    """GPT 응답에서 JSON 배열을 안전하게 추출하는 함수"""
    try:
        # 마크다운 제거
        clean_text = text.replace("```json", "").replace("```", "").strip()
        
        # 첫 번째 [ 부터 마지막 ] 까지 추출
        start = clean_text.find('[')
        end = clean_text.rfind(']') + 1
        
        if start != -1 and end > start:
            json_str = clean_text[start:end]
            return json.loads(json_str)
        
        # [ ] 가 없으면 단일 객체일 수도 있음
        if clean_text.startswith('{') and clean_text.endswith('}'):
            single_obj = json.loads(clean_text)
            return [single_obj]  # 배열로 감싸서 반환
            
        return []
        
    except Exception as e:
        ai_logger.error(f"❌ JSON 배열 추출 오류: {str(e)}")
        return []


def analysis_user_symptom(last_bot_message, user_message, status, intent, client):
    """
    사용자 발화에서 증상을 분석하고 관련 question 항목을 업데이트하는 함수
    
    Args:
        history (str): 대화 히스토리
        user_message (str): 사용자 현재 발화
        status (dict): 현재 상태 정보
        intent (str): 탐색된 intent
        client: OpenAI 클라이언트
        
    Returns:
        list: 업데이트된 question 항목들
    """
    ai_logger.info(f"🔍 사용자 증상 분석 시작 - Intent: {intent}")
    
    # 현재 질문들 정보
    questions_info = "\n".join([
        f"- {q['questionId']}: {q['questionText']} (status: {q['status']}, frequency: {q.get('frequency', 'null')}, score: {q.get('score', 'null')})"
        for q in status.get("questions", [])
    ])
    
    # 프롬프트에 현재 질문 상태 정보 삽입
    system_prompt = SYMPTOM_ANALYSIS_PROMPT.format(questions_info=questions_info)
    
    max_retries = 3
    retry_delay = 1  # 초
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                ai_logger.info(f"🔄 증상 분석 재시도 {attempt}/{max_retries}")
                time.sleep(retry_delay * attempt)  # 재시도 시 대기 시간 증가
            
            log_api_call("gpt-5-chat-latest", "symptom_analysis", attempt + 1)
            response = client.chat.completions.create(
                model="gpt-5-chat-latest",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"마지막 챗봇 발화:\n{last_bot_message}\n사용자 답변: {user_message}\n의도 분석 결과: {intent}"}
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            result_text = response.choices[0].message.content.strip()
            ai_logger.info(f"🤖 GPT 분석 결과: {result_text}")
            
            # JSON 배열 파싱 시도
            if result_text == "[]":
                ai_logger.info("‼️ 감지된 증상이 없습니다.")
                return []
            else:
                analyzed_symptoms = extract_json_array(result_text)
                if analyzed_symptoms:
                    ai_logger.info(f"✅ 증상 분석 완료: {analyzed_symptoms}")
                    ai_logger.info("----------------------------------------------------------")
                    return analyzed_symptoms
                else:
                    ai_logger.warning("⚠️ JSON 파싱 실패")
                    if attempt == max_retries - 1:
                        ai_logger.error("❌ 모든 재시도 후에도 JSON 파싱 실패")
                        return []
                    continue
                    
        except Exception as e:
            ai_logger.warning(f"⚠️ 증상 분석 시도 {attempt + 1} 실패: {str(e)}")
            if attempt == max_retries - 1:
                log_error("증상 분석 최종 실패", e)
                return []
            continue
    

def create_full_updated_status(current_status, updated_slots):
    """전체 업데이트된 상태 생성 (questions와 last_answered_question만)"""
    # 현재 상태를 복사
    updated_status = copy.deepcopy(current_status)
    
    # 모든 updated 플래그를 False로 초기화
    for question in updated_status["questions"]:
        question["updated"] = False
    
    # updated_slots의 변경사항을 questions에 적용
    latest_answered_question = None
    for update in updated_slots:
        question_id = update["questionId"]
        
        # 해당 질문 찾아서 업데이트
        for i, question in enumerate(updated_status["questions"]):
            if question["questionId"] == question_id:
                # 업데이트 적용
                for key, value in update.items():
                    if key != "questionId":  # questionId는 변경하지 않음
                        updated_status["questions"][i][key] = value
                
                # 답변된 질문 중 가장 최근 것 추적
                if update.get("updated") == True:
                    latest_answered_question = question_id
                break
    
    # state 업데이트
    updated_status["last_answered_question"] = latest_answered_question
    ai_logger.info(f"👉 마지막 답변된 질문: {latest_answered_question}")

    return updated_status, latest_answered_question




def update_dialogue_state(last_bot_message, status, user_message, intent, client):
    """
    대화 상태를 업데이트하고 DP용 전체 상태를 생성하는 메인 함수
    
    Args:
        history (str): 대화 히스토리
        status (dict): 현재 상태 정보
        user_message (str): 사용자 메시지
        intent (str): NLU에서 분석된 의도
        client: OpenAI 클라이언트
        
    Returns:
        tuple: (updated_slots, updated_status)
            - updated_slots: 이번 턴에서 업데이트할 항목들만 (Agent.js DB 업데이트용)
            - updated_status: 업데이트 후 전체 DB 상태 (DP 정책 선택용)
    """
    ai_logger.info(f"🧠 DST 시작 - Intent: {intent}")
    
    try:
        # 사용자 증상 분석 (GPT 활용)
        updated_slots = analysis_user_symptom(last_bot_message, user_message, status, intent, client)

        # 전체 업데이트된 상태 생성 (룰 베이스)
        updated_status, latest_answered_question = create_full_updated_status(status, updated_slots)
        ai_logger.info(f"📊 상태 DB 업데이트 완료: {updated_status}")
        ai_logger.info("----------------------------------------------------------")
        
        return updated_slots, updated_status, latest_answered_question
        
    except Exception as e:
        log_error("DST 처리 중 오류", e)
        # 오류 시 기본값 반환
        return [], status