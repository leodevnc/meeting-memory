# Engineering decisions

## ADR-001: 전사와 분석을 비동기로 분리

상태: accepted

오디오 길이는 HTTP API의 응답 시간보다 길고 Transcribe job 완료 시간도 예측하기 어렵습니다. API는 S3 업로드와 작업 시작만 담당하고, Transcribe 상태 이벤트가 분석 processor를 깨웁니다. 브라우저는 meeting 상태를 polling합니다. 초기 구현에서는 단순한 polling이 WebSocket 연결 상태보다 다루기 쉽습니다.

## ADR-002: Bedrock Converse와 엄격한 출력 schema

상태: accepted

provider별 payload 대신 Converse API를 사용하고 `maxTokens`를 2400으로 명시했습니다. 모델 ID는 코드 상수가 아니라 CloudFormation parameter입니다. 결과는 JSON parse 뒤 Zod schema를 통과해야 하며, 모델이 반환한 action status는 항상 `OPEN`으로 재설정합니다.

Transcript prompt injection을 줄이기 위해 system instruction은 전사를 인용 데이터로 취급하라고 명시하고 XML delimiter로 감쌉니다. 이것은 완전한 방어가 아니므로, 중요한 결정에는 evidence 필드를 요구합니다.

## ADR-003: 원본은 30일, 회의 메타데이터는 유지

상태: accepted

원본 음성과 transcript JSON은 비용과 개인정보 노출 면적을 줄이기 위해 S3 lifecycle로 30일 뒤 삭제합니다. 사용자가 실제로 탐색하는 정규화 전사와 분석은 DynamoDB에 남습니다. 조직별 보존 요구가 다르므로 이후에는 tenant policy로 분리할 필요가 있습니다.

## ADR-004: 로컬 모드는 실제 AWS emulator가 아님

상태: accepted

로컬 서버는 사용자 흐름과 애플리케이션 contract를 빠르게 검증하는 deterministic fake입니다. IAM, EventBridge retry, S3 CORS, service quota는 AWS 통합 테스트로만 검증할 수 있습니다. 로컬 성공을 cloud integration 성공으로 간주하지 않습니다.
