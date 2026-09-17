# Meeting Memory

회의 음성을 전사하는 데서 끝내지 않고, 다시 찾고 실행할 수 있는 기록으로 만드는 실험입니다. 브라우저에서 녹음하거나 오디오 파일을 올리면 화자와 타임스탬프가 포함된 전사를 만들고, LLM이 요약·결정사항·액션아이템·열린 질문을 구조화합니다. 액션아이템은 완료 상태까지 관리할 수 있습니다.

![Status](https://img.shields.io/badge/status-study%20in%20progress-ef5b3f)

## 이번에 확인하려는 질문

- 긴 작업을 HTTP 요청 안에서 기다리지 않고 어떻게 안전하게 이어갈 수 있는가?
- LLM 출력이 자연어가 아니라 애플리케이션 상태가 될 때 어떤 검증 경계가 필요한가?
- 회의 전사 안의 지시문을 데이터로만 취급하고 근거 없는 결정·할 일을 줄이려면 어떻게 해야 하는가?
- 사용자별 회의 데이터와 원본 음성을 어떤 키 구조와 보존 정책으로 격리할 수 있는가?
- AWS 없이도 전체 사용자 흐름을 반복해서 테스트할 수 있는가?

## 현재 범위

- 브라우저 녹음 및 500MB 이하 오디오 파일 업로드
- 한국어·영어·일본어 또는 자동 언어 감지
- 로컬 mock 전사와 결정론적 분석으로 완결되는 실행 흐름
- Amazon Transcribe와 Amazon Bedrock Converse 연동을 표현한 비배포 CDK·adapter 예제
- 요약, 주제, 결정사항, 근거 문장, 액션아이템, 열린 질문
- 개인별 회의 목록/상세 조회와 액션아이템 완료 처리
- Cognito JWT 인증, S3 직접 업로드, DynamoDB 소유권 파티션
- 로컬 mock 전사·분석 서버와 통합 테스트

검색, 참석자 초대, 캘린더 동기화, 여러 회의에 걸친 질의응답은 아직 범위 밖입니다.

## 로컬 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 로컬 모드는 인증과 AWS 호출을 생략하고 고정된 전사 샘플을 분석하므로 비용이 발생하지 않습니다.

```bash
npm run build
npm test
npm run synth
```

## AWS 아키텍처 프로토타입

`lib/`과 `src/functions/`은 CloudFront·private S3·Cognito·HTTP API·Lambda·DynamoDB·EventBridge·SQS DLQ를 이용한 확장 경로를 학습하기 위한 CDK 프로토타입입니다. 이 저장소의 기본 작업은 실제 AWS 리소스를 만들거나 연결하지 않으며, `synth`로 CloudFormation 구조와 번들링 가능성만 확인합니다.

```bash
npm run synth
```

`BedrockModelId` 기본값은 의도적으로 placeholder입니다. 이후 별도의 배포 실험을 하게 된다면 그 시점에 사용 가능한 모델을 확인하고, 비용·개인정보·삭제 계획을 검토한 뒤 명시적으로 값을 제공해야 합니다.

## 처리 흐름

```text
Browser
  ├─ Cognito login
  ├─ POST /meetings
  └─ presigned upload ───────────────> private S3
                                            │
Browser ── POST /meetings/{id}/start        │
                    │                       │
                    ▼                       ▼
              Amazon Transcribe ──> transcript JSON
                    │
              EventBridge event
                    │
                    ▼
             processor Lambda
              ├─ normalize speakers/timestamps
              ├─ Bedrock Converse
              ├─ validate JSON schema
              └─ conditional status update
                    │
                    ▼
                 DynamoDB
```

상세 설계와 실패 모드는 [architecture.md](docs/architecture.md), 선택의 배경은 [decisions.md](docs/decisions.md), 진행 계획은 [roadmap.md](docs/roadmap.md)에 기록했습니다.

## 데이터와 보안 경계

- 모든 API는 Cognito JWT를 요구하고 `sub`를 DynamoDB 파티션 키에 포함합니다.
- 업로드는 10분짜리 presigned POST이며 크기와 content type을 제한합니다.
- S3는 public access를 차단하고 HTTPS만 허용합니다.
- 원본 음성과 전사 객체는 30일 후 만료합니다.
- 전사 본문이나 LLM 응답은 로그에 쓰지 않습니다.
- 전사는 신뢰할 수 없는 입력으로 표시하며 LLM 결과를 Zod schema로 검증합니다.
- Lambda 비동기 실패는 DLQ로 보내고, 상태 조건식으로 중복 이벤트의 재처리를 막습니다.

회의에는 개인식별정보나 회사 기밀이 포함될 수 있습니다. 실제 환경에서는 조직의 보존·접근·감사 정책에 맞춰 KMS 고객 관리형 키, Bedrock invocation logging 설정, Guardrails 사용 여부를 별도로 결정해야 합니다.

## 알려진 제한

- 작업 이름 GSI를 통한 이벤트 연결은 간단하지만, 대규모 환경에서는 별도 job 레코드나 이벤트 저장소가 더 적합할 수 있습니다.
- 액션아이템 배열 전체를 갱신하므로 동시 편집 충돌 제어가 아직 없습니다.
- LLM의 근거 문자열이 실제 전사에 존재하는지 기계적으로 재검증하지 않습니다.
- 브라우저 업로드는 multipart 재개를 지원하지 않습니다.

## License

MIT
