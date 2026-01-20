## Comandos para ejecutar test no funcionales

Generar events key (backend)
python manage.py prepare_load_test_event --count 50 --output ..\..\app\non_functional_tests\event_keys.json --env-file "C:\Users\andrei.flores\Documents\Proyecto U\app\non_functional_tests\.env"

Test de carga masiva
node non_functional_tests/run_load_test_massive.js --base-url https://backend-production-b180.up.railway.app

Test de carga progresiva
node non_functional_tests/run_load_test_progressive.js --base-url https://backend-production-b180.up.railway.app
