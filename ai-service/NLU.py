import json
import copy
import time
from logger_config import ai_logger, log_api_call, log_error


INTENT_AND_STATE_PROMPT = """
당신은 음성인식 키오스크에서 짧은 마음대화를 진행하는 AI입니다.
현재 사용자 발화를 먼저 의도로 분류하고, 의도가 answer인 경우에만 현재 문항 상태를 업데이트하세요.
의도가 answer가 아니면 문항 상태를 업데이트하지 말고 updated_slots는 빈 배열로 반환하세요.

현재 문항 상태:
{questions_info}

의도 유형:
1. "greeting"
   - 인사, 자기소개, 이름 말하기, 대화 시작 의사 표현
   - 예: "안녕하세요", "저는 민수예요", "네 시작할게요"
2. "answer"
   - 현재 질문에 대한 답변
   - 기분, 피로, 불안, 이유 설명, 준비 여부 응답 같은 현재 질문에 대한 반응 포함
   - 예: "요즘 잠을 잘 못 자요", "가끔 그래요", "회사 일이 많아서요", "네 준비됐어요"
3. "question"
   - 사용자가 되묻거나 설명을 요청함
   - 예: "그건 왜 물어보세요?", "무슨 뜻이에요?"
4. "no_response"
   - 응답 거절, 무응답, 패스 의사 표현
   - 예: "잘 모르겠어요", "대답 안 할래요", "다음으로 넘어가 주세요", "NO_RESPONSE", "", "음...", "어..."
5. "off_topic"
   - 현재 대화 목적과 무관한 발화
   - 예: "오늘 날씨 좋네요", "점심 뭐 드셨어요?"
6. "other"
   - 위 다섯 가지로 분류하기 어려운 경우

문항 업데이트 데이터 구조:
- questionId: 해당 문항 ID (Q1~Q6)
- questionText: 실제 문항 텍스트
- experience: "yes", "no", "unknown"
- status: "unanswered", "answered", "skipped"
- rawUserInput: 해당 항목 관련 사용자 발화 리스트
- detail: 구체적인 내용이나 상황 설명 리스트
- updated: 이번 시점에 업데이트 되었는지 여부

의도 분류 규칙:
- 사용자가 현재 질문에 조금이라도 관련된 내용을 말하면 가능한 한 "answer"로 분류하세요.
- 짧고 애매한 답변도 현재 질문에 대한 반응이면 우선 "answer"로 분류하세요.
- 첫 인사, 자기 이름 소개, "시작할게요" 같은 도입 발화는 "greeting"입니다.
- purpose_guidance 직후 "네", "준비됐어요", "응", "좋아요", "시작해요"는 현재 질문에 대한 반응이므로 "answer"입니다.

문항 업데이트 규칙:
- intent가 answer일 때만 updated_slots를 채우세요.
- 사용자가 현재 질문에 대해 실제 K6 문항 내용에 답한 경우에만 해당 문항을 업데이트하세요.
- purpose_guidance 직후 "네 준비됐어요"처럼 준비 여부만 말한 경우는 intent는 answer지만 K6 문항 업데이트는 하지 마세요. 이 경우 updated_slots는 빈 배열입니다.
- ask_current_state에서 오픈 질문을 받은 뒤 사용자가 컨디션, 스트레스, 불안, 버거움, 피로, 우울감, 무가치감과 관련된 내용을 말하면 가장 관련 있는 문항을 업데이트하세요.
- 사용자가 구체적인 상황, 이유, 시점, 예시를 말하면 detail에 추가하세요.
- 사용자가 단순 yes/no 수준으로만 답하고 구체 내용이 없으면 detail은 비워두거나 기존 값만 유지하세요.
- 사용자가 답변을 거절하거나 넘어가기를 원한 경우는 intent를 no_response로 분류하고, updated_slots는 빈 배열로 두세요.
- 문항들은 최근 30일 동안의 마음 상태를 묻는 흐름이라는 점을 고려해 해석하세요.

recent_context_summary 규칙:
- 최근 맥락 요약은 고정 anchor가 아닙니다.
- answer이면서 updated_slots에 detail이 있으면 가장 최근 detail 기반으로 한 줄 요약을 만드세요.
- answer이면서 updated_slots에 detail은 없지만 yes로 답한 rawUserInput이 있으면 그 내용 기반으로 한 줄 요약을 만드세요.
- answer이면서 updated_slots가 비어 있어도, 사용자가 요즘 컨디션이나 최근 스트레스 요인, 마음을 쓰이게 하는 일, 학업/직업/인간관계 맥락을 구체적으로 말했다면 그 내용을 recent_context_summary로 짧게 요약하세요.
- 특히 ask_current_state 직후 사용자가 외부 스트레스 요인과 생활 맥락을 길게 설명했다면, 아직 K6 문항 업데이트가 없더라도 recent_context_summary는 새로 만들어 두세요.
- greeting, question, no_response, off_topic, other이거나 answer라도 문항 업데이트가 없으면 기존 recent_context_summary를 유지하세요.

출력은 반드시 JSON 한 개만 반환하세요:
{{
  "intent": "greeting | answer | question | no_response | off_topic | other",
  "updated_slots": [
    {{
      "questionId": "[해당 문항 ID]",
      "questionText": "[실제 문항 텍스트]",
      "experience": "[yes, no, or unknown]",
      "status": "[unanswered, answered, or skipped]",
      "rawUserInput": ["[해당 항목 관련 사용자 발화 리스트]"],
      "detail": ["[구체적인 내용이나 상황 설명 리스트]"],
      "updated": true
    }}
  ],
  "recent_context_summary": "기존 요약 또는 새 요약"
}}
"""


def extract_json_object(text):
    try:
        clean_text = text.replace("```json", "").replace("```", "").strip()
        start = clean_text.find("{")
        end = clean_text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(clean_text[start:end])
        return {}
    except Exception as e:
        ai_logger.error(f"❌ JSON 객체 추출 오류: {str(e)}")
        return {}


def create_full_updated_status(current_status, updated_slots):
    updated_status = copy.deepcopy(current_status)

    for question in updated_status.get("questions", []):
        question["updated"] = False

    latest_answered_question = None
    for update in updated_slots:
        question_id = update["questionId"]
        for i, question in enumerate(updated_status.get("questions", [])):
            if question["questionId"] == question_id:
                for key, value in update.items():
                    if key != "questionId":
                        updated_status["questions"][i][key] = value
                if update.get("updated") is True:
                    latest_answered_question = question_id
                break

    updated_status["last_answered_question"] = latest_answered_question
    ai_logger.info(f"👉 마지막 답변된 질문: {latest_answered_question}")
    return updated_status, latest_answered_question


def analyze_intent_and_update_state(user_message, history, last_bot_message, status, client):
    ai_logger.info("🔍 의도 분석 + 상태 업데이트 중...")

    if user_message == "NO_RESPONSE":
        ai_logger.info("🔇 NO_RESPONSE 입력 감지 - 무응답으로 즉시 처리")
        fallback_status = copy.deepcopy(status)
        return {
            "intent": {"intent": "no_response"},
            "updated_slots": None,
            "updated_status": fallback_status,
            "last_answered_question": status.get("last_answered_question")
        }

    questions_info = "\n".join([
        f"- {q['questionId']}: {q['questionText']} (status: {q['status']}, experience: {q.get('experience', 'unknown')}, detail: {q.get('detail', [])})"
        for q in status.get("questions", [])
    ])
    recent_context_summary = status.get("recent_context_summary", "")

    system_prompt = INTENT_AND_STATE_PROMPT.format(questions_info=questions_info)
    if history:
        user_context = (
            f"이전 대화내역:\n{history}\n"
            f"마지막 챗봇 발화:\n{last_bot_message}\n"
            f"현재 사용자 메시지:\n{user_message}\n"
            f"현재 recent_context_summary:\n{recent_context_summary}"
        )
    else:
        user_context = (
            f"마지막 챗봇 발화:\n{last_bot_message}\n"
            f"현재 사용자 메시지:\n{user_message}\n"
            f"현재 recent_context_summary:\n{recent_context_summary}"
        )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_context}
    ]

    max_retries = 3
    retry_delay = 1

    for attempt in range(max_retries):
        try:
            if attempt > 0:
                ai_logger.info(f"🔄 의도+상태 분석 재시도 {attempt}/{max_retries}")
                time.sleep(retry_delay * attempt)

            log_api_call("gpt-5-chat-latest", "intent_and_state", attempt + 1)
            response = client.chat.completions.create(
                model="gpt-5-chat-latest",
                messages=messages,
                max_tokens=700,
                temperature=0.2
            )

            result_text = response.choices[0].message.content.strip()
            result = extract_json_object(result_text)

            intent = result.get("intent", "other")
            updated_slots = result.get("updated_slots", [])
            if not isinstance(updated_slots, list):
                updated_slots = []

            updated_status, last_answered_question = create_full_updated_status(status, updated_slots)
            updated_status["recent_context_summary"] = result.get(
                "recent_context_summary",
                recent_context_summary
            )

            ai_logger.info(f"✅ 의도 분석 완료: {{'intent': '{intent}'}}")
            ai_logger.info(f"✅ 상태 업데이트 완료: {updated_slots}")
            ai_logger.info(f"🧭 Recent Context Summary: {updated_status['recent_context_summary']}")
            ai_logger.info("----------------------------------------------------------")

            return {
                "intent": {"intent": intent},
                "updated_slots": updated_slots if updated_slots else None,
                "updated_status": updated_status,
                "last_answered_question": last_answered_question
            }

        except Exception as e:
            ai_logger.warning(f"⚠️ 의도+상태 분석 시도 {attempt + 1} 실패: {str(e)}")
            if attempt == max_retries - 1:
                log_error("의도+상태 분석 최종 실패", e)
                fallback_status = copy.deepcopy(status)
                return {
                    "intent": {"intent": "failed"},
                    "updated_slots": None,
                    "updated_status": fallback_status,
                    "last_answered_question": status.get("last_answered_question")
                }
            continue


def analyze_intent(user_message, history, client):
    ai_logger.info("🔍 의도 분석 단독 함수는 더 이상 사용하지 않습니다.")
    return {"intent": "other"}


def is_symptom_intent(intent):
    answer_intents = ["answer"]
    return intent in answer_intents
