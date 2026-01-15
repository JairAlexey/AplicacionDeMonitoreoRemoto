# Non functional tests (app)

Load tests for the desktop app flows. These scripts simulate multiple
participants sending screen and media logs against the backend.

Prereqs
- Node 18+ (global fetch required).
- Backend reachable (set BASE_URL if not localhost).
- event keys JSON file (event_keys.json).
- Test assets in `non_functional_tests/assets` (screen.jpg + video.webm).

Generate event keys (backend)
From `administrador/backend` run:
- `python manage.py prepare_load_test_event --count 50 --output ..\\..\\app\\non_functional_tests\\event_keys.json`

Massive load test (fixed concurrency)
- `node non_functional_tests/run_load_test_massive.js`

Progressive load test (ramp users)
- `node non_functional_tests/run_load_test_progressive.js`

Common environment variables
- `BASE_URL` (default: http://127.0.0.1:8000)
- `EVENT_KEYS_FILE` (default: non_functional_tests/event_keys.json)
- `SCREEN_FILE` (default: non_functional_tests/assets/screen.jpg)
- `VIDEO_FILE` (default: non_functional_tests/assets/video.webm)
- `SCREEN_INTERVAL_MS` (default: 10000)
- `MEDIA_INTERVAL_MS` (default: 15000)
- `START_INDEX` (default: 0)
- `KEYS_COUNT` (default: 0 = all)

Massive-only variables
- `CONCURRENCY` (default: 20)
- `DURATION_SEC` (default: 60)

Progressive-only variables
- `MAX_USERS` (default: 50)
- `STEP_USERS` (default: 1)
- `STEP_DURATION_SEC` (default: 60)

Notes
- If S3 presign fails, the scripts fall back to direct backend upload.
- You can replace assets with `screen.png` or `video.mp4`; the scripts auto-detect.
