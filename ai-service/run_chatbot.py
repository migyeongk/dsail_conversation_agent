# simple_chatbot.py - 간단한 정신건강 공감 챗봇
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from NLU import analyze_intent_and_update_state
from DP import select_policy
from logger_config import (
    ai_logger, log_api_request, log_error
)

# 환경 설정
load_dotenv()
app = Flask(__name__)

# .env에서 SERVER_URL 읽어오기
server_url = os.environ.get("API_SERVER_URL", "http://localhost:3002")
CORS(app, supports_credentials=True, origins=[server_url])

# OpenAI 클라이언트 설정
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        user_id = data.get('user_id', '')
        session_id = data.get('session_id', '')
        timestamp = data.get('timestamp', '')
        history = data.get('history', '')  # 서버에서 보내는 히스토리 데이터
        last_bot_message = data.get('last_bot_message', '')  # 마지막 챗봇 발화
        status = data.get('status', {})  # 서버에서 보내는 상태 정보
        message_count = data.get('messageCount', 0)  # Session의 messageCount 저장
        recent_context_summary = status.get('recent_context_summary', '')
        
        # API 요청 로깅
        log_api_request(user_id, session_id, user_message, timestamp)
        ai_logger.info("----------------------------------------------------------")
        ai_logger.info(f"💬 User Message: {user_message}")
        ai_logger.info(f"👤 User ID: {user_id}, Session ID: {session_id}")
        ai_logger.info(f"⏰ Timestamp: {timestamp}")
        ai_logger.info(f"📊 Message Count: {message_count}")
        ai_logger.info(f"🤖 Last Bot Message: {last_bot_message}")
        ai_logger.info(f"📚 Conversation History:\n{history}")

        is_completed = status.get('is_completed', False)
        last_answered_question = status.get('last_answered_question', None)
        last_asked_question = status.get('last_asked_question', None)
        no_response_retry_question = status.get('no_response_retry_question', None)
        no_response_retry_count = status.get('no_response_retry_count', 0)
        questions = status.get('questions', [])

        ai_logger.info(f"✅ Is Completed: {is_completed}")
        ai_logger.info(f"🧭 Recent Context Summary: {recent_context_summary}")
        ai_logger.info(f"🔁 No Response Retry: {no_response_retry_question} / {no_response_retry_count}")
        ai_logger.info(f"🔄 Last Answered: {last_answered_question}")
        ai_logger.info(f"❓ Last Asked: {last_asked_question}")
        
        # Q1-Q10 상태 출력
        ai_logger.info("📋 Question Status:")
        for q in questions:
            question_id = q.get('questionId', 'Unknown')
            question_text = q.get('questionText', '')
            status_val = q.get('status', 'unknown')
            status_emoji = "✅" if status_val == "answered" else "❌"
            ai_logger.info(f"  {status_emoji} {question_id}: {question_text} ({status_val})")

        ai_logger.info("----------------------------------------------------------")

        #----------------------INTENT ANALYSIS + STATE UPDATE--------------------------#
        analysis_result = analyze_intent_and_update_state(
            user_message=user_message,
            history=history,
            last_bot_message=last_bot_message,
            status=status,
            client=client
        )

        intent = analysis_result.get("intent", {"intent": "other"})
        updated_slots = analysis_result.get("updated_slots")
        updated_status = analysis_result.get("updated_status", status)
        last_answered_question = analysis_result.get("last_answered_question", last_answered_question)

        if intent.get("intent") == "no_response":
            retry_question = last_asked_question
            is_second_no_response = (
                retry_question is not None and
                no_response_retry_question == retry_question and
                no_response_retry_count >= 1
            )

            if is_second_no_response:
                ai_logger.info("🔁 두 번째 무응답 감지 - 현재 문항을 skipped 처리하고 다음으로 이동")
                if updated_slots is None:
                    updated_slots = []

                for question in updated_status.get("questions", []):
                    if question.get("questionId") == retry_question:
                        raw_inputs = question.get("rawUserInput", [])
                        if user_message:
                            raw_inputs = raw_inputs + [user_message]
                        question["status"] = "skipped"
                        question["updated"] = True
                        question["rawUserInput"] = raw_inputs
                        updated_slots.append({
                            "questionId": question["questionId"],
                            "questionText": question["questionText"],
                            "experience": question.get("experience", "unknown"),
                            "status": "skipped",
                            "rawUserInput": raw_inputs,
                            "detail": question.get("detail", []),
                            "updated": True
                        })
                        break

                updated_status["no_response_action"] = "skip"
                updated_status["no_response_retry_question"] = None
                updated_status["no_response_retry_count"] = 0
            else:
                ai_logger.info("🔁 첫 번째 무응답 감지 - 같은 문항 한 번 더 질문")
                updated_status["no_response_action"] = "retry"
                updated_status["no_response_retry_question"] = retry_question
                updated_status["no_response_retry_count"] = 1
        else:
            updated_status["no_response_action"] = None
            updated_status["no_response_retry_question"] = None
            updated_status["no_response_retry_count"] = 0

        updated_status["is_completed"] = is_completed
        
        #----------------------------DIAOUGE POLICY SELECTION----------------------------#
        policy = select_policy(intent, user_message, history, last_bot_message, client, message_count, updated_status)
        
        # next_question에 questionText 추가
        if policy.get('next_question') and updated_status and updated_status.get('questions'):
            question_id = policy['next_question']
            # questions 배열에서 해당 questionId의 questionText 찾기
            matching_question = next((q for q in updated_status['questions'] if q.get('questionId') == question_id), None)
            if matching_question:
                policy['next_question_text'] = matching_question.get('questionText', None)
                ai_logger.info(f"📝 Question Text 추가: {question_id} - {matching_question.get('questionText', '')}")

        #----------------------------POLICY + RESPONSE----------------------------------#
        response = policy.get('response', "죄송해요. 다시 한 번 말씀해 주실 수 있을까요?")

        # post-processing
        response = response.replace("\n\n", "\n").strip()
        
        # 응답 데이터 구성
        response_data = {
            "response": response,
            "intent": intent,
            "first_policy": policy.get('first_policy', None),
            "updated_slots": updated_slots,
            "recent_context_summary": updated_status.get('recent_context_summary', recent_context_summary),
            "no_response_retry_question": updated_status.get("no_response_retry_question"),
            "no_response_retry_count": updated_status.get("no_response_retry_count", 0),
            "is_completed": policy.get('is_completed', False),
            "is_finished": policy.get('is_finished', False),
            "last_asked_question": policy.get('next_question', None),
            "last_asked_question_text": policy.get('next_question_text', None),
            "last_answered_question": last_answered_question
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        log_error("챗봇 응답 생성 중 오류 발생", e)
        return jsonify({
            "error": "챗봇 응답 생성 중 오류가 발생했습니다.",
            "response": "죄송합니다. 일시적인 오류가 발생했습니다. 다시 시도해주세요."
        }), 500





@app.route('/api/summary/<user_id>/<session_id>', methods=['GET'])
def generate_summary(user_id, session_id):
    ai_logger.info(f"🚫 Summary 비활성화 요청 수신 - User: {user_id}, Session: {session_id}")
    return jsonify({
        "error": "키오스크 버전에서는 summary 기능을 사용하지 않습니다.",
        "success": False
    }), 404



@app.route('/', methods=['GET'])
def run_chatbot():
    return jsonify({"status": True, "message": "챗봇 서비스가 정상적으로 동작 중입니다."})

if __name__ == '__main__':
    ai_logger.info("🚀 Running Chatbot...")
    app.run(host='0.0.0.0', port=os.environ.get("AI_SERVICE_PORT"), debug=True)
