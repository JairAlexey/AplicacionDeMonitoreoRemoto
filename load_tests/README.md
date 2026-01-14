# Load Tests (Local)

This folder contains a progressive concurrency test runner for local use.

Setup
- Put a sample image and video in `Aplicacion Monitoreo/load_tests/assets/`.
  - `screen.jpg` (or .png)
  - `video.webm` (or .mp4)

Prepare data (creates event + participants and writes event keys):
```
cd "EvalTech Administrador/backend"
python manage.py prepare_load_test_event --count 50 --output "..\\..\\Aplicacion Monitoreo\\load_tests\\event_keys.json"
```

Run test:
```
node "Aplicacion Monitoreo/load_tests/run_load_test.js"
```

Run fixed concurrency (default 20):
```
node "Aplicacion Monitoreo/load_tests/run_load_test_fixed.js"
```

Config (optional environment variables):
- `BASE_URL` (default `http://127.0.0.1:8000`)
- `MAX_USERS` (default `50`)
- `STEP_USERS` (default `1`)
- `STEP_DURATION_SEC` (default `60`)
- `SCREEN_INTERVAL_MS` (default `10000`)
- `MEDIA_INTERVAL_MS` (default `15000`)
- `EVENT_KEYS_FILE` (default `Aplicacion Monitoreo/load_tests/event_keys.json`)
- `SCREEN_FILE` (default `Aplicacion Monitoreo/load_tests/assets/screen.jpg`)
- `VIDEO_FILE` (default `Aplicacion Monitoreo/load_tests/assets/video.webm`)

Fixed test config (optional environment variables):
- `CONCURRENCY` (default `20`)
- `DURATION_SEC` (default `60`)
