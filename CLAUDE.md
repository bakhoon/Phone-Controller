# CLAUDE.md

## 프로젝트
iPhone을 Windows PC 게임용 컨트롤러로 쓰는 개인 프로젝트.
PC 화면을 폰으로 스트리밍하고, 폰 화면 위의 터치 버튼/터치패드로 키보드·마우스 입력을 PC에 보낸다.
버튼 배치(레이아웃)는 **PC 앱에서 편집**하고, 폰은 QR 찍고 바로 플레이만 한다.
지금은 나 혼자 쓰는 메이플스토리용 버전. 판매, 계정, App Store는 범위 밖.

자세한 기획: `PROJECT_PLAN.md` / 실행 방법: `README.md`

## 개발자
- 소프트웨어 엔지니어, React와 Node.js에 익숙함
- 설명은 한국어로, 코드와 주석은 영어로
- em dash(—) 쓰지 않기

## 구조
- `shared/`: 레이아웃 타입(`layout.ts`), WebSocket 메시지(`protocol.ts`), 키 목록(`keys.ts`). host와 client 둘 다 `@shared/*` alias로 import
- `host/`: Electron (electron-vite). `src/main`(서버, SendInput, 저장), `src/preload`(window.api), `src/renderer`(React PC 화면 + WebRTC 송신)
- `client/`: React + Vite 폰 웹앱. 빌드 결과(`client/dist`)를 host가 같은 포트로 서빙 (같은 Wi‑Fi), Cloudflare relay도 같은 파일을 서빙 (멀리서)
- `relay/`: Cloudflare Worker + Durable Object. 방(room) 단위로 PC와 폰의 메시지를 그대로 전달. 폰은 방 키가 맞아야 들어옴

## 기술 결정
- 영상: WebRTC. renderer에서 `getDisplayMedia` (main의 `setDisplayMediaRequestHandler`가 모니터 선택). 코덱은 H.264 우선
- 연결: 같은 Wi‑Fi는 PC의 WebSocket(`/ws`), 멀리서는 Cloudflare relay WebSocket. 둘 다 `host/src/main/hub.ts`가 "지금 조종하는 폰" 하나를 관리
- 입력: WebRTC가 연결되면 DataChannel로 직접 보냄 (안 되면 WebSocket). STUN은 Cloudflare/Google 공개 서버, TURN 없음
- 입력 실행: Windows `SendInput`을 **스캔코드 방식**으로 호출 (`koffi`). Windows가 아니면 콘솔 로그만
- 레이아웃 좌표는 기준 크기 844×390 (가로 iPhone)에서의 중심 좌표. 폰이 화면에 맞게 확대/축소
- 설정과 레이아웃은 Electron userData 폴더의 `settings.json`, `layouts.json`

## 규칙
- 큰 단계마다 실행 가능한 상태로 멈추고, 내가 Windows에서 테스트할 방법을 알려줄 것
- 지연(latency)을 항상 측정 가능하게 유지 (폰 화면 왼쪽 위 ms 표시)
- 키 입력은 keydown / keyup을 따로 보낸다 (꾹 누르기, 동시 입력)
- 연결이 끊기거나 폰이 조용해지면 눌려 있던 키를 전부 keyup 처리
- 매크로, 자동 반복 입력 기능은 만들지 않는다. 사람이 누른 입력만 전달
- 변경 후 `npm run typecheck`와 `npm run build` 통과 확인
