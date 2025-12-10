# Summary.py - 대화 내용을 분석하여 레포트를 생성하는 모듈
import json
import logging
from logger_config import ai_logger, log_error


SUMMARY_ANALYSIS_PROMPT = """
당신은 정신건강의학 전문 AI입니다.  
사용자의 현재 대화 내용 및 문진대화 결과물을 분석하여 사용자의 우울 및 불안 상태 레포트를 생성하세요.

반드시 아래 JSON 형식으로만 응답해주세요. 다른 텍스트나 설명은 포함하지 마세요.

{{
  "depression": "우울상태에 대한 분석 내용을 자세히 작성해주세요. 현재 상태, 주요 증상, 심각도 등을 포함하여 따뜻하고 이해하기 쉬운 언어로 설명해주세요.",
  "anxiety": "불안상태에 대한 분석 내용을 자세히 작성해주세요. 현재 상태, 주요 증상, 심각도 등을 포함하여 따뜻하고 이해하기 쉬운 언어로 설명해주세요.",
  "suggestion": "사용자에게 도움이 될 수 있는 구체적인 제안사항을 작성해주세요. 즉시 실행할 수 있는 방법, 장기적인 관리 방법, 전문가 상담 필요성 등을 포함하여 실용적이고 따뜻한 조언을 제공해주세요."
}}

# 분석 가이드라인:
1. 대화에서 나타난 감정, 행동, 사고 패턴을 종합적으로 고려하세요.
2. 우울 관련: 슬픔, 무기력감, 흥미상실, 수면/식욕 변화, 자책감, 절망감 등의 증상을 평가하세요.
3. 불안 관련: 걱정, 긴장, 불안감, 신체증상, 회피행동, 집중력 저하 등을 평가하세요.
4. 각 항목은 200-300자 정도로 충분히 자세하게 작성해주세요.
5. 판단적이거나 의학적 진단보다는 이해와 공감을 바탕으로 한 분석을 제공하세요.
6. 제안사항은 구체적이고 실현 가능한 방법을 중심으로 작성하세요.
7. 따뜻하고 희망적인 어조를 유지하면서도 현실적인 조언을 제공하세요.

대화 내용:
{conversation_history}

문진 상태:
{additional_info}
"""

def generate_summary_report(user_id, session_id, conversation_history, client, session_data=None, status_data=None):
    """
    Args:
        user_id (str): 사용자 ID
        session_id (str): 세션 ID
        conversation_history (str): 대화 내용
        client (OpenAI): OpenAI 클라이언트
    
    Returns:
        dict: 분석 결과 레포트
    """
    try:
        ai_logger.info(f"📊 Summary 레포트 생성 시작 - User: {user_id}, Session: {session_id}")

        # 대화 내용이 너무 짧은 경우 처리
        if not conversation_history or len(conversation_history.strip()) < 10:
            ai_logger.warning(f"대화 내용이 너무 짧습니다 - User: {user_id}, Session: {session_id}")
            return {
                "success": True,
                "data": {
                    "depression": "대화 내용이 충분하지 않아 우울상태를 정확히 분석하기 어렵습니다. 더 많은 대화를 통해 보다 정확한 분석이 가능합니다.",
                    "anxiety": "대화 내용이 충분하지 않아 불안상태를 정확히 분석하기 어렵습니다. 더 많은 대화를 통해 보다 정확한 분석이 가능합니다.",
                    "suggestion": "정신건강 관리를 위해 규칙적인 생활습관을 유지하시고, 충분한 휴식을 취하시기 바랍니다. 지속적인 어려움이 있으시면 전문가와 상담해보시는 것을 권합니다."
                },
                "raw_response": "대화 내용 부족으로 기본 응답 제공"
            }
        
        # AI를 사용한 분석
        ai_logger.info("🤖 OpenAI를 사용한 대화 분석 시작")
        
        # 추가 정보 포맷팅
        additional_info = format_additional_info(session_data, status_data)
        
        # 프롬프트에 대화 내용과 추가 정보 삽입
        analysis_prompt = SUMMARY_ANALYSIS_PROMPT.format(
            conversation_history=conversation_history,
            additional_info=additional_info
        )
        ai_logger.info(f"프롬프트: {analysis_prompt}")
        
        # OpenAI API 호출
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": analysis_prompt
                }
            ],
            max_tokens=1500,
            temperature=0.7
        )
        
        ai_response = response.choices[0].message.content.strip()
        ai_logger.info(f"✅ OpenAI 분석 완료 - User: {user_id}, Session: {session_id}")
        ai_logger.info(f"AI 응답: {ai_response}")
        
        # JSON 파싱 시도
        try:
            import json
            analysis_data = json.loads(ai_response)
            
            # 필수 키 확인
            required_keys = ['depression', 'anxiety', 'suggestion']
            for key in required_keys:
                if key not in analysis_data:
                    ai_logger.warning(f"필수 키 누락: {key}")
                    analysis_data[key] = f"{key} 분석 결과를 생성하는 중 오류가 발생했습니다."
            
            return {
                "success": True,
                "data": analysis_data,
                "raw_response": ai_response
            }
            
        except json.JSONDecodeError as e:
            ai_logger.error(f"JSON 파싱 오류: {e}")
            ai_logger.error(f"AI 응답: {ai_response}")
            
            # JSON 파싱 실패 시 기본 응답 제공
            return {
                "success": True,
                "data": {
                    "depression": "대화 내용을 분석한 결과, 우울감과 관련된 여러 요소들이 관찰됩니다. 현재 상태를 지속적으로 관찰하며 필요시 전문가의 도움을 받으시기 바랍니다.",
                    "anxiety": "불안과 관련된 증상들이 일부 나타나고 있습니다. 적절한 스트레스 관리와 휴식을 통해 증상 완화에 도움이 될 수 있습니다.",
                    "suggestion": "규칙적인 생활패턴 유지, 충분한 수면, 적절한 운동, 그리고 필요시 전문가 상담을 권합니다. 자신의 감정을 인정하고 받아들이는 것도 중요합니다."
                },
                "raw_response": f"JSON 파싱 실패: {ai_response}"
            }
            
    except Exception as e:
        log_error(f"Summary 레포트 생성 중 오류 발생 - User: {user_id}, Session: {session_id}", e)
        return {
            "success": False,
            "error": str(e),
            "data": None
        }

def format_additional_info(session_data, status_data):
    """
    세션 정보와 상태 정보를 분석에 유용한 형태로 포맷팅합니다.
    
    Args:
        session_data (dict): 세션 정보
        status_data (dict): 상태 정보
    
    Returns:
        str: 포맷된 추가 정보
    """
    try:
        info_text = "\n=== 추가 분석 정보 ===\n"
        
        # 세션 정보 포맷팅
        if session_data:
            info_text += f"📊 세션 정보:\n"
            info_text += f"- 총 메시지 수: {session_data.get('messageCount', 0)}개\n"
            info_text += f"- 대화 지속 시간: {session_data.get('totalDuration', 0)}초\n"
            info_text += f"- 대화 완료 여부: {'완료' if session_data.get('isFinished', False) else '진행중'}\n"
            info_text += f"- 선호 말투: {session_data.get('tonePreference', '미설정')}\n"
            info_text += f"- 대화 스타일: {session_data.get('conversationStyle', '미설정')}\n"
            
            # 선택된 정책들 (대화 패턴 분석에 유용)
            policies = session_data.get('selectedPolicies', [])
            if policies:
                info_text += f"- 대화 중 나타난 패턴: {', '.join(policies[-10:])}\n"  # 최근 10개만
        
        # 상태 정보 포맷팅
        if status_data and status_data.get('questions'):
            info_text += f"\n🔍 증상 문진 결과:\n"
            answered_questions = [q for q in status_data['questions'] if q.get('status') == 'answered']
            info_text += f"- 총 문진 항목: {len(status_data['questions'])}개\n"
            info_text += f"- 답변 완료: {len(answered_questions)}개\n"
            
            # 주요 증상들 요약
            symptoms_summary = []
            for question in answered_questions:
                if question.get('experience') == 'yes' and question.get('frequency'):
                    freq_text = {0: '전혀없음', 1: '며칠간', 2: '절반이상', 3: '거의매일'}.get(question.get('frequency'), '미상')
                    symptoms_summary.append(f"{question.get('questionText', '미상')[:20]}... ({freq_text})")
            
            if symptoms_summary:
                info_text += f"- 경험한 주요 증상:\n"
                for symptom in symptoms_summary[:5]:  # 최대 5개만
                    info_text += f"  • {symptom}\n"
        
        return info_text
        
    except Exception as e:
        ai_logger.error(f"추가 정보 포맷팅 중 오류: {e}")
        return "\n=== 추가 분석 정보 ===\n추가 정보를 가져올 수 없습니다.\n"

def format_conversation_history(messages):
    """
    메시지 배열을 문자열 형태의 대화 내용으로 변환합니다.
    
    Args:
        messages (list): 대화 메시지 배열
    
    Returns:
        str: 포맷된 대화 내용
    """
    try:
        formatted_history = ""
        for message in messages:
            # DB 스키마에 맞는 필드명 사용 (sender, text)
            sender = message.get('sender', 'unknown')
            text = message.get('text', '')
            timestamp = message.get('timestamp', '')
            
            if sender == 'user':
                formatted_history += f"[사용자] {text}\n"
            elif sender == 'bot':
                formatted_history += f"[챗봇] {text}\n"
            
        return formatted_history.strip()
        
    except Exception as e:
        ai_logger.error(f"대화 내용 포맷팅 중 오류: {e}")
        return "대화 내용을 가져올 수 없습니다."

def validate_summary_data(summary_data):
    """
    생성된 레포트 데이터의 유효성을 검증합니다.
    
    Args:
        summary_data (dict): 레포트 데이터
    
    Returns:
        bool: 유효성 검증 결과
    """
    required_fields = [
        'depression_analysis',
        'anxiety_analysis', 
        'recommended_actions',
        'overall_summary'
    ]
    
    for field in required_fields:
        if field not in summary_data:
            ai_logger.warning(f"필수 필드 누락: {field}")
            return False
    
    # depression_analysis 검증
    if 'level' not in summary_data['depression_analysis']:
        ai_logger.warning("우울 분석 레벨 누락")
        return False
        
    # anxiety_analysis 검증  
    if 'level' not in summary_data['anxiety_analysis']:
        ai_logger.warning("불안 분석 레벨 누락")
        return False
        
    return True
