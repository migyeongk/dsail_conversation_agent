# simple_chatbot.py - 간단한 정신건강 공감 챗봇
import logging
import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from NLU import analyze_intent, is_symptom_intent
from DST import update_dialogue_state
from DP import select_policy
from NLG import generate_response
from Summary import generate_summary_report, format_conversation_history
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
        selected_policies = data.get('selectedPolicies', [])  # 이전에 선택된 정책들
        tone_preference = data.get('tonePreference')  # 사용자 말투 선호
        conversation_style = data.get('conversationStyle')  # 사용자 대화 스타일 선호
        
        # API 요청 로깅
        log_api_request(user_id, session_id, user_message, timestamp)
        ai_logger.info("----------------------------------------------------------")
        ai_logger.info(f"💬 User Message: {user_message}")
        ai_logger.info(f"👤 User ID: {user_id}, Session ID: {session_id}")
        ai_logger.info(f"⏰ Timestamp: {timestamp}")
        ai_logger.info(f"📊 Message Count: {message_count}")
        ai_logger.info(f"📋 Selected Policies: {selected_policies}")
        ai_logger.info(f"🤖 Last Bot Message: {last_bot_message}")
        ai_logger.info(f"🗣️ Tone Preference: {tone_preference}")
        ai_logger.info(f"💬 Conversation Style: {conversation_style}")
        ai_logger.info(f"📚 Conversation History:\n{history}")

        is_completed = status.get('is_completed', False)
        last_answered_question = status.get('last_answered_question', None)
        last_asked_question = status.get('last_asked_question', None)
        questions = status.get('questions', [])

        ai_logger.info(f"✅ Is Completed: {is_completed}")
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


        #----------------------------INTENT ANALYSIS------------------------------------#
        previous_policy = selected_policies[-1] if selected_policies else "start"
        intent = analyze_intent(user_message, history, client, previous_policy)
        if intent.get('intent') == 'answer_tone':
            tone_preference = user_message
        elif intent.get('intent') == 'answer_conversation_style':
            conversation_style = user_message
            
        #----------------------------SYMPTOM-RELEVANT PROCESS---------------------------#
        if is_symptom_intent(intent.get('intent')):
            ai_logger.info("🧠 Symptom 관련 의도 감지: DST 실행")
            
            #-------------------------DIALOGUE STATE TRACKING----------------------------#
            updated_slots, updated_status, last_answered_question = update_dialogue_state(
                last_bot_message=last_bot_message,
                status=status, 
                user_message=user_message,
                intent=intent.get('intent'),
                client=client
            )

        # Non-symptom-relevant Intent
        else:
            ai_logger.info("💬 Non-symptom 프로세스 실행")
            updated_slots = None
            updated_status = status
        
        #----------------------------DIAOUGE POLICY SELECTION----------------------------#
        policy = select_policy(intent, user_message, history, client, message_count, updated_status, selected_policies, conversation_style)
        
        # next_question에 questionText 추가
        if policy.get('next_question') and updated_status and updated_status.get('questions'):
            question_id = policy['next_question']
            # questions 배열에서 해당 questionId의 questionText 찾기
            matching_question = next((q for q in updated_status['questions'] if q.get('questionId') == question_id), None)
            if matching_question:
                policy['next_question_text'] = matching_question.get('questionText', None)
                ai_logger.info(f"📝 Question Text 추가: {question_id} - {matching_question.get('questionText', '')}")

        #----------------------------RESPONSE GENERATION---------------------------------#
        response = generate_response(policy, user_message, history, updated_status, client, tone_preference)

        # post-processing
        response = response.replace("\n\n", "\n").strip()
        
        # 응답 데이터 구성
        response_data = {
            "response": response,
            "intent": intent,
            "first_policy": policy.get('first_policy', None),
            "second_policy": policy.get('second_policy', None),
            "updated_slots": updated_slots,
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
    try:
        ai_logger.info(f"📊 Summary 요청 수신 - User: {user_id}, Session: {session_id}")
        
        # API 서버에서 대화 내용을 가져오는 요청
        api_server_url = os.environ.get("API_SERVER_URL", "http://localhost:3002")
        
        # 세션의 대화 내용과 상태 정보 가져오기
        try:
            # 1. 대화 내용 가져오기
            history_response = requests.get(f"{api_server_url}/api/history/{user_id}/{session_id}")
            if history_response.status_code != 200:
                ai_logger.error(f"대화 내용 조회 실패: {history_response.status_code}")
                return jsonify({
                    "error": "대화 내용을 가져올 수 없습니다.",
                    "success": False
                }), 500
                
            history_data = history_response.json()
            messages = history_data.get('messages', [])
            
            if not messages:
                ai_logger.warning("대화 내용이 없습니다.")
                return jsonify({
                    "error": "분석할 대화 내용이 없습니다.",
                    "success": False
                }), 400
            
            # 2. 세션 정보 가져오기
            session_response = requests.get(f"{api_server_url}/api/session/{user_id}/{session_id}")
            session_data = {}
            if session_response.status_code == 200:
                session_data = session_response.json()
                ai_logger.info("세션 정보 조회 성공")
            else:
                ai_logger.warning(f"세션 정보 조회 실패: {session_response.status_code}")
            
            # 3. 상태 정보 가져오기
            status_response = requests.get(f"{api_server_url}/api/state/{user_id}/{session_id}")
            status_data = {}
            if status_response.status_code == 200:
                status_data = status_response.json()
                ai_logger.info("상태 정보 조회 성공")
            else:
                ai_logger.warning(f"상태 정보 조회 실패: {status_response.status_code}")
            
        except requests.RequestException as e:
            ai_logger.error(f"API 서버 연결 실패: {e}")
            return jsonify({
                "error": "데이터를 가져오는 중 오류가 발생했습니다.",
                "success": False
            }), 500
        
        # 대화 내용을 문자열로 변환
        conversation_history = format_conversation_history(messages)
        
        # Summary 레포트 생성 (추가 정보 포함)
        summary_result = generate_summary_report(
            user_id, 
            session_id, 
            conversation_history, 
            client,
            session_data=session_data,
            status_data=status_data
        )
        
        if summary_result['success']:
            ai_logger.info(f"✅ Summary 레포트 생성 완료 - User: {user_id}, Session: {session_id}")
            return jsonify({
                "success": True,
                "data": summary_result['data'],
                "user_id": user_id,
                "session_id": session_id
            })
        else:
            ai_logger.error(f"❌ Summary 레포트 생성 실패 - User: {user_id}, Session: {session_id}")
            return jsonify({
                "error": "레포트 생성 중 오류가 발생했습니다.",
                "success": False,
                "details": summary_result.get('error', 'Unknown error')
            }), 500
            
    except Exception as e:
        log_error(f"Summary 엔드포인트 오류 - User: {user_id}, Session: {session_id}", e)
        return jsonify({
            "error": "서버 내부 오류가 발생했습니다.",
            "success": False
        }), 500



@app.route('/', methods=['GET'])
def run_chatbot():
    return jsonify({"status": True, "message": "챗봇 서비스가 정상적으로 동작 중입니다."})

if __name__ == '__main__':
    ai_logger.info("🚀 Running Chatbot...")
    app.run(host='0.0.0.0', port=os.environ.get("AI_SERVICE_PORT"), debug=True)
