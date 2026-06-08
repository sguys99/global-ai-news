---
name: 별도 브랜치 금지
description: 임의로 feature 브랜치를 만들지 않는다. main 브랜치에서 직접 작업·커밋·푸시한다.
type: feedback
---

main 브랜치에서 직접 작업하고 커밋·푸시한다. 자의적으로 별도 feature 브랜치를 만들지 않는다.

**Why:** 1인 개발 워크플로우라 별도 브랜치는 혼란만 일으킨다. 기본 git 정책("기본 브랜치면 먼저 브랜치를 따라")을 적용했다가 사용자가 강하게 경고함(Phase 3 때 자동 생성한 `feat/phase3-sources-filters`).

**How to apply:** 현재 main이어도 새 브랜치를 만들지 말고 main에서 그대로 커밋 후 `git push origin main`. 커밋/푸시는 명시적 지시가 있을 때만 실행(feedback_no_auto_commit 참조).
