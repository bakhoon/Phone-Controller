# 폰 컨트롤러 (Phone Controller)

iPhone을 Windows PC 게임 컨트롤러로 쓰는 프로젝트예요.
PC 화면을 폰으로 스트리밍하고, 폰 화면 위의 버튼과 터치패드로 PC에 키보드·마우스 입력을 보내요.

- **PC (host):** Electron + React. QR 코드 표시, 레이아웃 편집(버튼 추가·드래그·크기·키 지정), 화면 캡처, 실제 키 입력
- **폰 (client):** React 웹앱. Safari에서 QR만 찍으면 바로 플레이. 앱 설치 없음

> 매크로 기능은 없어요. 사람이 직접 누른 입력만 전달해요.

## 구조

```
phone-controller/
├─ shared/     # 폰과 PC가 같이 쓰는 타입 (레이아웃, 메시지, 키 목록)
├─ host/       # PC 앱 (Electron)
│  └─ src/
│     ├─ main/       # 서버, SendInput 키 입력, QR, 저장
│     ├─ preload/    # renderer에 window.api 제공
│     └─ renderer/   # PC 화면 (메인, 레이아웃 편집, 세팅) + WebRTC 송신
└─ client/     # 폰 웹앱 (연결 화면, 컨트롤러)
```

```
[iPhone Safari] <── 영상 (WebRTC) ─────────── [PC host]
       │                                          │
       └── 입력 / 레이아웃 / 핑 (WebSocket) ─────>  SendInput (스캔코드)
```

## 준비물 (PC)

- Windows 10/11
- [Node.js](https://nodejs.org) 22 LTS (20.19 이상)
- Git
- PC와 iPhone이 **같은 Wi‑Fi**

## 실행하기

```bash
git clone https://github.com/bakhoon/Phone-Controller.git
cd Phone-Controller
npm install
npm run dev
```

`npm run dev`는 폰 웹앱을 빌드한 뒤 PC 앱을 켜요.

1. PC 앱 메인 화면에 QR 코드가 떠요
2. iPhone 카메라로 QR을 찍으면 Safari가 열리면서 바로 연결돼요
3. 폰을 가로로 돌리면 PC 화면과 버튼이 보여요
4. (추천) Safari 공유 버튼 → "홈 화면에 추가" 하면 다음부터 앱처럼 전체 화면으로 열려요

### 관리자 권한

메이플스토리처럼 게임이 **관리자 권한**으로 실행되면, Windows가 일반 프로그램의 입력을 막아요.
이럴 땐 터미널(PowerShell)을 **관리자 권한으로 실행**한 다음 `npm run dev`를 하세요.
PC 앱 메인 화면에 경고가 뜨면 이 경우예요.

### 처음 한 번: 방화벽

PC 앱을 **관리자 권한**으로 실행하면, 켤 때마다 방화벽에 "Phone Controller" 규칙을 자동으로 추가해요 (같은 공유기 안의 기기만 허용).
관리자 권한이 아니면 자동으로 못 여니까, 관리자 PowerShell에서 한 번 직접 실행하세요:

```
netsh advfirewall firewall add rule name="Phone Controller" dir=in action=allow protocol=TCP localport=8080 remoteip=localsubnet profile=any
```

폰에서 페이지가 하얀 화면으로 로딩만 하다 멈추면 거의 방화벽 문제예요. 그래도 안 되면:

- Wi‑Fi 연결이 "공용 네트워크"로 되어 있으면 "개인 네트워크"로 바꾸기
- 공유기의 "AP 격리 / 클라이언트 격리" 기능 끄기
- PC 앱의 주소 아래에 다른 주소가 보이면 그걸로 시도

## 테스트 순서 (추천)

1. **메모장**: 메모장을 띄우고 폰에서 Q, 방향키를 눌러 글자가 들어가는지 확인
2. **꾹 누르기 / 동시 입력**: 방향키 누른 채로 다른 키 누르기
3. **터치패드**: 문질러서 마우스가 움직이는지, 톡 하면 클릭되는지
4. **메이플**: 게임 키 설정에 맞게 PC 앱의 "레이아웃 편집"에서 키를 바꾼 뒤 테스트

메모장에서는 되는데 게임에서만 안 되면, 게임이 소프트웨어 입력(SendInput)을 막는 경우예요.
이때는 Arduino Leonardo / Pro Micro를 USB 키보드로 인식시키는 방식이 대안이에요 (PROJECT_PLAN.md 참고).

## 레이아웃 편집 (PC)

- 왼쪽: 키 버튼, 방향키 4개, 마우스 클릭, 터치패드 추가
- 가운데: 폰 화면 미리보기. 끌어서 옮기고, 오른쪽 아래 핸들로 크기 조절. PC 화면 영역도 옮기고 줄일 수 있어요
- 오른쪽: 선택한 위젯의 키, 글자, 크기, 모양, 투명도, 터치패드 속도
- "저장하고 폰에 반영"을 누르면 연결된 폰에 바로 적용돼요
- 폰에서 누른 버튼은 미리보기에서 민트색으로 보여요

## 명령어

| 명령어 | 설명 |
|---|---|
| `npm run dev` | 폰 웹앱 빌드 + PC 앱 개발 모드 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 전체 빌드 |
| `npm run dev -w client` | 폰 웹앱만 Vite 개발 서버로 (PC 앱이 8080에서 켜져 있어야 함) |
| `npm run dist` | Windows 설치 파일 만들기 (실험적) |

## 안전 장치

- 연결이 끊기면 눌려 있던 키를 전부 뗌
- 폰이 2.5초 이상 아무 신호도 없으면 눌린 키를 전부 뗌
- 폰 앱이 백그라운드로 가면 전부 뗌
- 같은 키를 두 번 눌러도 한 번만 눌린 것으로 처리

## 알려진 한계 / 다음 할 일

- 집 밖(다른 네트워크)에서 연결은 아직 안 됨
- 영상 지연은 Wi‑Fi 환경에 따라 달라요. 세팅에서 720p / 30fps로 낮추면 줄어들 수 있어요
- 설치 파일(`npm run dist`)은 아직 테스트 전이에요
