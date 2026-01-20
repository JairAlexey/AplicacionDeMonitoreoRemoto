## Comandos para ejecutar test no funcionales

Generar events key (backend)
python manage.py prepare_load_test_event --count 50 --output ..\\..\\app\\non_functional_tests\\event_keys.json

Test de carga masiva (fixed concurrency)
node non_functional_tests/run_load_test_massive.js

Test de carga progresiva (ramp users)
node non_functional_tests/run_load_test_progressive.js
