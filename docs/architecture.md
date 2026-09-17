# Architecture

## 경계와 불변조건

1. 사용자는 자신의 Cognito `sub` 파티션 안의 회의만 조회하고 수정한다.
2. 원본 업로드는 API Gateway를 통과하지 않는다. API는 제한된 presigned POST만 발급한다.
3. 전사와 LLM 분석은 비동기다. HTTP 요청은 작업 시작까지만 책임진다.
4. `READY` 상태는 유효한 구조화 분석이 저장된 경우에만 도달한다.
5. 전사와 모델 출력은 모두 신뢰할 수 없는 데이터다. 로그·HTML·애플리케이션 상태에 들어가기 전에 경계를 둔다.

## 상태 모델

```text
UPLOAD_PENDING -> TRANSCRIBING -> ANALYZING -> READY
       |               |              |
       +---------------+--------------+-> FAILED
                                      
FAILED -> TRANSCRIBING (명시적 재시도, 이후 마일스톤)
```

EventBridge와 Lambda는 at-least-once이므로 동일 이벤트가 다시 올 수 있습니다. processor는 `READY`를 즉시 무시하고 DynamoDB 조건식 `TRANSCRIBING -> ANALYZING`을 획득한 실행만 분석을 수행합니다.

## 데이터 모델

하나의 DynamoDB 테이블을 사용합니다.

```text
pk = OWNER#{cognito_sub}
sk = MEETING#{meeting_id}
```

목록은 owner partition query로 얻습니다. Transcribe 완료 이벤트는 `job-name-index` GSI에서 `transcriptionJobName`으로 회의를 찾습니다. 이 GSI는 작업 연결을 위한 보조 인덱스이며 사용자 API의 권한 경계로 사용하지 않습니다.

LLM 분석 결과는 다음의 version 1 contract를 따릅니다.

```text
title
summary
topics[]
decisions[] { text, evidence }
actionItems[] { id, task, owner?, dueDate?, status, evidence }
openQuestions[]
```

## 실패 처리

| 실패 | 처리 | 사용자 상태 |
|---|---|---|
| 업로드 미완료 | S3 HeadObject에서 거부 | UPLOAD_PENDING |
| Transcribe 실패 이벤트 | error code만 저장 | FAILED |
| transcript JSON 없음/파싱 실패 | 본문 없이 code만 로그 | FAILED |
| Bedrock throttling/일시 장애 | SDK adaptive retry 후 EventBridge retry | ANALYZING 또는 FAILED |
| schema 불일치 | 애플리케이션 상태에 저장하지 않음 | FAILED |
| processor 반복 실패 | EventBridge target DLQ | 운영자 확인 |

현재 구현은 분석 시작 후 장애가 나면 `FAILED`로 바꾸며 자동 재시도 횟수가 제한됩니다. 수동 재시도 API는 roadmap에 남겨 두었습니다.

## 개인정보와 로그

회의 본문을 `console`에 남기지 않습니다. 로그에는 meeting ID, 상태, 오류 이름만 기록합니다. Bedrock model invocation logging은 별도 계정 설정이므로, 실제 배포 전 원문 저장 여부와 로그 암호화·보존 기간을 확인해야 합니다.
